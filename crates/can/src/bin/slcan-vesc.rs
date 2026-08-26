use anyhow::Result;
use can::{Bitrate, CanFrame, Slcan};
use crossterm::{
    event::{self, Event, KeyCode, KeyEvent},
    terminal::{disable_raw_mode, enable_raw_mode},
};
use std::collections::HashMap;
use std::io::{self, Write};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use serialport;

#[derive(Debug, Default)]
struct VescState {
    // STATUS (0x09)
    erpm: Option<i32>,
    current: Option<f32>,
    duty: Option<f32>,

    // STATUS_2 (0x0E)
    ah_charged: Option<f32>,
    ah_discharged: Option<f32>,

    // STATUS_3 (0x0F)
    wh_charged: Option<f32>,
    wh_discharged: Option<f32>,

    // STATUS_4 (0x10)
    fet_temp: Option<f32>,
    motor_temp: Option<f32>,
    input_current: Option<f32>,
    pid_pos: Option<f32>,

    // STATUS_5 (0x1B)
    tachometer: Option<i32>,
    voltage: Option<f32>,

    // STATUS_6 (0x1C) - includes fault
    fault_code: Option<u8>,
}

/// RX buffer for multi-packet responses
#[derive(Debug, Default)]
struct RxBuffer {
    data: Vec<u8>,
    expected_len: usize,
}

fn fault_name(code: u8) -> &'static str {
    match code {
        0 => "None",
        1 => "Over Voltage",
        2 => "Under Voltage",
        3 => "DRV Fault",
        4 => "Abs Over Current",
        5 => "Over Temp FET",
        6 => "Over Temp Motor",
        7 => "Gate Driver Over Voltage",
        8 => "MCU Under Voltage",
        9 => "Watchdog Reset",
        10 => "Gate Driver Under Voltage",
        11 => "Encoder SPI",
        12 => "Encoder Below Min",
        13 => "Encoder Above Max",
        14 => "Flash Corruption",
        15..=17 => "Current Sensor Offset",
        18 => "Unbalanced Currents",
        19 => "BRK Fault",
        20..=22 => "Resolver Fault",
        23 => "Flash App Corruption",
        24 => "Flash MC Corruption",
        25 => "Encoder No Magnet",
        26 => "Encoder Magnet Strong",
        27 => "Phase Filter",
        28 => "Encoder Fault",
        29 => "LV Output Fault",
        _ => "Unknown",
    }
}

fn decode_vesc_packet(frame: &CanFrame) -> Option<(u8, VescState)> {
    if !frame.extended || frame.data.len() != 8 {
        return None;
    }

    let controller_id = (frame.id & 0xFF) as u8;
    let packet_type = ((frame.id >> 8) & 0xFF) as u8;

    let mut state = VescState::default();

    match packet_type {
        0x09 => {
            // STATUS: ERPM (i32), Current (i16/10), Duty (i16/1000)
            let erpm = i32::from_be_bytes([
                frame.data[0],
                frame.data[1],
                frame.data[2],
                frame.data[3],
            ]);
            let current_raw = i16::from_be_bytes([frame.data[4], frame.data[5]]);
            let duty_raw = i16::from_be_bytes([frame.data[6], frame.data[7]]);

            state.erpm = Some(erpm);
            state.current = Some(current_raw as f32 / 10.0);
            state.duty = Some(duty_raw as f32 / 1000.0);
        }
        0x0E => {
            // STATUS_2: Ah charged (i32/10000), Ah discharged (i32/10000)
            let ah_charged_raw = i32::from_be_bytes([
                frame.data[0],
                frame.data[1],
                frame.data[2],
                frame.data[3],
            ]);
            let ah_discharged_raw = i32::from_be_bytes([
                frame.data[4],
                frame.data[5],
                frame.data[6],
                frame.data[7],
            ]);

            state.ah_charged = Some(ah_charged_raw as f32 / 10000.0);
            state.ah_discharged = Some(ah_discharged_raw as f32 / 10000.0);
        }
        0x0F => {
            // STATUS_3: Wh charged (i32/10000), Wh discharged (i32/10000)
            let wh_charged_raw = i32::from_be_bytes([
                frame.data[0],
                frame.data[1],
                frame.data[2],
                frame.data[3],
            ]);
            let wh_discharged_raw = i32::from_be_bytes([
                frame.data[4],
                frame.data[5],
                frame.data[6],
                frame.data[7],
            ]);

            state.wh_charged = Some(wh_charged_raw as f32 / 10000.0);
            state.wh_discharged = Some(wh_discharged_raw as f32 / 10000.0);
        }
        0x10 => {
            // STATUS_4: FET temp (i16/10), Motor temp (i16/10), Input current (i16/10), PID pos (i16/50)
            let fet_temp_raw = i16::from_be_bytes([frame.data[0], frame.data[1]]);
            let motor_temp_raw = i16::from_be_bytes([frame.data[2], frame.data[3]]);
            let input_current_raw = i16::from_be_bytes([frame.data[4], frame.data[5]]);
            let pid_pos_raw = i16::from_be_bytes([frame.data[6], frame.data[7]]);

            state.fet_temp = Some(fet_temp_raw as f32 / 10.0);
            state.motor_temp = Some(motor_temp_raw as f32 / 10.0);
            state.input_current = Some(input_current_raw as f32 / 10.0);
            state.pid_pos = Some(pid_pos_raw as f32 / 50.0);
        }
        0x1B => {
            // STATUS_5: Tachometer (i32), Voltage (u16/10), Reserved (2 bytes)
            let tachometer = i32::from_be_bytes([
                frame.data[0],
                frame.data[1],
                frame.data[2],
                frame.data[3],
            ]);
            let voltage_raw = u16::from_be_bytes([frame.data[4], frame.data[5]]);

            state.tachometer = Some(tachometer);
            state.voltage = Some(voltage_raw as f32 / 10.0);
        }
        0x1C => {
            // STATUS_6: Various including fault code at byte 6
            if frame.data.len() >= 7 {
                state.fault_code = Some(frame.data[6]);
            }
        }
        _ => return None,
    }

    Some((controller_id, state))
}

fn merge_state(existing: &mut VescState, new: VescState) {
    if new.erpm.is_some() { existing.erpm = new.erpm; }
    if new.current.is_some() { existing.current = new.current; }
    if new.duty.is_some() { existing.duty = new.duty; }
    if new.ah_charged.is_some() { existing.ah_charged = new.ah_charged; }
    if new.ah_discharged.is_some() { existing.ah_discharged = new.ah_discharged; }
    if new.wh_charged.is_some() { existing.wh_charged = new.wh_charged; }
    if new.wh_discharged.is_some() { existing.wh_discharged = new.wh_discharged; }
    if new.fet_temp.is_some() { existing.fet_temp = new.fet_temp; }
    if new.motor_temp.is_some() { existing.motor_temp = new.motor_temp; }
    if new.input_current.is_some() { existing.input_current = new.input_current; }
    if new.pid_pos.is_some() { existing.pid_pos = new.pid_pos; }
    if new.tachometer.is_some() { existing.tachometer = new.tachometer; }
    if new.voltage.is_some() { existing.voltage = new.voltage; }
    if new.fault_code.is_some() { existing.fault_code = new.fault_code; }
}

/// Request MCCONF via CAN_PACKET_PROCESS_SHORT_BUFFER
fn request_mcconf(slcan: &mut Slcan, controller_id: u8) -> Result<()> {
    // CAN_PACKET_PROCESS_SHORT_BUFFER = 8 (0x08)
    let can_id = (controller_id as u32) | (0x08_u32 << 8);

    // Data: [send_to_id, send_flag, COMM_GET_MCCONF]
    // COMM_GET_MCCONF = 14 (0x0E) in newer firmware, 12 (0x0C) in older
    // Try 14 first (VESC 6 / newer FESC)
    let data = vec![controller_id, 0x00, 0x0E];

    let frame = CanFrame {
        id: can_id,
        data,
        extended: true,
        rtr: false,
    };

    slcan.send(&frame)?;
    Ok(())
}

/// Decode incoming buffer packets for MCCONF response
fn handle_rx_packet(
    frame: &CanFrame,
    rx_buffers: &mut HashMap<u8, RxBuffer>,
) -> Option<(u8, Vec<u8>)> {
    if !frame.extended {
        return None;
    }

    let controller_id = (frame.id & 0xFF) as u8;
    let packet_type = ((frame.id >> 8) & 0xFF) as u8;

    match packet_type {
        0x05 => {
            // CAN_PACKET_FILL_RX_BUFFER: [index, data...]
            if frame.data.len() < 2 {
                return None;
            }
            let index = frame.data[0] as usize;
            let buf = rx_buffers.entry(controller_id).or_default();

            // Extend buffer if needed
            let end = index + frame.data.len() - 1;
            if buf.data.len() < end {
                buf.data.resize(end, 0);
            }

            // Copy data
            for (i, &byte) in frame.data[1..].iter().enumerate() {
                if index + i < buf.data.len() {
                    buf.data[index + i] = byte;
                }
            }
        }
        0x06 => {
            // CAN_PACKET_FILL_RX_BUFFER_LONG: [index_hi, index_lo, data...]
            if frame.data.len() < 3 {
                return None;
            }
            let index = u16::from_be_bytes([frame.data[0], frame.data[1]]) as usize;
            let buf = rx_buffers.entry(controller_id).or_default();

            let end = index + frame.data.len() - 2;
            if buf.data.len() < end {
                buf.data.resize(end, 0);
            }

            for (i, &byte) in frame.data[2..].iter().enumerate() {
                if index + i < buf.data.len() {
                    buf.data[index + i] = byte;
                }
            }
        }
        0x07 => {
            // CAN_PACKET_PROCESS_RX_BUFFER: buffer complete
            // [process_to, process_from, len_hi, len_lo, crc_hi, crc_lo]
            if frame.data.len() >= 4 {
                let len = u16::from_be_bytes([frame.data[2], frame.data[3]]) as usize;
                if let Some(buf) = rx_buffers.remove(&controller_id) {
                    if buf.data.len() >= len {
                        return Some((controller_id, buf.data[..len].to_vec()));
                    }
                }
            }
        }
        _ => {}
    }

    None
}

fn send_vesc_command(
    slcan: &mut Slcan,
    controller_id: u8,
    command: u8,
    value: i32,
) -> Result<()> {
    let can_id = (controller_id as u32) | ((command as u32) << 8);
    let data = value.to_be_bytes().to_vec();

    let frame = CanFrame {
        id: can_id,
        data,
        extended: true,
        rtr: false,
    };

    slcan.send(&frame)?;
    Ok(())
}

/// Send FOC motor detection command
/// max_power_loss: maximum power loss in watts during detection (e.g., 10.0)
fn send_foc_detect(slcan: &mut Slcan, controller_id: u8, max_power_loss: f32) -> Result<()> {
    // CAN_PACKET_DETECT_APPLY_ALL_FOC = 19 (0x13)
    let can_id = (controller_id as u32) | (0x13_u32 << 8);

    // Data: max_power_loss as f32, scaled by 1000
    let scaled = (max_power_loss * 1000.0) as i32;
    let data = scaled.to_be_bytes().to_vec();

    let frame = CanFrame {
        id: can_id,
        data,
        extended: true,
        rtr: false,
    };

    slcan.send(&frame)?;
    Ok(())
}

/// Set duty cycle directly (value from -1.0 to 1.0)
fn send_duty(slcan: &mut Slcan, controller_id: u8, duty: f32) -> Result<()> {
    // CAN_PACKET_SET_DUTY = 0
    let can_id = (controller_id as u32) | (0x00_u32 << 8);

    // Duty is scaled by 100000
    let scaled = (duty * 100000.0) as i32;
    let data = scaled.to_be_bytes().to_vec();

    let frame = CanFrame {
        id: can_id,
        data,
        extended: true,
        rtr: false,
    };

    slcan.send(&frame)?;
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HoldCommand {
    None,
    Duty,
    Rpm,
}

fn parse_bitrate(v: &str) -> Option<Bitrate> {
    match v {
        "10000" => Some(Bitrate::B10k),
        "20000" => Some(Bitrate::B20k),
        "50000" => Some(Bitrate::B50k),
        "100000" => Some(Bitrate::B100k),
        "125000" => Some(Bitrate::B125k),
        "250000" => Some(Bitrate::B250k),
        "500000" => Some(Bitrate::B500k),
        "800000" => Some(Bitrate::B800k),
        "1000000" => Some(Bitrate::B1M),
        _ => None,
    }
}

/// CRC-16-CCITT-FALSE (polynomial 0x1021, init 0xFFFF)
fn crc16_ccitt(data: &[u8]) -> u16 {
    let mut crc: u16 = 0xFFFF;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            if crc & 0x8000 != 0 {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

/// Send a terminal command over direct USB/UART (not CAN)
fn send_usb_terminal_cmd(port: &str, cmd: &str) -> Result<()> {
    // Try multiple terminal command IDs for compatibility
    // 0x14 (VESC 4.x), 0x1A (some 5.x), 0x1D (6.x)
    let mut payloads: Vec<Vec<u8>> = Vec::new();
    let mut base = cmd.as_bytes().to_vec();
    if !base.ends_with(&[b'\n']) {
        base.push(b'\n');
    }
    for &tid in &[0x14_u8, 0x1A_u8, 0x1D_u8] {
        let mut body = Vec::with_capacity(1 + base.len());
        body.push(tid);
        body.extend_from_slice(&base);
        payloads.push(body);
    }

    let builder = serialport::new(port, 115_200).timeout(Duration::from_millis(500));
    let mut sp = builder.open()?;

    for body in payloads {
        if body.len() > 255 {
            continue;
        }
        let crc = crc16_ccitt(&body);
        let mut pkt = Vec::with_capacity(body.len() + 5);
        pkt.push(0x02);
        pkt.push(body.len() as u8);
        pkt.extend_from_slice(&body);
        pkt.push((crc >> 8) as u8);
        pkt.push((crc & 0xFF) as u8);
        pkt.push(0x03);
        sp.write_all(&pkt)?;
        sp.flush()?;
        std::thread::sleep(Duration::from_millis(50));
    }
    Ok(())
}

fn send_usb_set_poles_and_store(port: &str, poles: u8) -> Result<()> {
    send_usb_terminal_cmd(port, &format!("conf_set motor_poles {}", poles))?;
    // small pause
    std::thread::sleep(Duration::from_millis(100));
    send_usb_terminal_cmd(port, "conf_store_mc")?;
    Ok(())
}

fn send_usb_set_limits_and_store(
    port: &str,
    l_in_current_max: f32,
    l_in_current_min: f32,
    l_current_max: f32,
    l_current_min: f32,
    l_abs_current_max: f32,
) -> Result<()> {
    // Battery (input) current limits
    send_usb_terminal_cmd(port, &format!("conf_set l_in_current_max {:.3}", l_in_current_max))?;
    std::thread::sleep(Duration::from_millis(30));
    send_usb_terminal_cmd(port, &format!("conf_set l_in_current_min {:.3}", l_in_current_min))?;
    std::thread::sleep(Duration::from_millis(30));

    // Motor (phase) current limits
    send_usb_terminal_cmd(port, &format!("conf_set l_current_max {:.3}", l_current_max))?;
    std::thread::sleep(Duration::from_millis(30));
    send_usb_terminal_cmd(port, &format!("conf_set l_current_min {:.3}", l_current_min))?;
    std::thread::sleep(Duration::from_millis(30));

    // Absolute max phase current before fault
    send_usb_terminal_cmd(port, &format!("conf_set l_abs_current_max {:.3}", l_abs_current_max))?;
    std::thread::sleep(Duration::from_millis(50));

    // Persist
    send_usb_terminal_cmd(port, "conf_store_mc")?;
    Ok(())
}

/// Send MCCONF data back to VESC
/// Uses CAN_PACKET_FILL_RX_BUFFER to fill buffer, then CAN_PACKET_PROCESS_RX_BUFFER to apply
fn send_mcconf(slcan: &mut Slcan, controller_id: u8, config: &[u8]) -> Result<()> {
    // Prepend COMM_SET_MCCONF command (0x0D for older, 0x0F for newer firmware)
    // Try 0x0D first (COMM_SET_MCCONF)
    let mut payload = vec![0x0D];
    payload.extend_from_slice(config);

    // Calculate CRC over the payload
    let crc = crc16_ccitt(&payload);

    // Send data in chunks using CAN_PACKET_FILL_RX_BUFFER (0x05)
    // Each frame: [index, data...] - max 7 data bytes per frame
    let chunk_size = 6; // Leave room for 2-byte offset in FILL_RX_BUFFER_LONG if needed
    for (chunk_idx, chunk) in payload.chunks(chunk_size).enumerate() {
        let index = (chunk_idx * chunk_size) as u8;
        let can_id = (controller_id as u32) | (0x05_u32 << 8);

        let mut data = vec![index];
        data.extend_from_slice(chunk);

        let frame = CanFrame {
            id: can_id,
            data,
            extended: true,
            rtr: false,
        };

        slcan.send(&frame)?;

        // Small delay between frames to not overwhelm the bus
        std::thread::sleep(std::time::Duration::from_millis(2));
    }

    // Small delay before process command
    std::thread::sleep(std::time::Duration::from_millis(10));

    // Send CAN_PACKET_PROCESS_RX_BUFFER (0x07) to apply the config
    // [process_to, send, len_hi, len_lo, crc_hi, crc_lo]
    let len = payload.len() as u16;
    let can_id = (controller_id as u32) | (0x07_u32 << 8);
    let data = vec![
        controller_id,       // process_to (target VESC)
        0x01,                // send = 1 (process the command)
        (len >> 8) as u8,    // len_hi
        (len & 0xFF) as u8,  // len_lo
        (crc >> 8) as u8,    // crc_hi
        (crc & 0xFF) as u8,  // crc_lo
    ];

    let frame = CanFrame {
        id: can_id,
        data,
        extended: true,
        rtr: false,
    };

    slcan.send(&frame)?;
    Ok(())
}

/// Send MCCONF using LONG buffer (2-byte index) for older firmware
fn send_mcconf_long(slcan: &mut Slcan, controller_id: u8, config: &[u8]) -> Result<()> {
    // Prepend COMM_SET_MCCONF (0x0D)
    let mut payload = vec![0x0D];
    payload.extend_from_slice(config);

    let crc = crc16_ccitt(&payload);

    // Use CAN_PACKET_FILL_RX_BUFFER_LONG (0x06): [index_hi, index_lo, data...]
    let chunk_size = 6; // leave room for 2-byte index
    for (chunk_idx, chunk) in payload.chunks(chunk_size).enumerate() {
        let index = (chunk_idx * chunk_size) as u16;
        let can_id = (controller_id as u32) | (0x06_u32 << 8);

        let mut data = vec![(index >> 8) as u8, (index & 0xFF) as u8];
        data.extend_from_slice(chunk);

        let frame = CanFrame {
            id: can_id,
            data,
            extended: true,
            rtr: false,
        };

        slcan.send(&frame)?;
        std::thread::sleep(std::time::Duration::from_millis(2));
    }

    std::thread::sleep(std::time::Duration::from_millis(10));

    // Process packet (0x07): [process_to, send=1, len_hi, len_lo, crc_hi, crc_lo]
    let len = payload.len() as u16;
    let can_id = (controller_id as u32) | (0x07_u32 << 8);
    let data = vec![
        controller_id,
        0x01,
        (len >> 8) as u8,
        (len & 0xFF) as u8,
        (crc >> 8) as u8,
        (crc & 0xFF) as u8,
    ];

    let frame = CanFrame {
        id: can_id,
        data,
        extended: true,
        rtr: false,
    };

    slcan.send(&frame)?;
    Ok(())
}

const MOTOR_POLES_OFFSET: usize = 433; // Offset in config blob (after command byte)

/// Send a terminal command via CAN
/// Uses CAN_PACKET_PROCESS_SHORT_BUFFER with COMM_TERMINAL_CMD
fn send_terminal_cmd(slcan: &mut Slcan, controller_id: u8, cmd: &str) -> Result<()> {
    // COMM_TERMINAL_CMD varies by firmware:
    //   0x14 (VESC 4.x)
    //   0x1A (some 5.x)
    //   0x1D (6.x)
    // We'll try all of them.

    let mut cmd_bytes = cmd.as_bytes().to_vec();
    if !cmd_bytes.ends_with(&[b'\n']) {
        cmd_bytes.push(b'\n'); // VESC tool sends newline
    }

    // CAN_PACKET_PROCESS_SHORT_BUFFER can only handle short payloads; we use RX buffer with CRC.
    for &comm_terminal in &[0x14_u8, 0x1A_u8, 0x1D_u8] {
        // Build payload: COMM_TERMINAL_CMD + command string
        let mut payload = vec![comm_terminal];
        payload.extend_from_slice(&cmd_bytes);

        let crc = crc16_ccitt(&payload);

        // Send via FILL_RX_BUFFER
        let chunk_size = 6;
        for (chunk_idx, chunk) in payload.chunks(chunk_size).enumerate() {
            let index = (chunk_idx * chunk_size) as u8;
            let can_id = (controller_id as u32) | (0x05_u32 << 8);

            let mut data = vec![index];
            data.extend_from_slice(chunk);

            let frame = CanFrame {
                id: can_id,
                data,
                extended: true,
                rtr: false,
            };

            slcan.send(&frame)?;
            std::thread::sleep(std::time::Duration::from_millis(2));
        }

        std::thread::sleep(std::time::Duration::from_millis(10));

        // Process the buffer
        let len = payload.len() as u16;
        let can_id = (controller_id as u32) | (0x07_u32 << 8);
        let data = vec![
            controller_id,
            0x01,
            (len >> 8) as u8,
            (len & 0xFF) as u8,
            (crc >> 8) as u8,
            (crc & 0xFF) as u8,
        ];

        let frame = CanFrame {
            id: can_id,
            data,
            extended: true,
            rtr: false,
        };

        slcan.send(&frame)?;
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    Ok(())
}

/// Simpler approach: use CAN_PACKET_PROCESS_SHORT_BUFFER for short commands
fn send_terminal_cmd_short(slcan: &mut Slcan, controller_id: u8, cmd: &str) -> Result<()> {
    // CAN_PACKET_PROCESS_SHORT_BUFFER = 8 (0x08)
    // Data: [target_id, send_flag, COMM_TERMINAL_CMD, command_bytes...]
    // Max 5 bytes of command per frame, but we can chain multiple

    // COMM_TERMINAL_CMD = 29 (0x1D) for VESC 6
    let cmd_bytes = cmd.as_bytes();

    // For commands longer than 5 bytes, we need multiple SHORT_BUFFER frames
    // Actually, SHORT_BUFFER has a limitation. Let's use a single frame approach
    // with the first part of the command

    // Better: Use the packet ID 36 (0x24) = CAN_PACKET_TERMINAL_CMD which is dedicated
    let can_id = (controller_id as u32) | (0x24_u32 << 8);

    // Send command in chunks of 8 bytes (CAN frame max)
    for chunk in cmd_bytes.chunks(8) {
        let frame = CanFrame {
            id: can_id,
            data: chunk.to_vec(),
            extended: true,
            rtr: false,
        };
        slcan.send(&frame)?;
        std::thread::sleep(std::time::Duration::from_millis(2));
    }

    // Send empty frame to signal end of command (or newline)
    let frame = CanFrame {
        id: can_id,
        data: vec![0x00], // null terminator
        extended: true,
        rtr: false,
    };
    slcan.send(&frame)?;

    Ok(())
}

fn display_state(
    controllers: &HashMap<u8, VescState>,
    target_rpm: i32,
    target_duty: f32,
    hold_cmd: HoldCommand,
    hold_rpm: i32,
    hold_duty: f32,
    foc_detect_w: f32,
    status_msg: &str,
    mcconf_info: &str,
) {
    // Clear screen and move cursor to top
    print!("\x1B[2J\x1B[H");

    println!("VESC CAN Monitor & Controller\r");
    println!("=============================\r");
    println!("\r");

    if controllers.is_empty() {
        println!("Waiting for CAN data...\r");
        println!("\r");
    } else {
        let mut ids: Vec<_> = controllers.keys().collect();
        ids.sort();

        for id in ids {
            let state = &controllers[id];

            println!("Controller {} (0x{:02X})\r", id, id);
            println!("-------------------\r");

            // Motor status
            let erpm = state
                .erpm
                .map(|v| format!("{}", v))
                .unwrap_or_else(|| "---".into());
            let current = state
                .current
                .map(|v| format!("{:.2}", v))
                .unwrap_or_else(|| "---".into());
            let duty = state
                .duty
                .map(|v| format!("{:.1}", v * 100.0))
                .unwrap_or_else(|| "---".into());
            println!("  ERPM: {}  Current: {} A  Duty: {}%\r", erpm, current, duty);

            // Temperatures
            let fet = state
                .fet_temp
                .map(|v| format!("{:.1}", v))
                .unwrap_or_else(|| "---".into());
            let motor_t = state
                .motor_temp
                .map(|v| format!("{:.1}", v))
                .unwrap_or_else(|| "---".into());
            println!("  FET Temp: {} C  Motor Temp: {} C\r", fet, motor_t);

            // Power
            let vin = state
                .voltage
                .map(|v| format!("{:.1}", v))
                .unwrap_or_else(|| "---".into());
            let iin = state
                .input_current
                .map(|v| format!("{:.1}", v))
                .unwrap_or_else(|| "---".into());
            println!("  Voltage: {} V  Input Current: {} A\r", vin, iin);

            // Position
            if let Some(pid_pos) = state.pid_pos {
                println!("  PID Position: {:.2}\r", pid_pos);
            }

            // Fault
            if let Some(fault) = state.fault_code {
                if fault != 0 {
                    println!("  *** FAULT: {} ({}) ***\r", fault_name(fault), fault);
                }
            }

            println!("\r");
        }
    }

    // Motor config info
    if !mcconf_info.is_empty() {
        println!("Motor Config\r");
        println!("------------\r");
        println!("{}\r", mcconf_info);
        println!("\r");
    }

    println!("Controls\r");
    println!("--------\r");
    println!(
        "  RPM: {:>6}  [Up/Down, Enter=send]\r",
        target_rpm
    );
    println!(
        "  Duty: {:>5.1}%  [Left/Right, D=send]\r",
        target_duty * 100.0
    );
    let hold_line = match hold_cmd {
        HoldCommand::None => "  Hold: off\r".to_string(),
        HoldCommand::Duty => format!("  Hold: duty {:.1}% @10Hz\r", hold_duty * 100.0),
        HoldCommand::Rpm => format!("  Hold: rpm {} @10Hz\r", hold_rpm),
    };
    println!("{}", hold_line);
    println!("  FOC detect: {:.1} W  [[/]=adjust, F=run]\r", foc_detect_w);
    println!("\r");
    println!("  [S] Stop  [F] FOC Detect  [G] Get Config  [L] USB Set Limits  [P] Set 32 Poles  [W] Save  [Q] Quit\r");
    println!("\r");

    if !status_msg.is_empty() {
        println!("Status: {}\r", status_msg);
        println!("\r");
    }

    io::stdout().flush().unwrap();
}

fn read_f32_be(data: &[u8], offset: usize) -> Option<f32> {
    if offset + 4 <= data.len() {
        Some(f32::from_be_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]))
    } else {
        None
    }
}

fn read_i32_be(data: &[u8], offset: usize) -> Option<i32> {
    if offset + 4 <= data.len() {
        Some(i32::from_be_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]))
    } else {
        None
    }
}

fn read_u8(data: &[u8], offset: usize) -> Option<u8> {
    data.get(offset).copied()
}

/// Parse MCCONF response and extract key motor parameters
fn parse_mcconf(data: &[u8]) -> String {
    if data.is_empty() {
        return "Empty config".into();
    }

    // First byte is COMM response type
    let cmd = data[0];
    if cmd != 0x0E && cmd != 0x0F {
        // Not MCCONF response
        return format!("Unexpected response type: 0x{:02X} (len={})", cmd, data.len());
    }

    let d = &data[1..]; // Skip command byte

    let mut info = format!("Config size: {} bytes\r\n", d.len());

    // VESC MCCONF serialization order (from confgenerator):
    // Byte 0: signature (0x83 for MCCONF)
    // Bytes 1-3: signature continued
    // Byte 4: pwm_mode (u8)
    // Byte 5: comm_mode (u8)
    // Byte 6: motor_type (u8)
    // Byte 7: sensor_mode (u8)
    // Then floats for current limits, etc.

    // Let's decode what we have:
    if d.len() >= 8 {
        let sig = u32::from_be_bytes([d[0], d[1], d[2], d[3]]);
        let pwm_mode = d.get(4).copied().unwrap_or(0);
        let comm_mode = d.get(5).copied().unwrap_or(0);
        let motor_type = d.get(6).copied().unwrap_or(0);
        let sensor_mode = d.get(7).copied().unwrap_or(0);

        info.push_str(&format!(
            "  Signature: 0x{:08X}\r\n",
            sig
        ));
        info.push_str(&format!(
            "  PWM: {}  Comm: {}  Motor: {}  Sensor: {}\r\n",
            pwm_mode, comm_mode, motor_type, sensor_mode
        ));
    }

    // Current limits start at byte 8
    if let Some(l_current_max) = read_f32_be(d, 8) {
        info.push_str(&format!("  l_current_max: {:.1} A\r\n", l_current_max));
    }
    if let Some(l_current_min) = read_f32_be(d, 12) {
        info.push_str(&format!("  l_current_min: {:.1} A\r\n", l_current_min));
    }
    if let Some(l_in_current_max) = read_f32_be(d, 16) {
        info.push_str(&format!("  l_in_current_max: {:.1} A\r\n", l_in_current_max));
    }
    if let Some(l_in_current_min) = read_f32_be(d, 20) {
        info.push_str(&format!("  l_in_current_min: {:.1} A\r\n", l_in_current_min));
    }
    if let Some(l_abs_current_max) = read_f32_be(d, 24) {
        info.push_str(&format!("  l_abs_current_max: {:.1} A\r\n", l_abs_current_max));
    }

    // Scan for motor_poles - could be i32, i16, or u8
    info.push_str("\r\n  Scanning for motor_poles:\r\n");

    // Check for i16 values (2-100)
    info.push_str("  As i16: ");
    let mut found_i16 = vec![];
    for offset in (0..d.len().saturating_sub(1)).step_by(2) {
        let val = i16::from_be_bytes([d[offset], d[offset + 1]]);
        if val >= 2 && val <= 100 {
            found_i16.push((offset, val));
        }
    }
    for (off, val) in found_i16.iter().take(8) {
        info.push_str(&format!("[{}]={} ", off, val));
    }
    if found_i16.len() > 8 {
        info.push_str("...");
    }

    // Check for single bytes (common for pole count: 14, 20, 28, 30, 32, etc)
    info.push_str("\r\n  As u8 (14,20,28,30,32,36): ");
    let target_poles: [u8; 6] = [14, 20, 28, 30, 32, 36];
    for (offset, &b) in d.iter().enumerate() {
        if target_poles.contains(&b) {
            info.push_str(&format!("[{}]={} ", offset, b));
        }
    }

    // Look at bytes around offset 100-250 where si_motor_poles typically lives
    info.push_str("\r\n\r\n  Bytes 180-220 (likely si_motor_poles area):\r\n  ");
    for (i, &b) in d.iter().skip(180).take(40).enumerate() {
        if i > 0 && i % 16 == 0 {
            info.push_str("\r\n  ");
        } else if i > 0 && i % 4 == 0 {
            info.push_str(" ");
        }
        info.push_str(&format!("{:02X}", b));
    }

    // Check area around 429-440 where we found 28, 14, 20
    if d.len() > 445 {
        info.push_str("\r\n\r\n  Bytes 425-445 (found pole-like values here):\r\n  ");
        for (i, &b) in d.iter().skip(425).take(20).enumerate() {
            info.push_str(&format!("{:3} ", b));
            if i == 9 {
                info.push_str("\r\n  ");
            }
        }

        info.push_str(&format!("\r\n\r\n  ** Offset 433 = {} (likely motor_poles!) **", d[433]));

        // Also try reading as i32 at aligned offsets
        info.push_str("\r\n  [432] as i32: ");
        if let Some(v) = read_i32_be(d, 432) {
            info.push_str(&format!("{}", v));
        }
        info.push_str("  [436] as i32: ");
        if let Some(v) = read_i32_be(d, 436) {
            info.push_str(&format!("{}", v));
        }
    }

    // si_motor_poles as float (SI parameters are often floats)
    // Typically in the si_ block around offset 180-220
    info.push_str("\r\n\r\n  SI floats around 200-220:");
    for off in (200..220).step_by(4) {
        if let Some(v) = read_f32_be(d, off) {
            if v.abs() > 0.001 && v.abs() < 10000.0 {
                info.push_str(&format!("\r\n    [{}] = {:.3}", off, v));
            }
        }
    }

    // Also show raw hex of first 64 bytes
    info.push_str("\r\n  Raw (first 64 bytes):\r\n  ");
    for (i, &b) in d.iter().take(64).enumerate() {
        if i > 0 && i % 16 == 0 {
            info.push_str("\r\n  ");
        } else if i > 0 && i % 4 == 0 {
            info.push_str(" ");
        }
        info.push_str(&format!("{:02X}", b));
    }

    info
}

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);

    // Optional USB direct mode: --usb-set-poles <serial_port> [poles=32]
    let first = args.next().expect(
        "usage: slcan-vesc <slcan_serial_port> [bitrate] [controller_id] [--usb <vesc_usb_serial_port>] | --usb-set-poles <vesc_usb_serial_port> [poles=32]",
    );
    if first == "--usb-set-poles" {
        let port = args
            .next()
            .expect("usage: slcan-vesc --usb-set-poles <serial_port> [poles=32]");
        let poles: u8 = args.next().and_then(|s| s.parse().ok()).unwrap_or(32);
        println!(
            "Setting motor_poles={} over USB serial {} and storing...",
            poles, port
        );
        send_usb_set_poles_and_store(&port, poles)?;
        println!("Done. Power-cycle the FESC, then use CAN to verify.");
        return Ok(());
    }

    // Normal SLCAN mode
    let port = first;
    let mut bitrate = Bitrate::B500k;
    let mut target_controller_id: Option<u8> = None;
    let mut usb_port: Option<String> = None;

    let rest: Vec<String> = args.collect();
    let mut i = 0;
    while i < rest.len() {
        let a = rest[i].as_str();
        if a == "--usb" {
            usb_port = Some(rest.get(i + 1).cloned().expect(
                "usage: slcan-vesc <slcan_serial_port> [bitrate] [controller_id] [--usb <vesc_usb_serial_port>]",
            ));
            i += 2;
            continue;
        }

        if let Some(b) = parse_bitrate(a) {
            bitrate = b;
            i += 1;
            continue;
        }

        if target_controller_id.is_none() {
            if let Ok(id) = a.parse::<u8>() {
                target_controller_id = Some(id);
                i += 1;
                continue;
            }
        }

        panic!("unknown argument: {}", a);
    }

    let mut slcan = Slcan::open(&port, bitrate)?;
    let mut controllers: HashMap<u8, VescState> = HashMap::new();
    let mut rx_buffers: HashMap<u8, RxBuffer> = HashMap::new();

    // Enable raw mode for keyboard input
    enable_raw_mode()?;
    let _guard = scopeguard::guard((), |_| {
        let _ = disable_raw_mode();
        // Clear screen on exit
        print!("\x1B[2J\x1B[H");
        io::stdout().flush().unwrap();
    });

    // Control state
    let mut target_rpm: i32 = 0;
    let mut target_duty: f32 = 0.0; // -1.0 to 1.0
    let mut active_controller_id: Option<u8> = target_controller_id;
    let mut last_mcconf: Option<Vec<u8>> = None; // Store last received config
    let mut status_msg = String::new();
    let mut mcconf_info = String::new();

    // FOC detect power loss (W). Lower this to avoid over-current trips during detect.
    let mut foc_detect_w: f32 = 5.0;

    // Keepalive / hold-last-command (VESC timeout is often 1000ms)
    let mut hold_cmd = HoldCommand::None;
    let mut hold_rpm: i32 = 0;
    let mut hold_duty: f32 = 0.0;
    let mut last_send = Instant::now();
    let hold_period = Duration::from_millis(100); // 10 Hz, safely below 1000ms timeout

    // Initial display
    display_state(
        &controllers,
        target_rpm,
        target_duty,
        hold_cmd,
        hold_rpm,
        hold_duty,
        foc_detect_w,
        &status_msg,
        &mcconf_info,
    );

    let mut frame_count = 0;
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    ctrlc::set_handler(move || {
        r.store(false, Ordering::SeqCst);
    })?;

    loop {
        if !running.load(Ordering::SeqCst) {
            break;
        }

        // Check for keyboard input (non-blocking)
        if event::poll(Duration::from_millis(1))? {
            if let Event::Key(KeyEvent { code, .. }) = event::read()? {
                match code {
                    KeyCode::Char('q') | KeyCode::Char('Q') => break,
                    KeyCode::Up => {
                        target_rpm += 100;
                        display_state(
                            &controllers,
                            target_rpm,
                            target_duty,
                            hold_cmd,
                            hold_rpm,
                            hold_duty,
                            foc_detect_w,
                            &status_msg,
                            &mcconf_info,
                        );
                    }
                    KeyCode::Down => {
                        target_rpm -= 100;
                        display_state(
                            &controllers,
                            target_rpm,
                            target_duty,
                            hold_cmd,
                            hold_rpm,
                            hold_duty,
                            foc_detect_w,
                            &status_msg,
                            &mcconf_info,
                        );
                    }
                    KeyCode::Left => {
                        target_duty -= 0.01;
                        if target_duty < -1.0 {
                            target_duty = -1.0;
                        }
                        display_state(
                            &controllers,
                            target_rpm,
                            target_duty,
                            hold_cmd,
                            hold_rpm,
                            hold_duty,
                            foc_detect_w,
                            &status_msg,
                            &mcconf_info,
                        );
                    }
                    KeyCode::Right => {
                        target_duty += 0.01;
                        if target_duty > 1.0 {
                            target_duty = 1.0;
                        }
                        display_state(
                            &controllers,
                            target_rpm,
                            target_duty,
                            hold_cmd,
                            hold_rpm,
                            hold_duty,
                            foc_detect_w,
                            &status_msg,
                            &mcconf_info,
                        );
                    }
                    KeyCode::Char('[') => {
                        foc_detect_w = (foc_detect_w - 1.0).max(1.0);
                        status_msg = format!("FOC detect power set to {:.1} W", foc_detect_w);
                        display_state(
                            &controllers,
                            target_rpm,
                            target_duty,
                            hold_cmd,
                            hold_rpm,
                            hold_duty,
                            foc_detect_w,
                            &status_msg,
                            &mcconf_info,
                        );
                    }
                    KeyCode::Char(']') => {
                        foc_detect_w = (foc_detect_w + 1.0).min(50.0);
                        status_msg = format!("FOC detect power set to {:.1} W", foc_detect_w);
                        display_state(
                            &controllers,
                            target_rpm,
                            target_duty,
                            hold_cmd,
                            hold_rpm,
                            hold_duty,
                            foc_detect_w,
                            &status_msg,
                            &mcconf_info,
                        );
                    }
                    KeyCode::Enter => {
                        // Send RPM command
                        if let Some(controller_id) =
                            active_controller_id.or_else(|| controllers.keys().next().copied())
                        {
                            send_vesc_command(&mut slcan, controller_id, 0x03, target_rpm)?;
                            active_controller_id = Some(controller_id);
                            status_msg = format!("Sent RPM: {}", target_rpm);
                            hold_rpm = target_rpm;
                            hold_cmd = if hold_rpm == 0 { HoldCommand::None } else { HoldCommand::Rpm };
                            last_send = Instant::now();
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );
                        }
                    }
                    KeyCode::Char('d') | KeyCode::Char('D') => {
                        // Send duty cycle command
                        if let Some(controller_id) =
                            active_controller_id.or_else(|| controllers.keys().next().copied())
                        {
                            send_duty(&mut slcan, controller_id, target_duty)?;
                            active_controller_id = Some(controller_id);
                            status_msg = format!("Sent Duty: {:.1}%", target_duty * 100.0);
                            hold_duty = target_duty;
                            hold_cmd = if hold_duty == 0.0 { HoldCommand::None } else { HoldCommand::Duty };
                            last_send = Instant::now();
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );
                        }
                    }
                    KeyCode::Char('f') | KeyCode::Char('F') => {
                        // Run FOC motor detection
                        if let Some(controller_id) =
                            active_controller_id.or_else(|| controllers.keys().next().copied())
                        {
                            status_msg =
                                format!("Running FOC detection (max power loss {:.1} W)...", foc_detect_w);
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );
                            send_foc_detect(&mut slcan, controller_id, foc_detect_w)?;
                            active_controller_id = Some(controller_id);
                        }
                    }
                    KeyCode::Char('l') | KeyCode::Char('L') => {
                        // Set safe current limits over USB (bypasses CAN config-write restrictions)
                        let Some(ref usb) = usb_port else {
                            status_msg =
                                "No USB port set. Relaunch with: --usb <vesc_usb_serial_port>".into();
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );
                            continue;
                        };

                        // For 48V 13Ah packs with ~30A BMS: keep battery current modest, allow higher phase current.
                        let (in_max, in_min, m_max, m_min, abs_max) = (25.0_f32, -10.0_f32, 60.0_f32, -60.0_f32, 80.0_f32);

                        status_msg = format!(
                            "USB set limits: in_max {:.0}A in_min {:.0}A motor {:.0}/{:.0}A abs {:.0}A ...",
                            in_max, in_min, m_max, m_min, abs_max
                        );
                        display_state(
                            &controllers,
                            target_rpm,
                            target_duty,
                            hold_cmd,
                            hold_rpm,
                            hold_duty,
                            foc_detect_w,
                            &status_msg,
                            &mcconf_info,
                        );

                        if let Err(e) =
                            send_usb_set_limits_and_store(usb, in_max, in_min, m_max, m_min, abs_max)
                        {
                            status_msg = format!("USB set limits failed: {:#}", e);
                        } else {
                            status_msg =
                                "USB limits stored. Power-cycle FESC, then press G to re-fetch config."
                                    .into();
                        }
                        display_state(
                            &controllers,
                            target_rpm,
                            target_duty,
                            hold_cmd,
                            hold_rpm,
                            hold_duty,
                            foc_detect_w,
                            &status_msg,
                            &mcconf_info,
                        );
                    }
                    KeyCode::Char('g') | KeyCode::Char('G') => {
                        // Get motor config
                        if let Some(controller_id) =
                            active_controller_id.or_else(|| controllers.keys().next().copied())
                        {
                            status_msg = "Requesting motor config...".into();
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );
                            request_mcconf(&mut slcan, controller_id)?;
                            active_controller_id = Some(controller_id);
                        }
                    }
                    KeyCode::Char('s') | KeyCode::Char('S') => {
                        // Stop motor (set duty to 0)
                        if let Some(controller_id) =
                            active_controller_id.or_else(|| controllers.keys().next().copied())
                        {
                            send_duty(&mut slcan, controller_id, 0.0)?;
                            target_rpm = 0;
                            target_duty = 0.0;
                            hold_cmd = HoldCommand::None;
                            hold_rpm = 0;
                            hold_duty = 0.0;
                            status_msg = "Stopped".into();
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );
                        }
                    }
                    KeyCode::Char('p') | KeyCode::Char('P') => {
                        // Set motor poles to 32 - try terminal, then long buffer write of config
                        if let Some(controller_id) =
                            active_controller_id.or_else(|| controllers.keys().next().copied())
                        {
                            status_msg = "Setting poles=32 via terminal then config write...".into();
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );

                            // Terminal commands with multiple IDs
                            let _ = send_terminal_cmd(&mut slcan, controller_id, "conf_set motor_poles 32");
                            std::thread::sleep(std::time::Duration::from_millis(150));

                            // If we have a config blob, try patching and writing with LONG buffer
                            if let Some(ref config_data) = last_mcconf {
                                if config_data.len() > MOTOR_POLES_OFFSET + 1 {
                                    // Skip the response command byte
                                    let mut new_config = config_data[1..].to_vec();
                                    let old_poles = new_config[MOTOR_POLES_OFFSET];
                                    new_config[MOTOR_POLES_OFFSET] = 32;

                                    status_msg = format!(
                                        "Patching config poles {}->32 and sending (long)...",
                                        old_poles
                                    );
                                    display_state(
                                        &controllers,
                                        target_rpm,
                                        target_duty,
                                        hold_cmd,
                                        hold_rpm,
                                        hold_duty,
                                        foc_detect_w,
                                        &status_msg,
                                        &mcconf_info,
                                    );

                                    let _ = send_mcconf_long(&mut slcan, controller_id, &new_config);
                                    std::thread::sleep(std::time::Duration::from_millis(150));
                                }
                            }

                            status_msg = "Commands sent. Press G to check. May need USB for config.".into();
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );
                        }
                    }
                    KeyCode::Char('w') | KeyCode::Char('W') => {
                        // Write config to flash (save permanently)
                        if let Some(controller_id) =
                            active_controller_id.or_else(|| controllers.keys().next().copied())
                        {
                            status_msg = "Sending: conf_store_mc".into();
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );

                            send_terminal_cmd(&mut slcan, controller_id, "conf_store_mc")?;

                            std::thread::sleep(std::time::Duration::from_millis(100));

                            status_msg = "Config stored to flash!".into();
                            display_state(
                                &controllers,
                                target_rpm,
                                target_duty,
                                hold_cmd,
                                hold_rpm,
                                hold_duty,
                                foc_detect_w,
                                &status_msg,
                                &mcconf_info,
                            );
                        }
                    }
                    _ => {}
                }
            }
        }

        // Keep sending the last non-zero command to prevent VESC timeout stop.
        if hold_cmd != HoldCommand::None && last_send.elapsed() >= hold_period {
            if let Some(controller_id) = active_controller_id.or_else(|| controllers.keys().next().copied()) {
                match hold_cmd {
                    HoldCommand::Duty => {
                        let _ = send_duty(&mut slcan, controller_id, hold_duty);
                    }
                    HoldCommand::Rpm => {
                        let _ = send_vesc_command(&mut slcan, controller_id, 0x03, hold_rpm);
                    }
                    HoldCommand::None => {}
                }
                last_send = Instant::now();
            }
        }

        // Read CAN frames
        match slcan.read() {
            Ok(frame) => {
                // Check for buffer/config response packets
                if let Some((_cid, data)) = handle_rx_packet(&frame, &mut rx_buffers) {
                    mcconf_info = parse_mcconf(&data);
                    last_mcconf = Some(data); // Store for modification
                    status_msg = "Config received".into();
                    display_state(
                        &controllers,
                        target_rpm,
                        target_duty,
                        hold_cmd,
                        hold_rpm,
                        hold_duty,
                        foc_detect_w,
                        &status_msg,
                        &mcconf_info,
                    );
                }

                // Check for status packets
                if let Some((controller_id, new_state)) = decode_vesc_packet(&frame) {
                    let state = controllers.entry(controller_id).or_default();
                    merge_state(state, new_state);

                    // Set active controller if not set
                    if active_controller_id.is_none() {
                        active_controller_id = Some(controller_id);
                    }

                    // Update display every 10 frames to reduce flicker
                    frame_count += 1;
                    if frame_count % 10 == 0 {
                        display_state(
                            &controllers,
                            target_rpm,
                            target_duty,
                            hold_cmd,
                            hold_rpm,
                            hold_duty,
                            foc_detect_w,
                            &status_msg,
                            &mcconf_info,
                        );
                    }
                }
            }
            Err(_) => {
                // Timeout or error - just continue
            }
        }
    }

    Ok(())
}









