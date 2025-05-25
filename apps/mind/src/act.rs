use std::collections::HashMap;
use std::time::{Duration, Instant};
use std::sync::Arc;

use tokio::sync::broadcast::{Receiver, Sender};
use tokio::time::{sleep_until as tokio_sleep_until, Sleep, Instant as TokioInstant};

use crate::bus::Envelope;
use koi::policy::{DefaultPolicy, NullPolicy};

/// Spawns the Act (fast, System-1) control loop.
///
/// * `tx` – broadcast sender for publishing actuator commands.
/// * `rx` – receiver for subscribing to all bus traffic (sensors, etc.).
pub fn spawn_act(tx: Sender<Envelope>, mut rx: Receiver<Envelope>) {
    tokio::spawn(async move {
        let mut sensors: HashMap<String, Vec<u8>> = HashMap::new();
        let tick = Duration::from_millis(20); // 50 Hz
        let mut next_tick = Instant::now() + tick;

        // Load policy model (path via KOI_ACT_MODEL)
        let policy: Arc<dyn koi::policy::PolicyModel> = {
            let model_path = std::env::var("KOI_ACT_MODEL").ok();
            if let Some(p) = model_path {
                match DefaultPolicy::load(&p) {
                    Ok(m) => Arc::new(m),
                    Err(e) => {
                        eprintln!("[act] Failed to load policy '{p}': {e}. Falling back to NullPolicy");
                        Arc::new(NullPolicy)
                    }
                }
            } else {
                Arc::new(NullPolicy)
            }
        };

        loop {
            tokio::select! {
                // Gather incoming sensor data
                msg = rx.recv() => {
                    if let Ok(env) = msg {
                        if env.topic.starts_with("/sensor/") {
                            sensors.insert(env.topic.clone(), env.data.clone());
                        }
                    }
                }

                _ = sleep_until(next_tick) => {
                    run_control_step(&policy, &sensors, &tx);
                    next_tick += tick;
                }
            }
        }
    });
}

fn sleep_until(deadline: Instant) -> Sleep {
    let tokio_deadline: TokioInstant = deadline.into();
    tokio_sleep_until(tokio_deadline)
}

/// Placeholder low-level controller mapping temperature to fan speed.
fn run_control_step(policy: &std::sync::Arc<dyn koi::policy::PolicyModel>, sensors: &HashMap<String, Vec<u8>>, tx: &Sender<Envelope>) {
    if let Some(bytes) = sensors.get("/sensor/temp_sensor") {
        if bytes.len() == 4 {
            let temp = f32::from_le_bytes(bytes.clone().try_into().unwrap());
            let input = [temp];
            let output = policy.infer(&input).unwrap_or_else(|_| vec![0.0]);
            let speed = output.get(0).copied().unwrap_or(0.0).clamp(0.0, 1.0);
            let payload = speed.to_le_bytes();
            let _ = tx.send(Envelope {
                topic: "/actuator/fan".into(),
                data: payload.to_vec(),
            });
        }
    }
}