pub mod messages {
    use serde::{Deserialize, Serialize};

    // All messages share a timestamp in nanoseconds since boot.
    #[derive(Clone, Copy, Debug, Serialize, Deserialize)]
    pub struct Timestamp {
        pub t: u64,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct RgbFrame {
        pub t: u64,
        // Stub: RGB bytes, width/height omitted for now.
        pub data: Vec<u8>,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct GrayFrame {
        pub t: u64,
        pub data: Vec<u8>,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct SegMask8 {
        pub t: u64,
        pub data: Vec<u8>,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct Det3DArray {
        pub t: u64,
        pub detections: Vec<()>, // stub
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct TagArray {
        pub t: u64,
        pub tags: Vec<()>,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct TrackBatch {
        pub t: u64,
        pub tracks: Vec<()>,
    }
}

use std::sync::Arc;

/// Stub bus type based on flume channels.  Replace with real implementation later.
#[derive(Clone)]
pub struct Bus {
    pub tx: flume::Sender<Vec<u8>>, // postcard-encoded payloads
    pub rx: flume::Receiver<Vec<u8>>,
}

impl Bus {
    pub fn new() -> Self {
        let (tx, rx) = flume::unbounded();
        Bus { tx, rx }
    }
}

/// Placeholder GPU context (e.g. wgpu device, queue, etc.).
#[derive(Default, Clone)]
pub struct GpuContext;

/// Models of supported cameras – allows selection at runtime/config.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CameraModel {
    OakDS2,
    OakDProW,
    Gemini2XL,
}

impl CameraModel {
    pub const ALL: [CameraModel; 3] = [Self::OakDS2, Self::OakDProW, Self::Gemini2XL];

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OakDS2 => "OAK-D-S2",
            Self::OakDProW => "OAK-D Pro-W",
            Self::Gemini2XL => "Gemini 2 XL",
        }
    }
}

/// Simple helper to wrap a type in `Arc` – useful for unit tests.
pub fn shared<T>(value: T) -> Arc<T> {
    Arc::new(value)
}