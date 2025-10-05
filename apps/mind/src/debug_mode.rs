use crate::bus::Envelope;
use tokio::sync::broadcast::{self, Sender};

/// Spawns Debug mode task.
///
/// Prints every bus envelope with topic and payload length. Useful for inspecting
/// traffic without the separate --log-all flag.
pub fn spawn_debug(_tx: Sender<Envelope>, mut rx: broadcast::Receiver<Envelope>) {
    tokio::spawn(async move {
        while let Ok(env) = rx.recv().await {
            let preview = if env.data.len() <= 64 {
                String::from_utf8(env.data.clone()).unwrap_or_else(|_| format!("{:?}", &env.data[..]))
            } else {
                format!("{} bytes", env.data.len())
            };
            println!("[debug] topic={} payload={}", env.topic, preview);
        }
    });
}