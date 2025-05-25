use anyhow::Result;
use clap::Parser;
use rerun::{RecordingStream, RecordingStreamBuilder, MemoryLimit, TextLog, Scalars};
use re_web_viewer_server::WebViewerServerPort;
use tokio::time::{sleep, Duration};

use tonic::transport::Server;
use tokio::net::UnixListener;
use tokio_stream::wrappers::UnixListenerStream;

use tokio_stream::StreamExt;

use prost::Message;
use colored::Colorize;

pub mod bus {
    include!(concat!(env!("OUT_DIR"), "/bus.rs"));
}

use bus::bus_server::{Bus, BusServer};
use bus::{PublishRequest, PublishReply, SubscribeRequest, Envelope, DeviceDescriptor, DevicesReply, Goal, Empty};
use tokio::sync::broadcast;
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::broadcast::Sender;

mod act;
mod plan;
mod dream;
mod debug_mode;
mod morphology;
// external crate `sim` is used via Cargo dependency

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Path for the Unix Domain Socket used for the internal bus.
    #[arg(long, default_value = "/tmp/mind.sock")]
    uds_path: String,

    /// gRPC port for optional external access (default: 0 = disabled)
    #[arg(long, default_value_t = 0)]
    grpc_port: u16,

    /// HTTP port for the Rerun Web viewer (default: 9090)
    #[arg(long, default_value_t = 9090)]
    web_port: u16,

    /// Disable automatically opening the browser when the web viewer starts.
    #[arg(long, default_value_t = false)]
    no_browser: bool,

    /// Operational mode: awake, dream, debug
    #[arg(long, default_value = "awake")]
    mode: String,
}

struct BusImpl {
    tx: broadcast::Sender<Envelope>,
    registry: Arc<DashMap<String, DeviceDescriptor>>, // device id -> descriptor
    goal: tokio::sync::RwLock<Option<Goal>>,
}

#[tonic::async_trait]
impl Bus for BusImpl {
    async fn publish(&self, request: tonic::Request<PublishRequest>) -> Result<tonic::Response<PublishReply>, tonic::Status> {
        let PublishRequest { topic, data } = request.into_inner();

        // If this is a device announcement, decode and store in registry.
        if topic == "/device/announce" {
            if let Ok(desc) = DeviceDescriptor::decode(&*data) {
                self.registry.insert(desc.id.clone(), desc);
            }
        }

        let env = Envelope { topic, data };
        let _ = self.tx.send(env);
        Ok(tonic::Response::new(PublishReply { ok: true }))
    }

    type SubscribeStream = std::pin::Pin<Box<dyn tokio_stream::Stream<Item = Result<Envelope, tonic::Status>> + Send>>;

    async fn subscribe(&self, request: tonic::Request<SubscribeRequest>) -> Result<tonic::Response<Self::SubscribeStream>, tonic::Status> {
        let SubscribeRequest { .. } = request.into_inner();
        let rx = self.tx.subscribe();
        let stream = tokio_stream::wrappers::BroadcastStream::new(rx)
            .filter_map(|res| match res {
                Ok(env) => Some(Ok(env)),
                Err(_) => None, // lagged; skip
            });
        Ok(tonic::Response::new(Box::pin(stream)))
    }

    async fn get_devices(&self, _req: tonic::Request<Empty>) -> Result<tonic::Response<DevicesReply>, tonic::Status> {
        let list: Vec<DeviceDescriptor> = self
            .registry
            .iter()
            .map(|kv| kv.value().clone())
            .collect();
        Ok(tonic::Response::new(DevicesReply { devices: list }))
    }

    async fn set_goal(&self, req: tonic::Request<Goal>) -> Result<tonic::Response<PublishReply>, tonic::Status> {
        let goal = req.into_inner();
        {
            let mut w = self.goal.write().await;
            *w = Some(goal.clone());
        }
        // broadcast goal to interested tasks
        let _ = self.tx.send(Envelope { topic: "/goal".into(), data: goal.text.as_bytes().to_vec() });
        Ok(tonic::Response::new(PublishReply { ok: true }))
    }

    async fn get_goal(&self, _req: tonic::Request<Empty>) -> Result<tonic::Response<Goal>, tonic::Status> {
        let g = { self.goal.read().await.clone() };
        Ok(tonic::Response::new(g.unwrap_or(Goal { text: String::new() })))
    }
}

/// Spawns a background task that simulates a temperature sensor publishing data every 100ms.
fn spawn_simulated_sensor(tx: Sender<Envelope>) {
    tokio::spawn(async move {
        // Create and broadcast device descriptor once.
        let desc = DeviceDescriptor {
            id: "temp_sensor".into(),
            kind: 0, // SENSOR
            data_type: "float32".into(),
            tags: vec!["temperature".into()],
        };
        let mut buf = Vec::new();
        desc.encode(&mut buf).unwrap();
        let _ = tx.send(Envelope { topic: "/device/announce".into(), data: buf });

        // Publish readings
        let mut t: f32 = 20.0;
        loop {
            t += 0.1;
            let payload = t.to_le_bytes();
            let _ = tx.send(Envelope { topic: "/sensor/temp_sensor".into(), data: payload.to_vec() });
            sleep(Duration::from_millis(100)).await;
        }
    });
}

/// Spawn a task that listens to the bus and logs messages to Rerun.
fn spawn_bus_logger(rec: RecordingStream, mut rx: broadcast::Receiver<Envelope>) {
    tokio::spawn(async move {
        while let Ok(env) = rx.recv().await {
            let topic = env.topic.as_str();
            match topic {
                "/device/announce" => {
                    if let Ok(desc) = DeviceDescriptor::decode(&*env.data) {
                        let entity = format!("device/{}", desc.id);
                        let text = format!("kind={} data_type={} tags={:?}", desc.kind, desc.data_type, desc.tags);
                        let _ = rec.log(entity.as_str(), &TextLog::new(text));
                    }
                }
                "/goal" => {
                    if let Ok(text) = String::from_utf8(env.data.clone()) {
                        let _ = rec.log("goal", &TextLog::new(text));
                    }
                }
                _ if topic.starts_with("/sensor/") => {
                    let sensor_id = &topic[8..]; // after "/sensor/"
                    if env.data.len() == 4 {
                        let val = f32::from_le_bytes(env.data[..4].try_into().unwrap()) as f64;
                        let _ = rec.log(
                            format!("sensor/{}", sensor_id),
                            &Scalars::new([val]),
                        );
                    }
                }
                _ => {
                    // For any other topic: try UTF-8 decode first, else log raw bytes as a hex string.
                    let entity_path = format!("bus{}", topic); // e.g. topic "/foo" -> "bus/foo"

                    if let Ok(text) = String::from_utf8(env.data.clone()) {
                        let _ = rec.log(entity_path.as_str(), &TextLog::new(text));
                    } else {
                        let hex = env.data.iter().map(|b| format!("{:02X}", b)).collect::<String>();
                        let _ = rec.log(entity_path.as_str(), &TextLog::new(hex));
                    }
                }
            }
        }
    });
}

#[tokio::main(flavor = "multi_thread")] // multithreaded runtime
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize Rerun viewer/server
    let rec = start_rerun(cli.grpc_port, cli.web_port, !cli.no_browser)?;

    // Initialize broadcast bus
    let (tx, _) = broadcast::channel(1024);
    spawn_simulated_sensor(tx.clone());

    // Pipe all bus traffic into Rerun for visualization.
    spawn_bus_logger(rec.clone(), tx.subscribe());

    // Bridge Pond bus envelopes into sim-local type.
    let (sim_tx, _) = broadcast::channel(1024);
    // Forward in background
    {
        let mut fwd_rx = tx.subscribe();
        let sim_tx_fwd = sim_tx.clone();
        tokio::spawn(async move {
            while let Ok(env) = fwd_rx.recv().await {
                let _ = sim_tx_fwd.send(sim::bus_types::Envelope { topic: env.topic.clone(), data: env.data.clone() });
            }
        });
    }

    // Forward diagnostics from sim back to main bus for Rerun visualization
    {
        let mut diag_rx = sim_tx.subscribe();
        let tx_out = tx.clone();
        tokio::spawn(async move {
            while let Ok(env) = diag_rx.recv().await {
                // only relay /log/sim namespace to avoid loops
                if env.topic.starts_with("/log/") {
                    let _ = tx_out.send(bus::Envelope { topic: env.topic.clone(), data: env.data.clone() });
                }
            }
        });
    }

    // Spawn simulation visualization
    sim::spawn_sim(rec.clone(), sim_tx.subscribe(), sim_tx.clone());

    let bus_service = BusServer::new(BusImpl {
        tx: tx.clone(),
        registry: Arc::new(DashMap::new()),
        goal: tokio::sync::RwLock::new(None),
    });

    // Remove old socket if present
    let _ = std::fs::remove_file(&cli.uds_path);
    let uds = std::os::unix::net::UnixListener::bind(&cli.uds_path)?;
    uds.set_nonblocking(true)?;
    let uds = UnixListener::from_std(uds)?;
    let incoming = UnixListenerStream::new(uds);

    // Spawn gRPC server on UDS; it will share Tokio runtime threads
    tokio::spawn(async move {
        if let Err(e) = Server::builder().add_service(bus_service).serve_with_incoming(incoming).await {
            eprintln!("gRPC UDS server error: {e}");
        }
    });

    println!("Mind bus listening on {}", cli.uds_path);

    // Spawn reflex (System-1) control loop.
    match cli.mode.to_ascii_lowercase().as_str() {
        "awake" | "" => {
            // Awake mode runs both fast reflex and slower planning loops.
            act::spawn_act(tx.clone(), tx.subscribe());
            morphology::spawn_morphology(tx.clone(), tx.subscribe());
            plan::spawn_plan(tx.clone(), tx.subscribe());
        }
        "dream" => {
            dream::spawn_dream(tx.clone(), tx.subscribe());
        }
        "debug" => {
            debug_mode::spawn_debug(tx.clone(), tx.subscribe());
        }
        other => {
            eprintln!("Unknown mode: {other}. Falling back to 'awake'.");
            act::spawn_act(tx.clone(), tx.subscribe());
            morphology::spawn_morphology(tx.clone(), tx.subscribe());
            plan::spawn_plan(tx.clone(), tx.subscribe());
        }
    }

    // Keep alive
    loop {
        sleep(Duration::from_secs(3600)).await;
    }
}

fn start_rerun(grpc_port: u16, web_port: u16, open_browser: bool) -> Result<RecordingStream> {
    // Spawn a local Rerun gRPC server and accompanying web viewer.
    // If `web_port` or `grpc_port` is 0, the OS will auto-select a free port.
    // We buffer up to 25 % of total system memory for late-connecting viewers.

    // If the user didn't specify a gRPC port (0 = auto), fall back to Rerun's default.
    // Using 0 causes the web viewer URL to be rendered with port 0, leading to connection errors.
    let grpc_port = if grpc_port == 0 {
        rerun::DEFAULT_SERVER_PORT
    } else {
        grpc_port
    };

    let rec = RecordingStreamBuilder::new("pond_mind").serve_web(
        "0.0.0.0",                                 // bind on all interfaces
        WebViewerServerPort(web_port),             // HTTP port for web assets
        grpc_port,                                 // gRPC port for log streaming
        MemoryLimit::from_fraction_of_total(0.25), // buffer limit
        open_browser,                              // auto-open browser if requested
    )?;

    let web_desc = if web_port == 0 {
        "auto".to_string()
    } else {
        web_port.to_string()
    };
    let grpc_desc = if grpc_port == 0 {
        "auto".to_string()
    } else {
        grpc_port.to_string()
    };

    println!(
        "{} Rerun server started – web: {}  gRPC: {}",
        "[rerun]".bright_cyan(),
        web_desc,
        grpc_desc,
    );

    Ok(rec)
}