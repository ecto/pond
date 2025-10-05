# 🐸 Pond

An open-source robotics platform for building amphibious robots.

## Quick Start

### Run the Complete System

1. **Start on-robot services (mind):**

   ```bash
   cargo run -p mind
   ```

   Starts sim WS on `:8080` and map HTTP on `:8081`.

2. **Launch PAD (Pond Application Dashboard):**

   ```bash
   cargo run -p pad
   ```

   This opens the teleop and monitoring interface.

3. **Or run sim-view standalone:**
   ```bash
   cargo run -p sim-view
   ```

### Generate CAD Models

```bash
cargo run --bin generate-cad
```

Generates 3D models in `target/cad/` (STEP and STL files for 3D printing).

## Project Structure

```
pond/
├── apps/
│   ├── pad/          # Pond Application Dashboard (teleop & monitoring)
│   └── mind/         # Robot control and planning
├── crates/
│   ├── sim/          # Physics simulation + WebSocket server
│   ├── sim-view/     # 3D visualization viewer
│   ├── cad/          # CAD generation (build123d Python models)
│   ├── can/          # CAN bus communication
│   └── ...           # Vision, UI, and other utilities
└── docs/             # Documentation
```

## Components

### PAD - Pond Application Dashboard

Your primary interface for robot teleoperation and monitoring.

**Features:**

- 🎬 **Sim View**: Real-time 3D visualization with follow camera
- 🎮 **Teleop**: Manual control interface
- 📊 **Sensors**: Live sensor readings
- 🔧 **Diagnostics**: System health monitoring
- ⚙️ **Settings**: Configuration

**Backronyms** (pick your favorite!):

- **Pond Application Dashboard** - straightforward
- **Pilot's Amphibious Deck** - thematic 🐸
- **Perception And Drive** - functional
- **Personal Amphibian Director** - whimsical

See [notes/pad.md](notes/pad.md) for more details.

### sim & sim-view

- **sim**: Headless physics simulation using Bevy + Rapier3D
- **sim-view**: Standalone 3D viewer that can connect to sim server

Both can run independently or integrated into PAD.

### CAD Pipeline

3D models defined in Python (build123d) and compiled to STEP/STL:

```bash
cargo run --bin generate-cad
# Output: target/cad/step/*.step and target/cad/stl/*.stl
```

## Development

### Build Everything

```bash
cargo build --workspace
```

### Run Tests

```bash
cargo test --workspace
```

### Documentation

```bash
# Rust docs
cargo doc --open

# Project docs (in docs/)
cd docs && npm install && npm start
```

## Architecture

Pond uses a modular architecture:

1. **Hardware Layer**: CAN bus communication with actuators
2. **Simulation Layer**: Physics sim for testing without hardware
3. **Control Layer**: Planning and actuation (mind crate)
4. **Interface Layer**: PAD for human operators

See [docs/reference/architecture.mdx](docs/reference/architecture.mdx) for details.

## License

See [LICENSE.md](LICENSE.md)

## Contributing

Contributions welcome! Check out [ROADMAP.md](ROADMAP.md) for planned features.
