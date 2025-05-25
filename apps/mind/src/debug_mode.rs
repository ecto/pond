use tokio::sync::broadcast::{Receiver, Sender};
use colored::Colorize;
use tokio::time::Duration;

use crate::bus::Envelope;

/// Spawns Debug mode task.
///
/// Prints every bus envelope with topic and payload length. Useful for inspecting
/// traffic without the separate --log-all flag.
pub fn spawn_debug(_tx: Sender<Envelope>, mut rx: Receiver<Envelope>) {
    tokio::spawn(async move {
        println!("[debug] Dumping all bus traffic");
        while let Ok(env) = rx.recv().await {
            let preview_len = env.data.len().min(16);
            let mut preview = env.data[..preview_len]
                .iter()
                .map(|b| format!("{:02X}", b))
                .collect::<Vec<_>>()
                .join(" ");
            if env.data.len() > preview_len {
                preview.push_str(" …");
            }

            println!(
                "[DBG BUS] {} ({} bytes) {}",
                env.topic.green(),
                env.data.len(),
                preview.cyan()
            );

            // Throttle a bit if console is overwhelmed
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    });
}