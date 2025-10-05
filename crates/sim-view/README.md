# sim-view

3D visualization component for Pond simulation state.

## Features

- Real-time 3D rendering of robot and environment
- Third-person camera that follows the robot
- Ground grid and coordinate axes
- WebSocket client for connecting to sim server
- Can run standalone or be embedded in other applications (like PAD)

## Usage

### Standalone

```bash
# Connect to local server
cargo run -p sim-view

# Connect to remote server
cargo run -p sim-view -- --server ws://192.168.1.100:8080

# Disable camera following
cargo run -p sim-view -- --no-follow

# Minimal view (no grid or axes)
cargo run -p sim-view -- --no-grid --no-axes
```

### As a Library

```rust
use sim_view::{sim_view_app, SimViewConfig};

fn main() {
    let config = SimViewConfig {
        server_address: "ws://localhost:8080".to_string(),
        follow_robot: true,
        show_grid: true,
        show_axes: true,
    };

    let mut app = sim_view_app(config);
    app.run();
}
```

## Architecture

sim-view is a thin client that:

1. Connects to a sim server via WebSocket
2. Receives `SimState` updates (position, rotation, joint angles)
3. Renders the robot and environment in 3D using Bevy
4. Updates camera position to follow the robot

## Components

- `SimViewConfig` - Configuration resource
- `RobotMarker` - Component marking the robot entity
- `FollowCamera` - Component for third-person camera behavior
- `SimState` - State message received from server

## Integration with PAD

PAD embeds sim-view as its first tab. The integration reuses sim-view's:

- Camera systems
- Rendering setup
- Configuration structs

This keeps the codebase DRY while allowing sim-view to function independently.
