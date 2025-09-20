# can

Minimal SLCAN (Lawicel) over serial library and CLIs for macOS/Linux.

Requires your CANable/RH-02 to run SLCAN firmware. On macOS the Candlelight (gs_usb) default won’t expose a serial port; flash SLCAN to get `/dev/tty.*`.

## Build

```
cargo build -p can --bins
```

## TUI (primary)

```
cargo run -p can -- /dev/tty.usbmodemXXXX 500000 [serial_baud]
# try 115200 (default), 1000000, or what your firmware expects
```

Quit with `q` or `Esc`. Shows latest frames first.

## Monitor (CLI)

```
cargo run -p can --bin slcan-monitor -- /dev/tty.usbmodemXXXX 500000
```

## Send

```
cargo run -p can --bin slcan-send -- /dev/tty.usbmodemXXXX 500000 123 11223344
```

Bitrates supported: 10000, 20000, 50000, 100000, 125000, 250000, 500000 (default), 800000, 1000000.

## macOS setup guide

See project docs: [CAN on macOS (RH-02 / CANable)](../../docs/reference/software/can.mdx)
