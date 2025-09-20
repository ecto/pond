use anyhow::Result;
use can::{Bitrate, Slcan};

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let port = args.next().expect("usage: slcan-monitor <serial_port> [bitrate]");
    let bitrate = match args.next().as_deref() {
        Some("10000") => Bitrate::B10k,
        Some("20000") => Bitrate::B20k,
        Some("50000") => Bitrate::B50k,
        Some("100000") => Bitrate::B100k,
        Some("125000") => Bitrate::B125k,
        Some("250000") => Bitrate::B250k,
        Some("500000") | None => Bitrate::B500k,
        Some("800000") => Bitrate::B800k,
        Some("1000000") => Bitrate::B1M,
        Some(v) => panic!("unsupported bitrate: {}", v),
    };

    let mut slcan = Slcan::open(&port, bitrate)?;
    loop {
        match slcan.read() {
            Ok(frame) => {
                if frame.extended {
                    println!("T {:08X} dlc={} data={:02X?}", frame.id, frame.data.len(), frame.data);
                } else {
                    println!("t {:03X} dlc={} data={:02X?}", frame.id, frame.data.len(), frame.data);
                }
            }
            Err(_) => {}
        }
    }
}


