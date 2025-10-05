# CAN Tab in PAD

## Overview

The CAN tab in PAD provides a graphical interface for interacting with CAN bus devices, specifically RMD-L motors. It mirrors the functionality of the standalone CAN TUI.

## Features

### Three Sub-Tabs

1. **📊 Telemetry** - Real-time motor telemetry

   - Connection status indicator
   - Angle display with visual gauge (0-360°)
   - Target speed display
   - Status register readout
   - Last RX timestamp with color-coded freshness indicator
   - History tracking for angle and speed

2. **📜 Frames** - CAN frame inspection

   - Table showing last 20 frames (newest first)
   - Columns: Time, Direction (TX/RX), ID, Kind, Data
   - Scroll controls (Up, Down, Top, Bottom)
   - Frame classification (angle, speed, position, brake, etc.)
   - Supports up to 1000 frames in buffer

3. **🎮 Controls** - Motor control interface
   - Connection settings (port, motor ID, bitrate)
   - Connect/Disconnect button
   - **Motor Commands:**
     - 🔓 Release Brake (0x77)
     - 🔒 Lock Brake (0x78)
     - 🛑 Stop (0x81)
   - **Speed Control:**
     - ➖ Decrease by 5 deg/s
     - ➕ Increase by 5 deg/s
     - 0️⃣ Zero speed
   - **Position Control:**
     - 📐 Go to 90° (demo)
   - **Telemetry Reads:**
     - 📏 Read Angle (0x92)
     - 📊 Read Status2 (0x9C)
     - 🔁 Enable Active Reply (continuous angle updates @ 50ms)

## Usage

### Basic Workflow

1. Switch to CAN tab (press `3` or click "🔌 CAN")
2. Go to Controls sub-tab
3. Enter serial port (e.g., `/dev/tty.usbserial-...`)
4. Set motor ID (default: 1)
5. Select bitrate (default: 500 kbps)
6. Click "🔌 Connect"
7. Once connected, use motor control buttons
8. Switch to Telemetry tab to see live data
9. Switch to Frames tab to inspect raw CAN traffic

### Keyboard Shortcuts

- `3` - Switch to CAN tab
- Tab navigation within sub-tabs

## Architecture

### State Management

- **CanState** (Resource) - Holds connection settings, telemetry data, frames buffer
- **CanHandle** (Resource) - Thread-safe wrapper around Slcan connection
- **can_poll_system** - Bevy system that polls CAN bus and updates state

### Concurrency

The CAN connection runs in a separate thread via `Arc<Mutex<Option<Slcan>>>`:

- UI thread handles input and rendering
- Poll system reads from CAN without blocking
- Mutex ensures thread-safe access to serial port

### Frame Classification

Frames are automatically classified based on command byte:

- `0x92` - angle
- `0xA2` - speed
- `0xA4` - position
- `0x77` - brake_rel
- `0x78` - brake_lock
- `0x81` - stop
- `0xB6` - active_reply

Direction is determined by CAN ID:

- `0x140 + motor_id` - TX (host → motor)
- `0x240 + motor_id` - RX (motor → host)

## Comparison with TUI

The PAD CAN tab provides similar functionality to the standalone TUI (`cargo run -p can`) but integrated into the graphical dashboard:

| Feature        | TUI                       | PAD CAN Tab                       |
| -------------- | ------------------------- | --------------------------------- |
| Telemetry      | ✅ (Dial, gauges, charts) | ✅ (Angle gauge, text)            |
| Frames table   | ✅                        | ✅                                |
| Motor controls | ✅ (Hotkeys)              | ✅ (Buttons)                      |
| Connection UI  | ⚠️ (CLI args)             | ✅ (GUI form)                     |
| Charts         | ✅ (Angle/speed plots)    | 🚧 (History tracked, display TBD) |
| Navigation     | ✅ (Tab key)              | ✅ (Sub-tabs)                     |

## Future Enhancements

- [ ] Add angle/speed charts to Telemetry tab (using egui_plot)
- [ ] Add torque control UI
- [ ] Save/load connection presets
- [ ] Export frame log to CSV
- [ ] Add PID tuning interface
- [ ] Support multiple motors simultaneously
- [ ] Add oscilloscope-style live trace view

## RMD-L Protocol Notes

See `crates/can/src/main.rs` for full protocol documentation. Key commands:

- **0xA1** - Torque closed loop
- **0xA2** - Speed closed loop (deg/s × 100, LE i32)
- **0xA4** - Absolute multi-turn position (deg × 100, LE i32)
- **0x92** - Read multi-turn angle
- **0x9C** - Read status2
- **0xB6** - Active Reply configuration

## Related Files

- `apps/pad/src/can_tab.rs` - CAN tab implementation
- `apps/pad/src/main.rs` - Tab integration
- `crates/can/src/lib.rs` - Slcan protocol implementation
- `crates/can/src/main.rs` - Standalone TUI
