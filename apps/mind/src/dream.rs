use std::time::Duration;

use tokio::sync::broadcast::{Receiver, Sender};
use tokio::time::sleep;

use crate::bus::Envelope;

/// Spawns the Dream mode task.
///
/// In the future this could perform offline learning, log replay, etc. Currently it
/// simply prints a placeholder message at a slow interval so we can observe that
/// the mode switch is functioning.
pub fn spawn_dream(_tx: Sender<Envelope>, mut _rx: Receiver<Envelope>) {
    tokio::spawn(async move {
        loop {
            println!("[dream] 💤 ... processing memories");
            sleep(Duration::from_secs(5)).await;
        }
    });
}