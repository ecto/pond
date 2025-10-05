# PAD - Pond Application Dashboard

## Overview

PAD is the teleop and monitoring system for Pond robots. It provides a unified interface for:

- Real-time 3D simulation visualization
- Manual teleoperation controls
- Sensor monitoring
- System diagnostics

## Backronyms

Choose your favorite interpretation of PAD:

1. **Pond Application Dashboard** - straightforward and functional
2. **Pond Actuator Display** - emphasizes the control aspect
3. **Pilot's Amphibious Deck** - playful maritime/frog theme 🐸
4. **Perception And Drive** - highlights the two main functions
5. **Proximal Adaptive Device** - technical/robotics focused
6. **Platform for Autonomous Deployment** - enterprise-y
7. **Personal Amphibian Director** - whimsical
8. **Pilot Assist Device** - simple and clear
9. **Pond Admin Dashboard** - emphasizes system monitoring

## Architecture

PAD is built with:

- **Bevy**: Game engine for 3D rendering
- **bevy_egui**: Immediate mode UI for tabs and controls
- **bevy_rapier3d**: Physics simulation
- **sim-view**: Integrated 3D viewer component

### Components

```
┌─────────────────────────────────────────┐
│        PAD Application Window           │
├─────────────────────────────────────────┤
│ 🐸 PAD │ 🎬 Sim View │ 🎮 Teleop │...  │ ← Tab Bar
├─────────────────────────────────────────┤
│                                         │
│         Active Tab Content              │
│    (3D view, controls, sensors, etc)    │
│                                         │
└─────────────────────────────────────────┘
```

### Tabs

1. **🎬 Sim View** - Real-time 3D visualization

   - Third-person camera following robot
   - Grid and coordinate axes
   - Physics visualization

2. **🎮 Teleop** - Manual control interface

   - Direction controls
   - Speed adjustment
   - Emergency stop

3. **🔌 CAN** - CAN bus motor control (NEW!)

   - Sub-tabs: Telemetry, Frames, Controls
   - Connect to RMD-L motors via serial
   - Real-time angle/speed monitoring
   - Frame inspection and logging
   - Motor commands (brake, speed, position)
   - See [pad_can.md](pad_can.md) for details

4. **📊 Sensors** - Real-time sensor data

   - IMU readings
   - Position/orientation
   - Battery status

5. **🔧 Diagnostics** - System health monitoring

   - Connection status
   - Motor health
   - Error logs

6. **⚙️ Settings** - Configuration
   - Server address
   - Display options
   - Control preferences

## Usage

### Run PAD

```bash
# Default (connects to localhost:8080)
cargo run -p pad

# Specify server
cargo run -p pad -- --server ws://192.168.1.100:8080

# Fullscreen mode
cargo run -p pad -- --fullscreen
```

### Keyboard Shortcuts

- `1-6`: Quick switch between tabs
  - `1` - Sim View
  - `2` - Teleop
  - `3` - CAN
  - `4` - Sensors
  - `5` - Diagnostics
  - `6` - Settings
- Arrow keys: Camera/robot control (depending on tab)
- `Esc`: Exit

## Development

### Adding a New Tab

1. Add enum variant to `PadTab` in `main.rs`
2. Implement `show_your_tab(ui)` function
3. Add to the tab bar and match statement

### Connecting to Real Hardware

PAD communicates with the simulation server over WebSocket. To connect to a real robot:

1. Ensure the robot is running the sim server (or equivalent bridge)
2. Use `--server` flag with the robot's IP address
3. The protocol is the same whether sim or real hardware

## Related Crates

- `sim` - Simulation physics and server
- `sim-view` - Standalone 3D viewer (can be used independently)
- `can` - CAN bus communication for real hardware
