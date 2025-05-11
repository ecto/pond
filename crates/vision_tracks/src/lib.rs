use std::sync::Arc;

use anyhow::Result;
use futures::future::pending;
use tokio::task::JoinHandle;
use vision_common::{Bus, GpuContext};

/// Spawns the optical-flow/feature tracks service task (stub).
pub fn spawn(_bus: &Bus, _gpu: Arc<GpuContext>) -> Result<JoinHandle<()>> {
    let handle = tokio::spawn(async move {
        log::info!(target: "vision_tracks", "Service started (stub)");
        pending::<()>().await;
    });
    Ok(handle)
}