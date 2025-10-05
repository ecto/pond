//! WebSocket server for broadcasting simulation state
//!
//! This module provides a WebSocket server that clients like sim-view can
//! connect to for receiving real-time simulation state updates.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::CorsLayer;

/// Simulation state that gets broadcast to all connected clients
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimState {
    pub robot_position: [f32; 3],
    pub robot_rotation: [f32; 4], // quaternion (w, x, y, z)
    pub joint_positions: Vec<f32>,
    pub timestamp: f64,
}

impl Default for SimState {
    fn default() -> Self {
        Self {
            robot_position: [0.0, 1.0, 0.0],
            robot_rotation: [1.0, 0.0, 0.0, 0.0],
            joint_positions: Vec::new(),
            timestamp: 0.0,
        }
    }
}

/// Shared state for the simulation server
#[derive(Clone)]
pub struct ServerState {
    pub sim_state: Arc<RwLock<SimState>>,
    pub tx: broadcast::Sender<SimState>,
}

impl ServerState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self {
            sim_state: Arc::new(RwLock::new(SimState::default())),
            tx,
        }
    }

    /// Update the simulation state and broadcast to all clients
    pub async fn update_state(&self, state: SimState) {
        *self.sim_state.write().await = state.clone();
        let _ = self.tx.send(state);
    }
}

/// Create and configure the Axum router for the sim server
pub fn create_router(state: ServerState) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(health_check))
        .with_state(state)
        .layer(CorsLayer::permissive())
}

/// Health check endpoint
async fn health_check() -> &'static str {
    "OK"
}

/// WebSocket upgrade handler
async fn ws_handler(ws: WebSocketUpgrade, State(state): State<ServerState>) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Handle an individual WebSocket connection
async fn handle_socket(mut socket: WebSocket, state: ServerState) {
    // Send initial state
    if let Ok(current_state) = serde_json::to_string(&*state.sim_state.read().await) {
        if socket.send(Message::Text(current_state)).await.is_err() {
            return;
        }
    }

    // Subscribe to state updates
    let mut rx = state.tx.subscribe();

    loop {
        tokio::select! {
            // Receive state updates and forward to client
            Ok(sim_state) = rx.recv() => {
                if let Ok(json) = serde_json::to_string(&sim_state) {
                    if socket.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
            }
            // Handle incoming messages from client (for future control commands)
            Some(Ok(msg)) = socket.recv() => {
                match msg {
                    Message::Close(_) => break,
                    Message::Ping(data) => {
                        if socket.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    _ => {
                        // Future: handle control commands from client
                    }
                }
            }
            else => break,
        }
    }
}

/// Start the WebSocket server
pub async fn start_server(addr: &str, state: ServerState) -> anyhow::Result<()> {
    let app = create_router(state);
    let listener = tokio::net::TcpListener::bind(addr).await?;

    println!("🐸 Pond Sim Server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}

