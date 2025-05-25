//! Pond Sim – minimal Bevy + Rapier sandbox
//! -----------------------------------------------------------------------------
//! This crate provides a **head-less physics sandbox** that Pond can run in
//! "dream/sim" mode.  The public API is intentionally tiny so that the main
//! application doesn't depend on Bevy types:
//!
//! ```rust
//! use sim::{init_headless, reset, step};
//! let mut sim = init_headless()?;
//! let obs0 = reset(&mut sim);              // initial sensor vector
//! loop {
//!     let SimStep { sensors, reward, .. } = step(&mut sim, &[0.0, 1.0]);
//! }
//! ```
//!
//! Key design points
//! -----------------
//! • **Cross-platform** – pure Rust; Bevy 0.13 + Rapier 0.26 run on Apple-silicon
//!   and Linux/Jetson.  No PhysX / CUDA dependency.
//!
//! • **Embodiment abstraction** – the current example spawns a dynamic cube so
//!   we can wire the plumbing end-to-end quickly.  The plan is to replace the
//!   cube with a URDF-driven articulated body exported from our CAD pipeline.
//!   When that happens we'll keep the public API (`reset`, `step`) unchanged –
//!   only the internal `setup()` will load a skinned mesh + joints rather than
//!   a Rapier `Collider::cuboid`.
//!
//! • **Bus integration** – if you enable the `bus` feature and pass a `Sender<
//!   Envelope>` the sim task will publish sensor values on `/sensor/*` topics
//!   and listen for `/actuator/*` commands, so `mind::act` can drive it without
//!   modification.
//!
//! Running the interactive viewer
//! -------------------------------
//! ```bash
//! # From workspace root
//! cargo run -p sim --example viewer
//! ```
//! This opens a Bevy window where you can see the cube falling onto the ground
//! plane.  Close the window to quit.
//! -----------------------------------------------------------------------------

use anyhow::Result;
use bevy::prelude::*;
use bevy_rapier3d::prelude::*;
use bevy::prelude::Mesh;
use bevy::scene::SceneSpawner;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::HashSet;
use crate::bus_types::Envelope as BusEnvelope;
use std::collections::HashMap;

#[cfg(feature = "viz")]
use rerun::{RecordingStream, archetypes::Boxes3D};

#[cfg(feature = "viz")]
#[derive(Resource)]
struct RecRes(RecordingStream);

pub struct SimHandle {
    // entity IDs etc.
}

pub struct SimStep {
    pub sensors: Vec<f32>,
    pub reward: f32,
    pub done: bool,
}

/// Minimal re-export of Pond bus `Envelope` so that the sim crate can compile standalone.
/// When the real bus crate becomes available this can be removed.
pub mod bus_types {
    #[derive(Clone)]
    pub struct Envelope {
        pub topic: String,
        pub data: Vec<u8>,
    }
}

mod mesh_store;
use mesh_store::MeshStore;

pub fn init_headless() -> Result<SimHandle> {
    App::new()
        .add_plugins(MinimalPlugins)
        .add_plugins(RapierPhysicsPlugin::<NoUserData>::default())
        .add_systems(Startup, setup)
        .run();
    Ok(SimHandle {})
}

fn setup(mut commands: Commands) {
    // ground plane
    commands.spawn(Collider::cuboid(10.0, 0.1, 10.0));
}

pub fn reset(_sim: &mut SimHandle) -> Vec<f32> { vec![0.0] }

pub fn step(_sim: &mut SimHandle, _action: &[f32]) -> SimStep {
    SimStep { sensors: vec![0.0], reward: 0.0, done: false }
}

/// Spawns a background Bevy app that steps physics and logs to Rerun.
#[cfg(feature = "viz")]
pub fn spawn_sim(rec: RecordingStream, mut bus_rx: tokio::sync::broadcast::Receiver<BusEnvelope>, tx: tokio::sync::broadcast::Sender<BusEnvelope>) {
    std::thread::spawn(move || {
        let mut app = App::new();
        app.insert_resource(Assets::<Mesh>::default());
        app.insert_resource(SceneSpawner::default());
        app.add_plugins(MinimalPlugins)
            .add_plugins(RapierPhysicsPlugin::<NoUserData>::default())
            .insert_resource(RecRes(rec.clone()))
            .add_systems(Startup, {
                move |mut commands: Commands| {
                    // ground
                    commands.spawn(Collider::cuboid(10.0, 0.1, 10.0));
                }
            });

        // Set of links already logged
        let mut logged_links: HashSet<String> = HashSet::new();
        let mut mesh_store = MeshStore::new(tx.clone());

        loop {
            // Non-blocking check for bus messages
            match bus_rx.try_recv() {
                Ok(env) if env.topic == "/description/urdf" => {
                    if let Ok(urdf) = String::from_utf8(env.data) {
                        let infos = extract_links(&urdf);
                        for (link, mesh) in infos {
                            let _ = tx.send(BusEnvelope{topic:"/log/sim".into(),data:format!("link {} mesh {:?}",link,mesh).into_bytes()});
                            if let Some(uri) = mesh.as_deref() {
                                if logged_links.insert(link.clone()) {
                                    // Try to load mesh synchronously for immediate display.
                                    if let Ok(mesh_obj) = mesh_store::load_mesh(&mesh_store::resolve(uri)) {
                                        let _ = rec.log(format!("sim/{}", link), &mesh_obj);
                                    }
                                }
                                mesh_store.ensure_logged(uri, &rec);
                            } else {
                                if logged_links.insert(link.clone()) {
                                    let geom = Boxes3D::from_half_sizes([(0.5, 0.5, 0.5)]);
                                    let _ = rec.log(format!("sim/{}", link), &geom);
                                }
                            }
                        }
                    }
                }
                Ok(_) | Err(tokio::sync::broadcast::error::TryRecvError::Lagged(_)) => {}
                Err(tokio::sync::broadcast::error::TryRecvError::Empty) => {}
                Err(tokio::sync::broadcast::error::TryRecvError::Closed) => break,
            }

            // log identity transform for each link for now
            for link in &logged_links {
                let _ = rec.log(format!("sim/{link}"), &rerun::archetypes::Transform3D::from_translation([0.0,0.0,0.0]));
            }

            app.update();
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    });
}

/// Very simple XML parsing to extract all `link` names.
fn extract_links(xml: &str) -> HashMap<String, Option<String>> {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);
    let mut buf = Vec::new();
    let mut out: HashMap<String, Option<String>> = HashMap::new();
    let mut current_link: Option<String> = None;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                if e.name().as_ref() == b"link" {
                    if let Some(link_name) = current_link.take() {
                        // Previous link without mesh
                        out.entry(link_name).or_insert(None);
                    }
                    current_link = None;
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"name" {
                            if let Ok(val) = attr.unescape_value() {
                                current_link = Some(val.to_string());
                            }
                        }
                    }
                } else if e.name().as_ref() == b"mesh" {
                    if let Some(ref link_name) = current_link {
                        let mut mesh_uri: Option<String> = None;
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"filename" {
                                if let Ok(val) = attr.unescape_value() {
                                    mesh_uri = Some(val.to_string());
                                }
                            }
                        }
                        out.insert(link_name.clone(), mesh_uri);
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => {
                if let Some(link_name) = current_link.take() {
                    out.entry(link_name).or_insert(None);
                }
                break;
            },
            _ => {}
        }
        buf.clear();
    }
    out
}