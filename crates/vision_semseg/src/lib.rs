use std::sync::Arc;

use anyhow::Result;
use futures::future::pending;
use tokio::task::JoinHandle;
use vision_common::{Bus, GpuContext};

/// Spawns the semantic-segmentation service task.
///
/// Currently this is a stub that blocks forever; replace the body with the
/// actual FastSCNN inference pipeline once models and GPU context are ready.
pub fn spawn(_bus: &Bus, _gpu: Arc<GpuContext>) -> Result<JoinHandle<()>> {
    let handle = tokio::spawn(async move {
        log::info!(target: "vision_semseg", "Service started (stub)");
        pending::<()>().await;
    });
    Ok(handle)
}