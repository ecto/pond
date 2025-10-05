# Pond Quick Start

Get up and running with Pond's teleop and monitoring system in 2 minutes!

## 1. Start the Simulation Server

```bash
cargo run --bin server --features server -p sim
```

You should see:

```
🐸 Starting Pond Simulation Server
🐸 Pond Sim Server listening on 0.0.0.0:8080
```

## 2. Launch PAD

In a new terminal:

```bash
cargo run -p pad
```

A window will open showing a green cube bouncing in 3D! 🎉

## 3. Explore the Interface

**Tabs** (click or press number keys):

- `1` - 🎬 Sim View (default) - 3D visualization
- `2` - 🎮 Teleop - Control interface
- `3` - 📊 Sensors - Live data
- `4` - 🔧 Diagnostics - System health
- `5` - ⚙️ Settings - Configuration

## Alternative: Standalone Viewer

For lightweight visualization without the full UI:

```bash
# Terminal 1
cargo run --bin server --features server -p sim

# Terminal 2
cargo run -p sim-view
```

## What's Happening?

1. **Sim Server** runs a physics simulation (Bevy + Rapier3D)
2. It broadcasts robot state over WebSocket at 60 FPS
3. **PAD** or **sim-view** connects and visualizes the state in 3D

## Next Steps

- Read the [System Overview](docs/guides/system-overview.mdx)
- Try [PAD Quick Start](docs/guides/pad-quickstart.mdx)
- Explore the [Architecture](docs/reference/architecture.mdx)

## Backronyms for PAD 🐸

Pick your favorite interpretation:

- **Pond Application Dashboard** (straightforward)
- **Pilot's Amphibious Deck** (thematic)
- **Perception And Drive** (functional)
- **Personal Amphibian Director** (whimsical)

---

**Having issues?** Check the [System Overview](docs/guides/system-overview.mdx) troubleshooting section.
