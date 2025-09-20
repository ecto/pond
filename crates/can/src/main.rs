use std::io;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use can::{Bitrate, CanFrame, Slcan, SlcanError};
use crossterm::event::{self, Event, KeyCode};
use crossterm::terminal::{disable_raw_mode, enable_raw_mode};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Style, Color, Modifier},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Table, Row as TRow, Cell, Scrollbar, ScrollbarOrientation, ScrollbarState, Gauge, Tabs},
    widgets::canvas::{Canvas, Line as CLine, Rectangle as CRect},
    widgets::{Chart, Axis, Dataset, GraphType},
    symbols,
    Terminal,
};
/*
RMD‑L CAN Protocol – Quick Capability Summary (for future maintainers)

Bus/IDs
- CAN (default 1 Mbps). Per motor: TX (host→motor) ID = 0x140 + motor_id, RX (motor→host) ID = 0x240 + motor_id.
- Commands rarely ACK; some firmwares only reply on explicit reads or when active reply is enabled (0xB6).

Major Commands (single motor)
- 0xA1 torque closed loop (current/torque)
- 0xA2 speed closed loop (deg/s ×100, LE i32 in data[4..8])
- 0xA4 absolute multi‑turn position (deg ×100, LE i32 in data[4..8])
- 0xA6 single‑turn position; 0xA8 incremental position
- 0x92 multi‑turn angle; 0x94 single‑turn angle
- 0x9A status1/error; 0x9C status2; 0x9D/0x9E extended
- 0x77 brake release; 0x78 brake lock; 0x81 stop; 0x80 shutdown
- 0x30/0x31/0x32 PID read/RAM/ROM; 0x42/0x43 accel read/write; 0x79 ID; 0xB4 baud; 0xB3 watchdog; 0xB5 model; 0xB1 runtime; 0xB2 version date
- 0xB6 Active Reply: [0xB6, cmd, enable(0/1), interval_low, interval_high, 0,0,0]. Example: enable periodic angle → B6 92 01 05 00 00 00 00 (50 ms, 10 ms units)

TUI Hotkeys
- r/k/x/+/‑/0/p for brake/stop/speed/position
- a (angle 0x92), s (status2 0x9C), A (active reply angle 0x92)
- Up/Down/Home/End scroll frames; q/Esc quit

Next UI ideas (Ratatui)
- Tabs: Modes (Torque/Speed/AbsPos/SingleTurn/Incremental), Telemetry, Safety, Frames
- Live telemetry header + angle/speed sparklines/gauges
- Controls panel: focused inputs with step keys
- Safety panel: watchdog, ID/baud, zero encoder
- Frames table: TS/Dir/ID/Kind/Data + scrollbar
*/

#[derive(Clone)]
struct FrameRow { id: u32, data: Vec<u8>, extended: bool, ts: Instant }

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tab { Telemetry, Frames, Help }

fn main() -> Result<()> {
    // Ensure terminal is restored on panic/Ctrl+C
    let _guard = scopeguard::guard((), |_| {
        let _ = disable_raw_mode();
        let _ = crossterm::execute!(std::io::stdout(), crossterm::terminal::LeaveAlternateScreen);
    });
    ctrlc::set_handler(|| {
        let _ = disable_raw_mode();
        let _ = crossterm::execute!(std::io::stdout(), crossterm::terminal::LeaveAlternateScreen);
        std::process::exit(0);
    }).ok();
    let mut args = std::env::args().skip(1);
    let port = args.next().context("usage: can <serial_port> [bitrate] [serial_baud] [motor_id]")?;
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
        Some(v) => anyhow::bail!("unsupported bitrate: {}", v),
    };

    let serial_baud = args.next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(115_200);
    let motor_id = args.next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(1);
    let mut slcan = Slcan::open_with_baud(&port, bitrate, serial_baud)?;

    if std::env::var("CAN_NO_TUI").is_ok() {
        eprintln!("[can] connected port={} bitrate={:?} serial_baud={}", port, bitrate, serial_baud);
        eprintln!("[can] type any key + Enter to send a test frame 123#11223344 (std)");
        let stdin = std::io::stdin();
        let mut line = String::new();
        loop {
            match slcan.read() {
                Ok(f) => {
                    let id = if f.extended { format!("{:08X}", f.id) } else { format!("{:03X}", f.id) };
                    let data_str = f.data.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                    println!("{}  {}", id, data_str);
                }
                Err(e) => {
                    if std::env::var("CAN_DEBUG").is_ok() { eprintln!("[can] read err: {}", e); }
                }
            }
            // Non-blocking-ish: check for a line on stdin
            use std::io::Read as _;
            while let Ok(n) = stdin.read_line(&mut line) { if n == 0 { break; } else { break; } }
            if !line.is_empty() {
                let _ = slcan.send(&can::CanFrame { id: 0x123, data: vec![0x11,0x22,0x33,0x44], extended: false, rtr: false });
                if std::env::var("CAN_EXIT_AFTER_TX").is_ok() { return Ok(()); }
                line.clear();
            }
        }
    }

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    crossterm::execute!(stdout, crossterm::terminal::EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let app_start = Instant::now();
    let mut rows: Vec<FrameRow> = Vec::new();
    let mut target_speed_x100: i32 = 0; // deg/s * 100
    let mut last_poll = Instant::now();
    let mut last_read = Instant::now();
    let mut last_rx = Instant::now();
    let mut angle_x100: i32 = 0;
    let mut status2: u8 = 0;
    let mut scroll_offset: usize = 0; // 0 shows newest
    let mut sb_state = ScrollbarState::default();
    let mut tab = Tab::Telemetry;
    // Telemetry histories for charts (time in seconds since start)
    let mut angle_hist_pts: Vec<(f64,f64)> = Vec::new();
    let mut speed_hist_pts: Vec<(f64,f64)> = Vec::new();
    let mut last_angle_degs_abs: Option<(f64, Instant)> = None; // multi-turn degrees + timestamp
    let window_secs: f64 = 10.0;
    // Sparkline history removed; using a dial canvas instead

    loop {
        // Poll device without blocking UI
        for _ in 0..64 {
            match slcan.read() {
                Ok(f) => {
                    if f.id == 0x240 + motor_id && !f.data.is_empty() {
                        match f.data[0] {
                            0x92 if f.data.len() >= 8 => {
                                let mut le=[0u8;4];
                                le.copy_from_slice(&f.data[4..8]);
                                angle_x100 = i32::from_le_bytes(le);
                                // update histories
                                let now = Instant::now();
                                let t = app_start.elapsed().as_secs_f64();
                                let angle_abs_deg = (angle_x100 as f64) / 100.0; // multi-turn
                                angle_hist_pts.push((t, angle_abs_deg));
                                if let Some((prev_deg, prev_t)) = last_angle_degs_abs {
                                    let dt = now.duration_since(prev_t).as_secs_f64();
                                    if dt > 0.0 {
                                        let speed = (angle_abs_deg - prev_deg) / dt; // deg/s
                                        speed_hist_pts.push((t, speed));
                                    }
                                }
                                last_angle_degs_abs = Some((angle_abs_deg, now));
                                // trim window
                                let cutoff = t - window_secs;
                                while angle_hist_pts.first().map_or(false, |(x,_)| *x < cutoff) { angle_hist_pts.remove(0); }
                                while speed_hist_pts.first().map_or(false, |(x,_)| *x < cutoff) { speed_hist_pts.remove(0); }
                            }
                            0x9C if f.data.len() >= 2 => { status2 = f.data[1]; }
                            _ => {}
                        }
                    }
                    rows.push(FrameRow { id: f.id, data: f.data, extended: f.extended, ts: Instant::now() });
                    if rows.len() > 1000 { rows.drain(0..rows.len()-1000); }
                    last_read = Instant::now();
                    last_rx = Instant::now();
                }
                Err(SlcanError::Io(_)) => break,
                Err(_) => continue,
            }
        }

        // Periodically request status/angle so the view updates on quiet buses
        // No periodic polling by default; use hotkeys to request

        terminal.draw(|f| {
            let size = f.area();
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(3), // tabs row
                    Constraint::Min(1),    // content
                    Constraint::Length(1), // footer info
                ]).split(size);
            let content_area = chunks[1];

            // Official Tabs widget with unstyled titles; highlight_style drives the emphasis
            // Include numeric hints for quick access
            let titles: Vec<Line> = [" 1 Telemetry ", " 2 Frames ", " 3 Help "]
                .iter().map(|t| Line::from(*t)).collect();
            let selected = match tab { Tab::Telemetry => 0, Tab::Frames => 1, Tab::Help => 2 };
            let tabs = Tabs::new(titles)
                .style(Style::default())
                .highlight_style(Style::default().add_modifier(Modifier::REVERSED).add_modifier(Modifier::BOLD))
                .padding(" ", " ")
                .divider(" ")
                .select(selected);
            f.render_widget(tabs, chunks[0]);

            match tab {
                Tab::Telemetry => {
                    let dash_chunks = Layout::default()
                        .direction(Direction::Vertical)
                        .constraints([
                            Constraint::Min(8), // dial gets space
                            Constraint::Length(3), // bar gauge
                            Constraint::Length(10), // charts area
                        ])
                        .split(content_area);

                    // Dial rendered with Canvas (aspect-correct to remain circular)
                    let angle_deg = ((angle_x100 as f64) / 100.0).rem_euclid(360.0);
                    let dial_area = dash_chunks[0];
                    // Use HalfBlock marker; compensate for widget aspect so the circle appears round
                    let w = dial_area.width.max(1) as f64;
                    let h = dial_area.height.max(1) as f64;
                    let marker_scale = 2.0; // HalfBlock doubles vertical resolution
                    let eff_h = h * marker_scale; // effective pixel height
                    let min_px = w.min(eff_h);
                    let mut dial_margin: f64 = std::env::var("CAN_DIAL_MARGIN").ok().and_then(|s| s.parse().ok()).unwrap_or(0.92);
                    if dial_margin <= 0.0 || dial_margin > 1.0 { dial_margin = 0.92; }
                    // Choose symmetric bounds so 1 unit radius maps to min_px/2 pixels
                    let sx = (w / min_px);
                    let sy = (eff_h / min_px);
                    let x_bounds = [-sx, sx];
                    let y_bounds = [-sy, sy];
                    let dial = Canvas::default()
                        .block(Block::default().borders(Borders::ALL).title("Angle Dial (°)"))
                        .marker(symbols::Marker::HalfBlock)
                        .x_bounds(x_bounds)
                        .y_bounds(y_bounds)
                        .paint(move |ctx| {
                            let r = dial_margin; // actual dial radius inside the widget
                            // Outer circle
                            for i in 0..360 {
                                let rad = (i as f64).to_radians();
                                let x = r * rad.cos();
                                let y = r * rad.sin();
                                ctx.draw(&CRect { x, y, width: 0.002, height: 0.002, color: Color::DarkGray });
                            }
                            // Tick marks every 30°
                            for i in (0..360).step_by(30) {
                                let r1 = r * 0.85;
                                let r2 = r * 0.98;
                                let rad = (i as f64).to_radians();
                                ctx.draw(&CLine { x1: r1*rad.cos(), y1: r1*rad.sin(), x2: r2*rad.cos(), y2: r2*rad.sin(), color: Color::Gray });
                            }
                            // Needle pointing at angle_deg
                            let rad = angle_deg.to_radians();
                            ctx.draw(&CLine { x1: 0.0, y1: 0.0, x2: (r*0.8)*rad.cos(), y2: (r*0.8)*rad.sin(), color: Color::Yellow });
                        });
                    f.render_widget(dial, dash_chunks[0]);

                    // Bar gauge also shows single‑turn ratio
                    let angle_norm = angle_deg;
                    let ratio = (angle_norm / 360.0).clamp(0.0, 1.0);
                    let gauge = Gauge::default()
                        .block(Block::default().borders(Borders::ALL).title("Angle"))
                        .ratio(ratio)
                        .gauge_style(Style::default().fg(Color::LightCyan))
                        .label(format!("{:.2}° (single)", angle_norm));
                    f.render_widget(gauge, dash_chunks[1]);

                    // Charts: Angle (multi-turn, °) and Speed (deg/s) using identical sampling
                    let now_s = app_start.elapsed().as_secs_f64();
                    let x_bounds = [now_s - window_secs, now_s];
                    let angle_points: Vec<(f64,f64)> = angle_hist_pts.clone();
                    let speed_points: Vec<(f64,f64)> = speed_hist_pts.clone();

                    // Autoscale Y bounds for angle
                    let (amin, amax) = if let Some(((..),)) = angle_points.first().map(|_| ((0,),)) {
                        let mut mn = angle_points[0].1; let mut mx = mn;
                        for &(_, v) in &angle_points { if v < mn { mn = v } if v > mx { mx = v } }
                        (mn, mx)
                    } else { (0.0, 1.0) };
                    let apad = ((amax - amin) * 0.1).max(0.5);
                    let a_bounds = [amin - apad, amax + apad];

                    // Autoscale Y bounds for speed (symmetric around 0)
                    let (smin, smax) = if let Some(((..),)) = speed_points.first().map(|_| ((0,),)) {
                        let mut mn = speed_points[0].1; let mut mx = mn;
                        for &(_, v) in &speed_points { if v < mn { mn = v } if v > mx { mx = v } }
                        (mn, mx)
                    } else { (-1.0, 1.0) };
                    let sab = smax.abs().max(smin.abs()).max(1.0);
                    let s_bounds = [-sab * 1.1, sab * 1.1];

                    let chart_chunks = Layout::default()
                        .direction(Direction::Horizontal)
                        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
                        .split(dash_chunks[2]);

                    let angle_ds = Dataset::default()
                        .name("angle")
                        .marker(symbols::Marker::Braille)
                        .style(Style::default().fg(Color::Cyan))
                        .graph_type(GraphType::Line)
                        .data(&angle_points);
                    let angle_chart = Chart::new(vec![angle_ds])
                        .block(Block::default().borders(Borders::ALL).title("Angle (°)"))
                        .x_axis(Axis::default().bounds(x_bounds).labels(vec![Line::from(format!("-{:.0}s", window_secs)), Line::from("now")] ))
                        .y_axis(Axis::default().bounds(a_bounds).labels(vec![Line::from(format!("{:.0}", a_bounds[0])), Line::from(format!("{:.0}", a_bounds[1]))]));
                    f.render_widget(angle_chart, chart_chunks[0]);

                    let speed_ds = Dataset::default()
                        .name("speed")
                        .marker(symbols::Marker::Braille)
                        .style(Style::default().fg(Color::Green))
                        .graph_type(GraphType::Line)
                        .data(&speed_points);
                    let speed_chart = Chart::new(vec![speed_ds])
                        .block(Block::default().borders(Borders::ALL).title("Speed (deg/s)"))
                        .x_axis(Axis::default().bounds(x_bounds).labels(vec![Line::from(format!("-{:.0}s", window_secs)), Line::from("now")] ))
                        .y_axis(Axis::default().bounds(s_bounds).labels(vec![Line::from(format!("{:.0}", s_bounds[0])), Line::from("0"), Line::from(format!("{:.0}", s_bounds[1]))]));
                    f.render_widget(speed_chart, chart_chunks[1]);
                }
                Tab::Frames => {
                    // determine visible rows by area height (minus borders)
                    let visible = content_area.height.saturating_sub(2) as usize;
                    let total = rows.len();
                    let max_skip = total.saturating_sub(visible);
                    if scroll_offset > max_skip { scroll_offset = max_skip; }
                    sb_state = sb_state.content_length(total.saturating_sub(visible)).position(scroll_offset);

                    let table_rows = rows.iter().rev().skip(scroll_offset).take(visible).map(|r| {
                        let (dir, kind) = classify_row(r.id, motor_id, &r.data);
                        let id_str = if r.extended { format!("{:08X}", r.id) } else { format!("{:03X}", r.id) };
                        let ts_ms = r.ts.duration_since(app_start).as_millis();
                        let data_str = r.data.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
                        let dir_color = if dir == "TX" { Color::Yellow } else if dir == "RX" { Color::Cyan } else { Color::Gray };
                        TRow::new(vec![
                            Cell::from(format!("{:>8}ms", ts_ms)).style(Style::default().fg(Color::DarkGray)),
                            Cell::from(dir.to_string()).style(Style::default().fg(dir_color).add_modifier(Modifier::BOLD)),
                            Cell::from(id_str).style(Style::default().fg(Color::Cyan)),
                            Cell::from(kind).style(Style::default().fg(Color::Green)),
                            Cell::from(data_str).style(Style::default().fg(Color::White)),
                        ])
                    });

                    let table = Table::new(table_rows, [
                            Constraint::Length(10), // ts
                            Constraint::Length(3),  // dir
                            Constraint::Length(8),  // id
                            Constraint::Length(16), // kind
                            Constraint::Min(10),    // data
                        ])
                        .block(Block::default().borders(Borders::ALL).title("Frames (latest first)"));
                    f.render_widget(table, content_area);
                    // render scrollbar at right edge of table area
                    let sb = Scrollbar::default().orientation(ScrollbarOrientation::VerticalRight);
                    f.render_stateful_widget(sb, content_area, &mut sb_state);
                }
                Tab::Help => {
                    let keys_chunks = Layout::default()
                        .direction(Direction::Horizontal)
                        .constraints([
                            Constraint::Percentage(50),
                            Constraint::Percentage(50),
                        ])
                        .split(content_area);

                    let key_style = Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD);
                    let key = |label: &str| Span::styled(format!("[{}]", label), key_style);

                    // Left column: Navigation + Frames
                    let nav_lines = vec![
                        Line::from(vec![key("Tab"), Span::raw(" Next  "), key("Shift-Tab"), Span::raw(" Prev")]),
                        Line::from(vec![key("1"), Span::raw(" Dash  "), key("2"), Span::raw(" Frames  "), key("3"), Span::raw(" Safety  "), key("4"), Span::raw(" Keys")]),
                    ];
                    let frames_lines = vec![
                        Line::from(vec![key("Up/Down"), Span::raw(" Scroll  "), key("Home/End"), Span::raw(" Jump")]),
                    ];
                    let left = Paragraph::new(nav_lines.into_iter().chain(frames_lines).collect::<Vec<_>>())
                        .block(Block::default().borders(Borders::ALL).title("Help: Navigation / Frames"));
                    f.render_widget(left, keys_chunks[0]);

                    // Right column: Motor + Telemetry + Quit
                    let motor_lines = vec![
                        Line::from(vec![key("r"), Span::raw(" Release brake  "), key("k"), Span::raw(" Lock brake")]),
                        Line::from(vec![key("x"), Span::raw(" Stop  "), key("0"), Span::raw(" Zero speed")]),
                        Line::from(vec![key("+/-"), Span::raw(" Speed ±5 dps  "), key("p"), Span::raw(" Position 90°")]),
                    ];
                    let tele_lines = vec![
                        Line::from(vec![key("a"), Span::raw(" Read angle (0x92)  "), key("s"), Span::raw(" Read status2 (0x9C)")]),
                        Line::from(vec![key("A"), Span::raw(" Active reply angle (0xB6→0x92)")]),
                        Line::from(vec![key("q"), Span::raw(" / "), key("Esc"), Span::raw(" Quit")]),
                    ];
                    let right = Paragraph::new(motor_lines.into_iter().chain(tele_lines).collect::<Vec<_>>())
                        .block(Block::default().borders(Borders::ALL).title("Help: Motor / Telemetry"));
                    f.render_widget(right, keys_chunks[1]);
                }
            }

            // Footer info (moved header)
            let rx_age_ms = last_rx.elapsed().as_millis() as u64;
            let rx_color = if rx_age_ms < 100 { Color::Green } else if rx_age_ms < 500 { Color::Yellow } else { Color::Red };
            let footer_line = Line::from(vec![
                Span::styled("port:", Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{}", port), Style::default().fg(Color::White)),
                Span::raw("  "),
                Span::styled("id:", Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{:03X}", 0x140 + motor_id), Style::default().fg(Color::Cyan)),
                Span::raw("  "),
                Span::styled("can:", Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{:?}", bitrate), Style::default().fg(Color::Magenta)),
                Span::raw("  "),
                Span::styled("sbaud:", Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{}", serial_baud), Style::default().fg(Color::White)),
                Span::raw("  "),
                Span::styled("speed:", Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{:.2} dps", (target_speed_x100 as f32)/100.0), Style::default().fg(Color::Green)),
                Span::raw("  "),
                Span::styled("angle:", Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{:.2}°", (angle_x100 as f32)/100.0), Style::default().fg(Color::Cyan)),
                Span::raw("  "),
                Span::styled("frames:", Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{}", rows.len()), Style::default().fg(Color::White)),
                Span::raw("  "),
                Span::styled("last_rx:", Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{}ms", rx_age_ms), Style::default().fg(rx_color)),
            ]);
            let footer = Paragraph::new(footer_line);
            f.render_widget(footer, chunks[2]);
        })?;

        // Input handling
        if event::poll(Duration::from_millis(1))? {
            if let Event::Key(key) = event::read()? {
                match key.code {
                    KeyCode::Char('q') | KeyCode::Esc | KeyCode::Char('c') if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) => break,
                    KeyCode::Char('1') => { tab = Tab::Telemetry; }
                    KeyCode::Char('2') => { tab = Tab::Frames; }
                    KeyCode::Char('3') => { tab = Tab::Help; }
                    KeyCode::Tab => { tab = match tab { Tab::Telemetry => Tab::Frames, Tab::Frames => Tab::Help, Tab::Help => Tab::Telemetry }; }
                    KeyCode::BackTab => { tab = match tab { Tab::Telemetry => Tab::Help, Tab::Help => Tab::Frames, Tab::Frames => Tab::Telemetry }; }
                    KeyCode::Char('r') => { rows.push(FrameRow { id: 0x140 + motor_id, data: vec![0x77,0,0,0,0,0,0,0], extended: false, ts: Instant::now() }); let _ = send_cmd(&mut slcan, motor_id, [0x77,0,0,0,0,0,0,0]); }
                    KeyCode::Char('k') => { rows.push(FrameRow { id: 0x140 + motor_id, data: vec![0x78,0,0,0,0,0,0,0], extended: false, ts: Instant::now() }); let _ = send_cmd(&mut slcan, motor_id, [0x78,0,0,0,0,0,0,0]); }
                    KeyCode::Char('x') => { rows.push(FrameRow { id: 0x140 + motor_id, data: vec![0x81,0,0,0,0,0,0,0], extended: false, ts: Instant::now() }); let _ = send_cmd(&mut slcan, motor_id, [0x81,0,0,0,0,0,0,0]); target_speed_x100 = 0; }
                    KeyCode::Char('0') => { target_speed_x100 = 0; rows.push(FrameRow { id: 0x140 + motor_id, data: build_speed_bytes(0), extended: false, ts: Instant::now() }); let _ = send_speed(&mut slcan, motor_id, target_speed_x100); }
                    KeyCode::Char('+') | KeyCode::Char('=') => { target_speed_x100 = target_speed_x100.saturating_add(500); rows.push(FrameRow { id: 0x140 + motor_id, data: build_speed_bytes(target_speed_x100), extended: false, ts: Instant::now() }); let _ = send_speed(&mut slcan, motor_id, target_speed_x100); }
                    KeyCode::Char('-') | KeyCode::Char('_') => { target_speed_x100 = target_speed_x100.saturating_sub(500); rows.push(FrameRow { id: 0x140 + motor_id, data: build_speed_bytes(target_speed_x100), extended: false, ts: Instant::now() }); let _ = send_speed(&mut slcan, motor_id, target_speed_x100); }
                    KeyCode::Char('p') => { rows.push(FrameRow { id: 0x140 + motor_id, data: build_pos_bytes(9000), extended: false, ts: Instant::now() }); let _ = send_position(&mut slcan, motor_id, 9000); }
                    KeyCode::Char('a') => { rows.push(FrameRow { id: 0x140 + motor_id, data: vec![0x92,0,0,0,0,0,0,0], extended: false, ts: Instant::now() }); let _ = send_cmd(&mut slcan, motor_id, [0x92,0,0,0,0,0,0,0]); }
                    KeyCode::Char('s') => { rows.push(FrameRow { id: 0x140 + motor_id, data: vec![0x9C,0,0,0,0,0,0,0], extended: false, ts: Instant::now() }); let _ = send_cmd(&mut slcan, motor_id, [0x9C,0,0,0,0,0,0,0]); }
                    KeyCode::Char('A') => { // Enable Active Reply for angle (0x92) @ 50ms interval
                        let data = [0xB6, 0x92, 0x01, 0x05, 0x00, 0x00, 0x00, 0x00];
                        rows.push(FrameRow { id: 0x140 + motor_id, data: data.to_vec(), extended: false, ts: Instant::now() });
                        let _ = send_cmd(&mut slcan, motor_id, data);
                    }
                    KeyCode::Up => { if tab == Tab::Frames { scroll_offset = scroll_offset.saturating_add(1); } }
                    KeyCode::Down => { if tab == Tab::Frames { scroll_offset = scroll_offset.saturating_sub(1); } }
                    KeyCode::Home => { if tab == Tab::Frames { scroll_offset = 0; } }
                    KeyCode::End => { if tab == Tab::Frames { scroll_offset = rows.len(); } }
                    _ => {}
                }
            }
        }
    }

    disable_raw_mode()?;
    crossterm::execute!(
        io::stdout(),
        crossterm::terminal::LeaveAlternateScreen
    )?;
    Ok(())
}

fn send_cmd(slcan: &mut Slcan, motor_id: u32, data: [u8;8]) -> Result<()> {
    let id = 0x140 + motor_id;
    slcan.send(&CanFrame { id, data: data.to_vec(), extended: false, rtr: false })?;
    Ok(())
}

fn send_speed(slcan: &mut Slcan, motor_id: u32, speed_x100: i32) -> Result<()> {
    let mut data = [0u8;8];
    data[0] = 0xA2;
    data[4..8].copy_from_slice(&speed_x100.to_le_bytes());
    send_cmd(slcan, motor_id, data)
}

fn send_position(slcan: &mut Slcan, motor_id: u32, angle_x100: i32) -> Result<()> {
    let mut data = [0u8;8];
    data[0] = 0xA4;
    data[4..8].copy_from_slice(&angle_x100.to_le_bytes());
    send_cmd(slcan, motor_id, data)
}

fn build_speed_bytes(speed_x100: i32) -> Vec<u8> {
    let mut v = vec![0u8;8];
    v[0] = 0xA2;
    v[4..8].copy_from_slice(&speed_x100.to_le_bytes());
    v
}

fn build_pos_bytes(angle_x100: i32) -> Vec<u8> {
    let mut v = vec![0u8;8];
    v[0] = 0xA4;
    v[4..8].copy_from_slice(&angle_x100.to_le_bytes());
    v
}

fn classify_row(id: u32, motor_id: u32, data: &[u8]) -> (&'static str, String) {
    let dir = if id == 0x140 + motor_id { "TX" } else if id == 0x240 + motor_id { "RX" } else { "--" };
    let kind = if let Some(cmd) = data.get(0) {
        match *cmd {
            0x92 => "angle(0x92)",
            0x9A => "status1(0x9A)",
            0x9C => "status2(0x9C)",
            0xA2 => "speed(0xA2)",
            0xA4 => "pos(0xA4)",
            0x77 => "brake_release(0x77)",
            0x78 => "brake_lock(0x78)",
            0x81 => "stop(0x81)",
            _ => "other",
        }.to_string()
    } else { String::from("") };
    (dir, kind)
}


