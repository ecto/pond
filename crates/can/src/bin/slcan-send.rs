use anyhow::Result;
use can::{Bitrate, CanFrame, Slcan};

fn main() -> Result<()> {
    // usage: slcan-send <serial_port> <bitrate> <id> <data_hex> [ext]
    let mut args = std::env::args().skip(1);
    let port = args.next().expect("usage: slcan-send <serial_port> <bitrate> <id> <data_hex> [ext]");
    let bitrate = match args.next().as_deref() {
        Some("10000") => Bitrate::B10k,
        Some("20000") => Bitrate::B20k,
        Some("50000") => Bitrate::B50k,
        Some("100000") => Bitrate::B100k,
        Some("125000") => Bitrate::B125k,
        Some("250000") => Bitrate::B250k,
        Some("500000") => Bitrate::B500k,
        Some("800000") => Bitrate::B800k,
        Some("1000000") => Bitrate::B1M,
        Some(v) => panic!("unsupported bitrate: {}", v),
        None => Bitrate::B500k,
    };
    let id_str = args.next().expect("missing id");
    let data_hex = args.next().unwrap_or_default();
    let extended = matches!(args.next().as_deref(), Some("ext") | Some("extended"));

    let id = u32::from_str_radix(&id_str, 16).expect("id must be hex");
    let bytes = hex::decode(&data_hex).expect("data_hex must be hex bytes, e.g. 11223344");
    let frame = CanFrame { id, data: bytes, extended, rtr: false };

    let mut slcan = Slcan::open(&port, bitrate)?;
    slcan.send(&frame)?;
    Ok(())
}


