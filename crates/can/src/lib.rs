use std::io::{Read, Write};
use std::time::{Duration, Instant};

use hex::FromHex;
use serialport::SerialPort;
use thiserror::Error;

macro_rules! slcandbg {
    ($($arg:tt)*) => {{
        if std::env::var("CAN_DEBUG").is_ok() { eprintln!("[slcan] {}", format!($($arg)*)); }
    }};
}

#[derive(Debug, Error)]
pub enum SlcanError {
    #[error("serial error: {0}")]
    Serial(#[from] serialport::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("protocol error: {0}")]
    Protocol(&'static str),
    #[error("parse error: {0}")]
    Parse(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Bitrate {
    B10k,
    B20k,
    B50k,
    B100k,
    B125k,
    B250k,
    B500k,
    B800k,
    B1M,
}

impl Bitrate {
    fn to_slcan_code(self) -> &'static str {
        match self {
            Bitrate::B10k => "S0",
            Bitrate::B20k => "S1",
            Bitrate::B50k => "S2",
            Bitrate::B100k => "S3",
            Bitrate::B125k => "S4",
            Bitrate::B250k => "S5",
            Bitrate::B500k => "S6",
            Bitrate::B800k => "S7",
            Bitrate::B1M => "S8",
        }
    }
}

#[derive(Debug, Clone)]
pub struct CanFrame {
    pub id: u32,
    pub data: Vec<u8>,
    pub extended: bool,
    pub rtr: bool,
}

pub struct Slcan {
    port: Box<dyn SerialPort>,
}

impl Slcan {
    pub fn open(path: &str, bitrate: Bitrate) -> Result<Self, SlcanError> {
        Self::open_with_baud(path, bitrate, 115_200)
    }

    pub fn set_echo(&mut self, on: bool) -> Result<(), SlcanError> {
        if on { Self::write_cmd_lenient(&mut self.port, b"E1") } else { Self::write_cmd_lenient(&mut self.port, b"E0") }
    }

    pub fn open_with_baud(path: &str, bitrate: Bitrate, serial_baud: u32) -> Result<Self, SlcanError> {
        slcandbg!("open path={} serial_baud={} bitrate={:?}", path, serial_baud, bitrate);
        let mut port = serialport::new(path, serial_baud)
            .timeout(Duration::from_millis(50))
            .open()?;

        // Set control lines that some CDC-ACM firmwares expect
        let _ = port.write_data_terminal_ready(true);
        let _ = port.write_request_to_send(false);
        slcandbg!("DTR set, RTS cleared");

        // Drain any pending input
        let drain_deadline = Instant::now() + Duration::from_millis(100);
        let mut tmp = [0u8; 64];
        let mut drained = 0usize;
        while Instant::now() < drain_deadline {
            match port.read(&mut tmp) {
                Ok(n) if n > 0 => { drained += n; },
                Ok(_) => {},
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => break,
                Err(_) => break,
            }
        }
        if drained > 0 { slcandbg!("drained {} bytes before init", drained); }

        // Probe version (optional) to sync line settings if the device expects it
        let _ = Self::probe_version(&mut port);

        // reset, set bitrate, close/open bus (tolerant: ignore early failures)
        let _ = Self::write_cmd_lenient(&mut port, b"C"); // Close if open
        let _ = Self::write_cmd_lenient(&mut port, bitrate.to_slcan_code().as_bytes());
        // Some firmwares do not support Zx/Ey commands; skip timestamp/echo tweaks
        // Some firmwares need a small pause before opening
        std::thread::sleep(Duration::from_millis(20));
        let loopback = std::env::var("CAN_LOOPBACK").is_ok();
        if loopback { Self::write_cmd_lenient(&mut port, b"l")?; } else { Self::write_cmd_lenient(&mut port, b"O")?; }
        let _ = Self::write_cmd_lenient(&mut port, b"F"); // read status/error register

        Ok(Slcan { port })
    }

    fn _write_cmd(port: &mut Box<dyn SerialPort>, cmd: &[u8]) -> Result<(), SlcanError> {
        slcandbg!("-> {}\\r", String::from_utf8_lossy(cmd));
        port.write_all(cmd)?;
        port.write_all(b"\r")?;
        // Read until CR (ACK) or BEL (NAK), ignoring any echoed bytes or noise
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut b = [0u8; 1];
        let mut seen: Vec<u8> = Vec::new();
        loop {
            match port.read(&mut b) {
                Ok(1) => match b[0] {
                    b'\r' => { slcandbg!("<- ACK term (seen: {:?})", seen); return Ok(()); },
                    0x07 => { slcandbg!("<- NAK BEL (seen: {:?})", seen); return Err(SlcanError::Protocol("NAK")); },
                    x => { seen.push(x); },
                },
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    if Instant::now() >= deadline { slcandbg!("timeout waiting for ACK/NAK (seen: {:?})", seen); return Err(SlcanError::Io(e)); }
                }
                Err(e) => return Err(SlcanError::Io(e)),
            }
        }
    }

    fn write_cmd_lenient(port: &mut Box<dyn SerialPort>, cmd: &[u8]) -> Result<(), SlcanError> {
        slcandbg!("-> {}\\r (lenient)", String::from_utf8_lossy(cmd));
        port.write_all(cmd)?;
        port.write_all(b"\r")?;
        // Read until CR (ACK) or BEL (NAK). If timeout, consider OK because some firmwares do not ACK.
        let _deadline = Instant::now() + Duration::from_secs(2);
        let mut b = [0u8; 1];
        let mut seen: Vec<u8> = Vec::new();
        loop {
            match port.read(&mut b) {
                Ok(1) => match b[0] {
                    b'\r' => { slcandbg!("<- ACK CR (seen: {:?})", seen); return Ok(()); },
                    0x07 => { slcandbg!("<- NAK BEL (seen: {:?})", seen); return Err(SlcanError::Protocol("NAK")); },
                    x => { seen.push(x); },
                },
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    slcandbg!("lenient timeout (treat as OK), seen: {:?}", seen);
                    return Ok(());
                }
                Err(e) => return Err(SlcanError::Io(e)),
            }
        }
    }

    fn write_line_lenient(&mut self, line: &str) -> Result<(), SlcanError> {
        slcandbg!("-> {}\\r (lenient)", line);
        self.port.write_all(line.as_bytes())?;
        self.port.write_all(b"\r")?;
        // same lenient handling
        let mut b = [0u8; 1];
        let mut seen: Vec<u8> = Vec::new();
        loop {
            match self.port.read(&mut b) {
                Ok(1) => match b[0] { b'\r' => { slcandbg!("<- ACK term (seen: {:?})", seen); return Ok(()); }, 0x07 => { slcandbg!("<- NAK BEL (seen: {:?})", seen); return Err(SlcanError::Protocol("NAK")); }, x => { seen.push(x); } },
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => { slcandbg!("lenient timeout (treat as OK), seen: {:?}", seen); return Ok(()); }
                Err(e) => return Err(SlcanError::Io(e)),
            }
        }
    }

    fn probe_version(port: &mut Box<dyn SerialPort>) -> Result<(), SlcanError> {
        // Send 'V' and read until CR, ignore content
        slcandbg!("-> V\\r");
        port.write_all(b"V\r")?;
        let deadline = Instant::now() + Duration::from_millis(800);
        let mut b = [0u8; 1];
        let mut resp: Vec<u8> = Vec::new();
        loop {
            match port.read(&mut b) {
                Ok(1) => if b[0] == b'\r' { slcandbg!("<- {}\\r", String::from_utf8_lossy(&resp)); return Ok(()); } else { resp.push(b[0]); },
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    if Instant::now() >= deadline { if !resp.is_empty() { slcandbg!("<- (partial) {}", String::from_utf8_lossy(&resp)); } return Ok(()); }
                }
                Err(_) => return Ok(()),
            }
        }
    }

    pub fn send(&mut self, frame: &CanFrame) -> Result<(), SlcanError> {
        // slcan format: t{ID3}{LEN}{DATA..}\r (std), T{ID8}{LEN}{DATA..}\r (ext)
        let mut buf = String::new();
        if frame.rtr {
            if frame.extended { buf.push('R'); } else { buf.push('r'); }
        } else {
            if frame.extended { buf.push('T'); } else { buf.push('t'); }
        }
        if frame.extended {
            buf.push_str(&format!("{:08X}", frame.id & 0x1FFF_FFFF));
        } else {
            buf.push_str(&format!("{:03X}", frame.id & 0x7FF));
        }
        let dlc = std::cmp::min(frame.data.len(), 8);
        buf.push(char::from(b'0' + dlc as u8));
        if !frame.rtr {
            for b in frame.data.iter().take(dlc) {
                buf.push_str(&format!("{:02X}", b));
            }
        }
        slcandbg!("-> {}\\r", buf);
        self.write_line_lenient(&buf)
    }

    pub fn read(&mut self) -> Result<CanFrame, SlcanError> {
        // Read until CR or LF and parse (return on timeout to avoid UI stalls)
        let mut line = Vec::with_capacity(64);
        loop {
            let mut b = [0u8; 1];
            match self.port.read(&mut b) {
                Ok(1) => {
                    if b[0] == b'\r' || b[0] == b'\n' { break; }
                    line.push(b[0]);
                }
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // If nothing accumulated yet, bubble the timeout up so callers can poll
                    if line.is_empty() { return Err(SlcanError::Io(e)); } else { break; }
                }
                Err(e) => return Err(SlcanError::Io(e)),
            }
        }
        slcandbg!("<- line: {}", String::from_utf8_lossy(&line));
        Self::parse_line(&line)
    }

    fn parse_line(line: &[u8]) -> Result<CanFrame, SlcanError> {
        if line.is_empty() { return Err(SlcanError::Parse("empty".into())); }
        let kind = line[0] as char;
        let (extended, rtr) = match kind {
            't' => (false, false),
            'T' => (true,  false),
            'r' => (false, true),
            'R' => (true,  true),
            _ => return Err(SlcanError::Parse(format!("unknown frame type: {}", kind))),
        };
        let mut idx = 1usize;
        let id = if extended {
            if line.len() < idx + 8 { return Err(SlcanError::Parse("short ID".into())); }
            let id_hex = std::str::from_utf8(&line[idx..idx+8]).map_err(|e| SlcanError::Parse(e.to_string()))?;
            idx += 8;
            u32::from_str_radix(id_hex, 16).map_err(|e| SlcanError::Parse(e.to_string()))?
        } else {
            if line.len() < idx + 3 { return Err(SlcanError::Parse("short ID".into())); }
            let id_hex = std::str::from_utf8(&line[idx..idx+3]).map_err(|e| SlcanError::Parse(e.to_string()))?;
            idx += 3;
            u32::from_str_radix(id_hex, 16).map_err(|e| SlcanError::Parse(e.to_string()))?
        };
        if line.len() <= idx { return Err(SlcanError::Parse("missing DLC".into())); }
        let dlc = (line[idx] - b'0') as usize;
        idx += 1;
        let mut data = Vec::new();
        if !rtr {
            let needed = dlc * 2;
            if line.len() < idx + needed { return Err(SlcanError::Parse("short data".into())); }
            let data_hex = std::str::from_utf8(&line[idx..idx+needed]).map_err(|e| SlcanError::Parse(e.to_string()))?;
            data = Vec::from_hex(data_hex).map_err(|e| SlcanError::Parse(e.to_string()))?;
        }
        Ok(CanFrame { id, data, extended, rtr })
    }
}


