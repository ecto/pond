//! CAN Bus Tab for PAD
//! Mirrors the functionality of the standalone CAN TUI

use bevy::prelude::*;
use can::{Bitrate, CanFrame, Slcan, SlcanError};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Resource)]
pub struct CanState {
    pub connected: bool,
    pub port: String,
    pub bitrate: Bitrate,
    pub motor_id: u32,
    pub serial_baud: u32,
    pub angle_x100: i32,
    pub speed_target_x100: i32,
    pub status2: u8,
    pub frames: Vec<FrameRow>,
    pub angle_history: Vec<(f64, f64)>, // (time_s, angle_deg)
    pub speed_history: Vec<(f64, f64)>, // (time_s, speed_dps)
    pub last_rx: Option<Instant>,
    pub connection_state: ConnectionState,
    pub scroll_offset: usize,
    pub can_subtab: CanSubTab,
}

impl Default for CanState {
    fn default() -> Self {
        Self {
            connected: false,
            port: String::new(),
            bitrate: Bitrate::B500k,
            motor_id: 1,
            serial_baud: 115_200,
            angle_x100: 0,
            speed_target_x100: 0,
            status2: 0,
            frames: Vec::new(),
            angle_history: Vec::new(),
            speed_history: Vec::new(),
            last_rx: None,
            connection_state: ConnectionState::default(),
            scroll_offset: 0,
            can_subtab: CanSubTab::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CanSubTab {
    Telemetry,
    Frames,
    Controls,
}

impl Default for CanSubTab {
    fn default() -> Self {
        Self::Telemetry
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ConnectionState {
    Disconnected,
    Connected,
    Error,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self::Disconnected
    }
}

// Bitrate default handled inline where needed (can't implement Default for foreign type)

#[derive(Clone, Debug)]
pub struct FrameRow {
    pub id: u32,
    pub data: Vec<u8>,
    pub extended: bool,
    pub ts: Instant,
}

/// Shared handle to the CAN connection (runs in background thread)
#[derive(Resource)]
pub struct CanHandle {
    pub slcan: Arc<Mutex<Option<Slcan>>>,
}

impl CanHandle {
    pub fn new() -> Self {
        Self {
            slcan: Arc::new(Mutex::new(None)),
        }
    }

    pub fn connect(&self, port: &str, bitrate: Bitrate, serial_baud: u32) -> anyhow::Result<()> {
        let mut guard = self.slcan.lock().unwrap();
        let slcan = Slcan::open_with_baud(port, bitrate, serial_baud)?;
        *guard = Some(slcan);
        Ok(())
    }

    pub fn disconnect(&self) {
        let mut guard = self.slcan.lock().unwrap();
        *guard = None;
    }

    pub fn is_connected(&self) -> bool {
        self.slcan.lock().unwrap().is_some()
    }

    pub fn send(&self, frame: &CanFrame) -> Result<(), SlcanError> {
        let mut guard = self.slcan.lock().unwrap();
        if let Some(ref mut slcan) = *guard {
            slcan.send(frame)
        } else {
            Err(SlcanError::Protocol("not connected"))
        }
    }

    pub fn read(&self) -> Result<CanFrame, SlcanError> {
        let mut guard = self.slcan.lock().unwrap();
        if let Some(ref mut slcan) = *guard {
            slcan.read()
        } else {
            Err(SlcanError::Protocol("not connected"))
        }
    }
}

pub fn send_cmd(handle: &CanHandle, motor_id: u32, data: [u8; 8]) -> anyhow::Result<()> {
    let id = 0x140 + motor_id;
    handle.send(&CanFrame {
        id,
        data: data.to_vec(),
        extended: false,
        rtr: false,
    })?;
    Ok(())
}

pub fn send_speed(handle: &CanHandle, motor_id: u32, speed_x100: i32) -> anyhow::Result<()> {
    let mut data = [0u8; 8];
    data[0] = 0xA2;
    data[4..8].copy_from_slice(&speed_x100.to_le_bytes());
    send_cmd(handle, motor_id, data)
}

pub fn send_position(handle: &CanHandle, motor_id: u32, angle_x100: i32) -> anyhow::Result<()> {
    let mut data = [0u8; 8];
    data[0] = 0xA4;
    data[4..8].copy_from_slice(&angle_x100.to_le_bytes());
    send_cmd(handle, motor_id, data)
}

pub fn classify_frame(id: u32, motor_id: u32, data: &[u8]) -> (&'static str, String) {
    let dir = if id == 0x140 + motor_id {
        "TX"
    } else if id == 0x240 + motor_id {
        "RX"
    } else {
        "--"
    };
    let kind = if let Some(cmd) = data.first() {
        match *cmd {
            0x92 => "angle",
            0x9A => "status1",
            0x9C => "status2",
            0xA2 => "speed",
            0xA4 => "position",
            0x77 => "brake_rel",
            0x78 => "brake_lock",
            0x81 => "stop",
            0xB6 => "active_reply",
            _ => "other",
        }
        .to_string()
    } else {
        String::from("")
    };
    (dir, kind)
}

/// System that polls CAN bus and updates state
pub fn can_poll_system(handle: Res<CanHandle>, mut state: ResMut<CanState>, time: Res<Time>) {
    if !handle.is_connected() {
        state.connected = false;
        return;
    }

    state.connected = true;

    // Poll multiple frames per tick
    for _ in 0..64 {
        match handle.read() {
            Ok(frame) => {
                // Update telemetry if this is from our motor
                if frame.id == 0x240 + state.motor_id && !frame.data.is_empty() {
                    match frame.data[0] {
                        0x92 if frame.data.len() >= 8 => {
                            // Angle multi-turn
                            let mut le = [0u8; 4];
                            le.copy_from_slice(&frame.data[4..8]);
                            state.angle_x100 = i32::from_le_bytes(le);

                            // Update histories
                            let t = time.elapsed_seconds_f64();
                            let angle_deg = (state.angle_x100 as f64) / 100.0;
                            state.angle_history.push((t, angle_deg));

                            // Calculate speed from angle delta
                            if state.angle_history.len() >= 2 {
                                let prev = state.angle_history[state.angle_history.len() - 2];
                                let dt = t - prev.0;
                                if dt > 0.0 {
                                    let speed = (angle_deg - prev.1) / dt;
                                    state.speed_history.push((t, speed));
                                }
                            }

                            // Keep only last 10 seconds
                            let cutoff = t - 10.0;
                            state
                                .angle_history
                                .retain(|(time, _)| *time >= cutoff);
                            state
                                .speed_history
                                .retain(|(time, _)| *time >= cutoff);
                        }
                        0x9C if frame.data.len() >= 2 => {
                            state.status2 = frame.data[1];
                        }
                        _ => {}
                    }
                }

                // Add to frames log
                state.frames.push(FrameRow {
                    id: frame.id,
                    data: frame.data,
                    extended: frame.extended,
                    ts: Instant::now(),
                });

                // Keep last 1000 frames
                if state.frames.len() > 1000 {
                    let excess = state.frames.len() - 1000;
                    state.frames.drain(0..excess);
                }

                state.last_rx = Some(Instant::now());
            }
            Err(SlcanError::Io(_)) => break, // Timeout, stop polling
            Err(_) => continue,
        }
    }
}

