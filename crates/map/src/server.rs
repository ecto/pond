use axum::{routing::{get, post, delete}, Router, extract::{Path, State}, Json};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

use crate::{BBox3, Tag, TileBlob, TileMeta};

#[derive(Clone, Default)]
struct AppStateInner {
    tags: Vec<Tag>,
}

#[derive(Clone, Default)]
pub struct AppState(Arc<RwLock<AppStateInner>>);

pub fn router() -> Router {
    Router::new()
        .route("/health", get(|| async { "OK" }))
        .route("/maps/:map_id/index", post(index))
        .route("/maps/:map_id/tags/query", post(query_tags))
        .route("/maps/:map_id/tags", post(put_tag))
        .route("/maps/:map_id/tags/:tag_id", delete(delete_tag))
        .route("/maps/:map_id/tiles/:lod/:x/:y/:z", get(get_tile))
        .with_state(AppState::default())
        .layer(CorsLayer::permissive())
}

#[derive(Deserialize)]
struct TileParams {
    _lod: u8,
    _x: i32,
    _y: i32,
    _z: i32,
}

async fn get_tile(Path((_map_id, _params)): Path<(String, TileParams)>) -> Json<TileBlob> {
    // Stub: serve empty tile blob (client handles absence gracefully)
    let blob = TileBlob { data: Vec::new() };
    Json(blob)
}

async fn index(Path((_map_id,)): Path<(String,)>, Json(_bbox): Json<BBox3>) -> Json<Vec<TileMeta>> {
    Json(vec![])
}

async fn query_tags(State(state): State<AppState>, Path((_map_id,)): Path<(String,)>, Json(_bbox): Json<BBox3>) -> Json<Vec<Tag>> {
    let s = state.0.read().await;
    Json(s.tags.clone())
}

async fn put_tag(State(state): State<AppState>, Path((_map_id,)): Path<(String,)>, Json(tag): Json<Tag>) {
    let mut s = state.0.write().await;
    let i = s.tags.iter().position(|t| t.id == tag.id);
    if let Some(i) = i { s.tags[i] = tag; } else { s.tags.push(tag); }
}

async fn delete_tag(State(state): State<AppState>, Path((_map_id, tag_id)): Path<(String, String)>) {
    if let Ok(id) = uuid::Uuid::parse_str(&tag_id) {
        let mut s = state.0.write().await;
        s.tags.retain(|t| t.id != id);
    }
}


