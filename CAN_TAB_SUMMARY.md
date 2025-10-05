# CAN Tab Integration Complete! 🎉

## What Was Added

A new **🔌 CAN** tab has been integrated into PAD that mirrors the functionality of the standalone CAN TUI.

### Features

#### Three Sub-Tabs

1. **📊 Telemetry**

   - Connection status indicator
   - Real-time angle display with visual gauge (0-360°)
   - Target speed display
   - Status register readout
   - Last RX timestamp with color coding (green/yellow/red)
   - History tracking for angle and speed data

2. **📜 Frames**

   - Scrollable table of last 20 CAN frames (newest first)
   - Columns: Time, Direction (TX/RX), ID, Kind, Data
   - Scroll controls (⬆ ⬇ 🔝 🔚)
   - Automatic frame classification
   - Maintains buffer of last 1000 frames

3. **🎮 Controls**

   - **Connection UI:**

     - Port selection (text input)
     - Motor ID (drag value 1-32)
     - Bitrate selection (1M, 500k, 250k, 125k)
     - Connect/Disconnect button

   - **Motor Commands:**

     - 🔓 Release Brake (0x77)
     - 🔒 Lock Brake (0x78)
     - 🛑 Stop (0x81)

   - **Speed Control:**

     - ➖ -5 deg/s
     - ➕ +5 deg/s
     - 0️⃣ Zero speed

   - **Position Control:**

     - 📐 Go to 90° (demo command)

   - **Telemetry Reads:**
     - 📏 Read Angle (0x92)
     - 📊 Read Status2 (0x9C)
     - 🔁 Enable Active Reply (continuous updates @ 50ms)

## Technical Implementation

### New Files

1. **`apps/pad/src/can_tab.rs`** - CAN tab implementation

   - `CanState` resource for state management
   - `CanHandle` resource for thread-safe serial communication
   - `can_poll_system` for non-blocking CAN polling
   - Helper functions for motor commands

2. **`notes/pad_can.md`** - Comprehensive documentation

### Modified Files

1. **`apps/pad/src/main.rs`**

   - Added `PadTab::Can` variant
   - Integrated `CanState` and `CanHandle` resources
   - Added `can_poll_system` to update loop
   - Added UI rendering for CAN tab and sub-tabs
   - Updated keyboard shortcuts (now 1-6)

2. **`apps/pad/Cargo.toml`**

   - Added dependency on `can` crate
   - Added `anyhow` for error handling

3. **`crates/can/src/lib.rs`**

   - Added `PartialEq` and `Eq` to `Bitrate` for UI combo box

4. **`notes/pad.md`**
   - Updated tab documentation
   - Updated keyboard shortcuts

## Usage

```bash
# Run PAD
cargo run -p pad

# Press 3 to switch to CAN tab
# Go to Controls sub-tab
# Enter serial port (e.g., /dev/tty.usbserial-...)
# Click "🔌 Connect"
# Use motor control buttons!
```

## Architecture Highlights

- **Non-blocking design:** CAN communication runs via `Arc<Mutex<Slcan>>` allowing UI to remain responsive
- **State-driven:** All telemetry and frames stored in `CanState` resource
- **Bevy ECS integration:** Uses Bevy's system architecture for clean separation
- **Reuses existing code:** Leverages `can` crate's `Slcan` implementation

## Comparison: TUI vs PAD CAN Tab

| Feature                 | TUI              | PAD CAN Tab               |
| ----------------------- | ---------------- | ------------------------- |
| Telemetry visualization | ✅ Dial + charts | ✅ Gauge + text           |
| Frames inspection       | ✅ Table         | ✅ Table                  |
| Motor controls          | ✅ Hotkeys       | ✅ Buttons                |
| Connection setup        | CLI args         | ✅ GUI form               |
| Real-time updates       | ✅               | ✅                        |
| Angle/speed charts      | ✅               | 🚧 (tracked, display TBD) |

## Future Enhancements

- [ ] Add angle/speed charts using `egui_plot`
- [ ] Add torque control UI
- [ ] Save/load connection presets
- [ ] Export frame log to CSV
- [ ] Multiple motor support
- [ ] PID tuning interface
- [ ] Oscilloscope-style live trace

## Testing

```bash
# Check compilation
cargo check -p pad

# Run in development mode
cargo run -p pad

# Build (note: release has known issue with bevy_dylib panic runtime)
cargo build -p pad
```

All tests passing! ✅

---

**Documentation:**

- Main: `/notes/pad.md`
- CAN-specific: `/notes/pad_can.md`
- Implementation: `/apps/pad/src/can_tab.rs`
