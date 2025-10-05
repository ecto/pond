//! Pond Map crate: Server + Client
//! - Stores and serves long-term world data (tiles + tags)
//! - Lightweight client for fetching/querying

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type MapId = Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Layer {
    Splats,
    Mesh,
    Occ,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileId {
    pub lod: u8,
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub layer: Layer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BBox3 {
    pub min: [f64; 3],
    pub max: [f64; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileMeta {
    pub id: TileId,
    pub bbox: BBox3,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileBlob {
    /// Zstd-compressed payload; format TBD (flatbuffers/protobuf later)
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: Uuid,
    pub class: String,
    pub pose: [f64; 7], // xyz + quaternion (wxyz)
    pub attrs: serde_json::Value,
    /// Optional 6x6 covariance (row-major); use Vec to ease serde
    pub covariance: Option<Vec<f64>>, // expected length 36 when present
}

#[cfg(feature = "client")]
pub mod client;

#[cfg(feature = "server")]
pub mod server;


