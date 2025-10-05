//! Pond Simulation Server
//!
//! Runs a headless simulation with a WebSocket server for remote visualization.

use sim::server::{start_server, ServerState, SimState};
use std::time::Duration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("🐸 Starting Pond Simulation Server");

    let state = ServerState::new();
    let state_clone = state.clone();

    // Spawn the web server
    let _server_handle = tokio::spawn(async move {
        start_server("0.0.0.0:8080", state_clone)
            .await
            .expect("Server failed");
    });

    // Simulation loop - update state periodically
    let mut time: f64 = 0.0;
    loop {
        tokio::time::sleep(Duration::from_millis(16)).await; // ~60 FPS

        time += 0.016;

        // Simple test: make the robot bounce up and down
        let y = 1.0 + (time * 2.0).sin().abs() * 2.0;

        let new_state = SimState {
            robot_position: [0.0, y as f32, 0.0],
            robot_rotation: [1.0, 0.0, 0.0, 0.0],
            joint_positions: vec![],
            timestamp: time,
        };

        state.update_state(new_state).await;
    }

    // Note: server_handle.await is unreachable since the loop never exits
    // In a real system, you'd want to handle shutdown signals
}

