use std::thread::sleep;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use can::{Bitrate, CanFrame, Slcan};

fn main() -> Result<()> {
    // usage: slcan-scan <serial_port> [serial_baud] [id_start] [id_end]
    let mut args = std::env::args().skip(1);
    let port = args.next().context("usage: slcan-scan <serial_port> [serial_baud]")?;
    let serial_baud = args
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(1_000_000);
    let id_start = args.next().and_then(|s| u32::from_str_radix(&s, 16).ok()).unwrap_or(0x141);
    let id_end = args.next().and_then(|s| u32::from_str_radix(&s, 16).ok()).unwrap_or(0x17F);

    let candidate_bitrates = [Bitrate::B1M, Bitrate::B500k];
    let candidate_ids: Vec<u32> = (id_start..=id_end).collect();

    for bitrate in candidate_bitrates {
        eprintln!("[scan] open {} baud={} can={:?} ids={:03X}-{:03X}", port, serial_baud, bitrate, id_start, id_end);
        let mut slcan = match Slcan::open_with_baud(&port, bitrate, serial_baud) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[scan] open failed: {}", e);
                continue;
            }
        };

        let start = Instant::now();
        let scan_duration = Duration::from_secs(10);
        let mut id_index = 0usize;
        let mut phase = 0u8; // 0=>0x92, 1=>0x9A, 2=>0x9C

        while Instant::now().duration_since(start) < scan_duration {
            // 1) try read (non-blocking by design of Slcan read timeouts)
            match slcan.read() {
                Ok(f) => print_frame(&f),
                Err(_) => {}
            }

            // 2) every ~25ms, send next probe
            let now = Instant::now();
            if now.duration_since(start).as_millis() % 20 == 0 {
                let id = candidate_ids[id_index % candidate_ids.len()];
                let data = match phase { 0 => [0x92,0,0,0,0,0,0,0], 1 => [0x9A,0,0,0,0,0,0,0], _ => [0x9C,0,0,0,0,0,0,0] };
                let frame = CanFrame { id, data: data.to_vec(), extended: false, rtr: false };
                let _ = slcan.send(&frame);
                id_index += 1;
                if id_index % candidate_ids.len() == 0 { phase = (phase + 1) % 3; }
                sleep(Duration::from_millis(1));
            }
        }
    }

    Ok(())
}

fn print_frame(f: &CanFrame) {
    let id = if f.extended { format!("{:08X}", f.id) } else { format!("{:03X}", f.id) };
    let data_str = f
        .data
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ");
    println!("{}  {}", id, data_str);
}


