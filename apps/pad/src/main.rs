//! PAD - Pond Application Dashboard
//! =================================
//! A web + desktop teleop and monitoring system for Pond robots.
//!
//! Features:
//! - 3D simulation view (sim-view integration)
//! - Teleop controls
//! - System monitoring
//! - Multi-tab interface

use bevy::prelude::*;
use bevy::math::primitives::Cuboid;
use bevy_egui::{egui, EguiContexts, EguiPlugin};
use clap::Parser;
use sim_view::{SimViewConfig, FollowCamera, RobotMarker};
use can::Bitrate;

mod can_tab;
use can_tab::*;

#[derive(Parser, Debug)]
#[command(name = "pad")]
#[command(about = "Pond Application Dashboard - Teleop and Monitoring", long_about = None)]
struct Args {
    /// Simulation server address
    #[arg(short, long, default_value = "ws://localhost:8080")]
    server: String,

    /// Start in fullscreen mode
    #[arg(long)]
    fullscreen: bool,
}

#[derive(Resource)]
struct PadConfig {
    server_address: String,
}

#[derive(Resource, Default)]
struct TabState {
    current_tab: PadTab,
}

#[derive(Default, PartialEq, Clone, Copy)]
enum PadTab {
    #[default]
    SimView,
    Teleop,
    Can,
    Sensors,
    Diagnostics,
    Settings,
}

impl PadTab {
    fn name(&self) -> &str {
        match self {
            PadTab::SimView => "🎬 Sim View",
            PadTab::Teleop => "🎮 Teleop",
            PadTab::Can => "🔌 CAN",
            PadTab::Sensors => "📊 Sensors",
            PadTab::Diagnostics => "🔧 Diagnostics",
            PadTab::Settings => "⚙️ Settings",
        }
    }
}

fn main() {
    let args = Args::parse();

    println!("🐸 PAD - Pond Application Dashboard");
    println!("Server: {}", args.server);

    let sim_config = SimViewConfig {
        server_address: args.server.clone(),
        follow_robot: true,
        show_grid: true,
        show_axes: true,
    };

    let window_mode = if args.fullscreen {
        bevy::window::WindowMode::BorderlessFullscreen
    } else {
        bevy::window::WindowMode::Windowed
    };

    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "PAD - Pond Application Dashboard".into(),
                resolution: bevy::window::WindowResolution::new(1920.0, 1080.0),
                mode: window_mode,
                ..Default::default()
            }),
            ..default()
        }))
        .add_plugins(EguiPlugin)
        .insert_resource(sim_config)
        .insert_resource(PadConfig {
            server_address: args.server,
        })
        .insert_resource(TabState::default())
        .insert_resource(CanState::default())
        .insert_resource(CanHandle::new())
        .add_systems(Startup, setup)
        .add_systems(Update, (ui_system, update_camera_system, handle_keyboard_input, can_poll_system))
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    sim_config: Res<SimViewConfig>,
) {
    // Import setup from sim-view
    // Global ambient light
    commands.insert_resource(AmbientLight {
        color: Color::WHITE,
        brightness: 0.3,
    });

    // Directional light
    commands.spawn(DirectionalLightBundle {
        directional_light: DirectionalLight {
            illuminance: 5000.0,
            shadows_enabled: true,
            ..default()
        },
        transform: Transform::from_rotation(Quat::from_euler(
            EulerRot::YXZ,
            -std::f32::consts::FRAC_PI_4,
            -std::f32::consts::FRAC_PI_4,
            0.0,
        )),
        ..default()
    });

    // Third-person camera
    commands.spawn((
        Camera3dBundle {
            transform: Transform::from_xyz(5.0, 3.0, 5.0).looking_at(Vec3::ZERO, Vec3::Y),
            ..default()
        },
        FollowCamera::default(),
    ));

    // Ground plane
    commands
        .spawn(TransformBundle::from(Transform::from_xyz(0.0, -0.1, 0.0)))
        .insert(bevy_rapier3d::prelude::Collider::cuboid(50.0, 0.1, 50.0));

    if sim_config.show_grid {
        spawn_grid(&mut commands, &mut meshes, &mut materials);
    }

    if sim_config.show_axes {
        spawn_axes(&mut commands, &mut meshes, &mut materials);
    }

    // Test robot
    spawn_robot(&mut commands, &mut meshes, &mut materials);
}

fn spawn_grid(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    materials: &mut ResMut<Assets<StandardMaterial>>,
) {
    let grid_size: f32 = 50.0;
    let divisions: u32 = 100;
    let half = grid_size / 2.0;
    let step = grid_size / divisions as f32;

    let mut positions: Vec<[f32; 3]> = Vec::with_capacity(((divisions + 1) * 4) as usize);
    let mut indices: Vec<u32> = Vec::with_capacity(((divisions + 1) * 4) as usize);

    let mut push_line = |start: Vec3, end: Vec3| {
        let idx = positions.len() as u32;
        positions.push([start.x, start.y, start.z]);
        positions.push([end.x, end.y, end.z]);
        indices.push(idx);
        indices.push(idx + 1);
    };

    for i in 0..=divisions {
        let offset = -half + i as f32 * step;
        push_line(Vec3::new(-half, 0.0, offset), Vec3::new(half, 0.0, offset));
        push_line(Vec3::new(offset, 0.0, -half), Vec3::new(offset, 0.0, half));
    }

    let mut grid_mesh = Mesh::new(
        bevy::render::mesh::PrimitiveTopology::LineList,
        bevy::render::render_asset::RenderAssetUsages::default(),
    );
    grid_mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    grid_mesh.insert_indices(bevy::render::mesh::Indices::U32(indices));

    commands.spawn(PbrBundle {
        mesh: meshes.add(grid_mesh),
        material: materials.add(StandardMaterial {
            base_color: Color::rgb(0.3, 0.3, 0.3),
            emissive: Color::rgb(0.3, 0.3, 0.3),
            unlit: true,
            cull_mode: None,
            ..default()
        }),
        ..default()
    });
}

fn spawn_axes(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    materials: &mut ResMut<Assets<StandardMaterial>>,
) {
    let axis_len = 1.0;
    let axis_thickness = 0.02;

    // X (red), Y (green), Z (blue)
    let axes = [
        (Vec3::X, Color::rgb(1.0, 0.0, 0.0), Vec3::new(axis_len, axis_thickness, axis_thickness)),
        (Vec3::Y, Color::rgb(0.0, 1.0, 0.0), Vec3::new(axis_thickness, axis_len, axis_thickness)),
        (Vec3::Z, Color::rgb(0.0, 0.0, 1.0), Vec3::new(axis_thickness, axis_thickness, axis_len)),
    ];

    for (dir, color, scale) in axes {
        commands.spawn(PbrBundle {
            mesh: meshes.add(Cuboid::new(1.0, 1.0, 1.0)),
            material: materials.add(StandardMaterial {
                base_color: color,
                emissive: color,
                unlit: true,
                ..default()
            }),
            transform: Transform::from_scale(scale)
                .with_translation(dir * axis_len / 2.0),
            ..default()
        });
    }
}

fn spawn_robot(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    materials: &mut ResMut<Assets<StandardMaterial>>,
) {
    commands
        .spawn((
            PbrBundle {
                mesh: meshes.add(Cuboid::new(1.0, 1.0, 1.0)),
                material: materials.add(StandardMaterial {
                    base_color: Color::rgb(0.2, 0.8, 0.3),
                    metallic: 0.3,
                    perceptual_roughness: 0.8,
                    ..default()
                }),
                transform: Transform::from_xyz(0.0, 2.0, 0.0),
                ..default()
            },
            RobotMarker,
        ))
        .insert(bevy_rapier3d::prelude::RigidBody::Dynamic)
        .insert(bevy_rapier3d::prelude::Collider::cuboid(0.5, 0.5, 0.5));
}

fn update_camera_system(
    time: Res<Time>,
    sim_config: Res<SimViewConfig>,
    mut camera_query: Query<(&mut Transform, &FollowCamera), Without<RobotMarker>>,
    robot_query: Query<&Transform, With<RobotMarker>>,
) {
    if !sim_config.follow_robot {
        return;
    }

    if let Ok(robot_transform) = robot_query.get_single() {
        for (mut cam_transform, follow_cam) in camera_query.iter_mut() {
            let robot_pos = robot_transform.translation;
            let desired_pos = robot_pos + Vec3::new(0.0, follow_cam.height, follow_cam.distance);

            let smooth_factor = follow_cam.smoothness * time.delta_seconds();
            cam_transform.translation = cam_transform
                .translation
                .lerp(desired_pos, smooth_factor.min(1.0));

            let look_target = robot_pos + Vec3::new(0.0, 0.5, 0.0);
            if let Some(direction) = (look_target - cam_transform.translation).try_normalize() {
                cam_transform.look_to(direction, Vec3::Y);
            }
        }
    }
}

fn ui_system(
    mut contexts: EguiContexts,
    mut tab_state: ResMut<TabState>,
    pad_config: Res<PadConfig>,
    mut can_state: ResMut<CanState>,
    can_handle: Res<CanHandle>,
    time: Res<Time>,
) {
    let ctx = contexts.ctx_mut();

    // Top menu bar
    egui::TopBottomPanel::top("top_panel").show(ctx, |ui| {
        ui.horizontal(|ui| {
            ui.heading("🐸 PAD");
            ui.separator();

            for tab in [
                PadTab::SimView,
                PadTab::Teleop,
                PadTab::Can,
                PadTab::Sensors,
                PadTab::Diagnostics,
                PadTab::Settings,
            ] {
                if ui.selectable_label(tab_state.current_tab == tab, tab.name()).clicked() {
                    tab_state.current_tab = tab;
                }
            }

            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(format!("📡 {}", pad_config.server_address));
            });
        });
    });

    // Main content area (only show for non-SimView tabs)
    if tab_state.current_tab != PadTab::SimView {
        egui::CentralPanel::default().show(ctx, |ui| {
            match tab_state.current_tab {
                PadTab::Teleop => show_teleop_tab(ui),
                PadTab::Can => show_can_tab(ui, &mut can_state, &can_handle, &time),
                PadTab::Sensors => show_sensors_tab(ui),
                PadTab::Diagnostics => show_diagnostics_tab(ui),
                PadTab::Settings => show_settings_tab(ui, &pad_config),
                _ => {}
            }
        });
    }
}

fn show_teleop_tab(ui: &mut egui::Ui) {
    ui.heading("Teleop Controls");
    ui.separator();

    ui.label("Manual control interface coming soon...");
    ui.add_space(20.0);

    ui.horizontal(|ui| {
        if ui.button("⬆️").clicked() {
            // Forward
        }
        if ui.button("⬇️").clicked() {
            // Backward
        }
        if ui.button("⬅️").clicked() {
            // Left
        }
        if ui.button("➡️").clicked() {
            // Right
        }
    });
}

fn show_sensors_tab(ui: &mut egui::Ui) {
    ui.heading("Sensor Data");
    ui.separator();

    ui.label("Real-time sensor readings will appear here...");

    // Placeholder sensor data
    egui::Grid::new("sensors_grid")
        .striped(true)
        .show(ui, |ui| {
            ui.label("IMU:");
            ui.label("X: 0.00 Y: 0.00 Z: 0.00");
            ui.end_row();

            ui.label("Position:");
            ui.label("X: 0.00 Y: 1.00 Z: 0.00");
            ui.end_row();

            ui.label("Battery:");
            ui.label("100%");
            ui.end_row();
        });
}

fn show_diagnostics_tab(ui: &mut egui::Ui) {
    ui.heading("System Diagnostics");
    ui.separator();

    ui.label("System health and diagnostics...");
    ui.add_space(10.0);

    ui.label("✅ Simulation: Connected");
    ui.label("✅ Motors: OK");
    ui.label("✅ Sensors: OK");
    ui.label("⚠️ Network: Latency 23ms");
}

fn show_settings_tab(ui: &mut egui::Ui, config: &PadConfig) {
    ui.heading("Settings");
    ui.separator();

    ui.label(format!("Server: {}", config.server_address));
    ui.add_space(10.0);

    ui.checkbox(&mut true, "Show grid");
    ui.checkbox(&mut true, "Show axes");
    ui.checkbox(&mut true, "Follow robot camera");
}

fn show_can_tab(ui: &mut egui::Ui, state: &mut CanState, handle: &CanHandle, time: &Time) {
    // Sub-tabs for CAN
    ui.horizontal(|ui| {
        ui.selectable_value(&mut state.can_subtab, CanSubTab::Telemetry, "📊 Telemetry");
        ui.selectable_value(&mut state.can_subtab, CanSubTab::Frames, "📜 Frames");
        ui.selectable_value(&mut state.can_subtab, CanSubTab::Controls, "🎮 Controls");
    });
    ui.separator();

    match state.can_subtab {
        CanSubTab::Telemetry => show_can_telemetry(ui, state, time),
        CanSubTab::Frames => show_can_frames(ui, state),
        CanSubTab::Controls => show_can_controls(ui, state, handle),
    }
}

fn show_can_telemetry(ui: &mut egui::Ui, state: &CanState, _time: &Time) {
    ui.heading("CAN Telemetry");

    // Connection status
    let status_text = if state.connected {
        format!("✅ Connected to {}", state.port)
    } else {
        "❌ Disconnected".to_string()
    };
    ui.label(status_text);
    ui.separator();

    // Angle display
    let angle_deg = ((state.angle_x100 as f64) / 100.0).rem_euclid(360.0);
    ui.horizontal(|ui| {
        ui.label("Angle:");
        ui.label(format!("{:.2}°", angle_deg));
    });

    // Visual angle gauge (progress bar representing 0-360°)
    let ratio = (angle_deg / 360.0) as f32;
    ui.add(
        egui::ProgressBar::new(ratio)
            .text(format!("{:.1}°", angle_deg))
            .animate(false),
    );

    ui.add_space(10.0);

    // Speed display
    let speed_dps = (state.speed_target_x100 as f32) / 100.0;
    ui.horizontal(|ui| {
        ui.label("Target Speed:");
        ui.label(format!("{:.2} deg/s", speed_dps));
    });

    ui.add_space(10.0);

    // Status
    ui.horizontal(|ui| {
        ui.label("Status2:");
        ui.label(format!("0x{:02X}", state.status2));
    });

    ui.add_space(10.0);

    // Last RX indicator
    if let Some(last_rx) = state.last_rx {
        let age_ms = last_rx.elapsed().as_millis();
        let color = if age_ms < 100 {
            egui::Color32::GREEN
        } else if age_ms < 500 {
            egui::Color32::YELLOW
        } else {
            egui::Color32::RED
        };
        ui.horizontal(|ui| {
            ui.label("Last RX:");
            ui.colored_label(color, format!("{}ms ago", age_ms));
        });
    } else {
        ui.label("Last RX: Never");
    }

    // Charts would go here (simplified for now)
    ui.separator();
    ui.label(format!("Angle history: {} points", state.angle_history.len()));
    ui.label(format!("Speed history: {} points", state.speed_history.len()));
}

fn show_can_frames(ui: &mut egui::Ui, state: &mut CanState) {
    ui.heading("CAN Frames");
    ui.label(format!("Total: {} frames", state.frames.len()));
    ui.add_space(10.0);

    // Scroll controls
    ui.horizontal(|ui| {
        if ui.button("⬆ Scroll Up").clicked() {
            state.scroll_offset = state.scroll_offset.saturating_add(1);
        }
        if ui.button("⬇ Scroll Down").clicked() {
            state.scroll_offset = state.scroll_offset.saturating_sub(1);
        }
        if ui.button("🔝 Top").clicked() {
            state.scroll_offset = state.frames.len().saturating_sub(20);
        }
        if ui.button("🔚 Bottom").clicked() {
            state.scroll_offset = 0;
        }
    });

    ui.separator();

    // Frames table
    egui::ScrollArea::vertical().show(ui, |ui| {
        egui::Grid::new("frames_grid")
            .striped(true)
            .num_columns(5)
            .show(ui, |ui| {
                // Header
                ui.label(egui::RichText::new("Time").strong());
                ui.label(egui::RichText::new("Dir").strong());
                ui.label(egui::RichText::new("ID").strong());
                ui.label(egui::RichText::new("Kind").strong());
                ui.label(egui::RichText::new("Data").strong());
                ui.end_row();

                // Show last 20 frames (newest first)
                let visible = state
                    .frames
                    .iter()
                    .rev()
                    .skip(state.scroll_offset)
                    .take(20);

                for frame in visible {
                    let (dir, kind) = classify_frame(frame.id, state.motor_id, &frame.data);
                    let id_str = if frame.extended {
                        format!("{:08X}", frame.id)
                    } else {
                        format!("{:03X}", frame.id)
                    };
                    let data_str = frame
                        .data
                        .iter()
                        .map(|b| format!("{:02X}", b))
                        .collect::<Vec<_>>()
                        .join(" ");
                    let ts_ms = frame.ts.elapsed().as_millis();

                    ui.label(format!("{}ms ago", ts_ms));
                    ui.label(dir);
                    ui.label(id_str);
                    ui.label(kind);
                    ui.label(data_str);
                    ui.end_row();
                }
            });
    });
}

fn show_can_controls(ui: &mut egui::Ui, state: &mut CanState, handle: &CanHandle) {
    ui.heading("CAN Motor Controls");
    ui.separator();

    // Connection settings
    if !state.connected {
        ui.label("Connection Settings:");
        ui.horizontal(|ui| {
            ui.label("Port:");
            ui.text_edit_singleline(&mut state.port);
        });

        ui.horizontal(|ui| {
            ui.label("Motor ID:");
            ui.add(egui::DragValue::new(&mut state.motor_id).clamp_range(1..=32));
        });

        ui.horizontal(|ui| {
            ui.label("Bitrate:");
            egui::ComboBox::from_label("")
                .selected_text(format!("{:?}", state.bitrate))
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut state.bitrate, Bitrate::B1M, "1 Mbps");
                    ui.selectable_value(&mut state.bitrate, Bitrate::B500k, "500 kbps");
                    ui.selectable_value(&mut state.bitrate, Bitrate::B250k, "250 kbps");
                    ui.selectable_value(&mut state.bitrate, Bitrate::B125k, "125 kbps");
                });
        });

        if ui.button("🔌 Connect").clicked() {
            match handle.connect(&state.port, state.bitrate, state.serial_baud) {
                Ok(_) => {
                    state.connection_state = ConnectionState::Connected;
                    state.connected = true;
                }
                Err(e) => {
                    eprintln!("Failed to connect: {}", e);
                    state.connection_state = ConnectionState::Error;
                }
            }
        }
    } else {
        ui.label(format!("Connected to {} @ {:?}", state.port, state.bitrate));
        if ui.button("🔌 Disconnect").clicked() {
            handle.disconnect();
            state.connected = false;
            state.connection_state = ConnectionState::Disconnected;
        }
        ui.separator();

        // Motor controls
        ui.heading("Motor Commands");

        ui.horizontal(|ui| {
            if ui.button("🔓 Release Brake").clicked() {
                let _ = send_cmd(handle, state.motor_id, [0x77, 0, 0, 0, 0, 0, 0, 0]);
            }
            if ui.button("🔒 Lock Brake").clicked() {
                let _ = send_cmd(handle, state.motor_id, [0x78, 0, 0, 0, 0, 0, 0, 0]);
            }
            if ui.button("🛑 Stop").clicked() {
                let _ = send_cmd(handle, state.motor_id, [0x81, 0, 0, 0, 0, 0, 0, 0]);
                state.speed_target_x100 = 0;
            }
        });

        ui.add_space(10.0);

        // Speed control
        ui.label("Speed Control:");
        ui.horizontal(|ui| {
            if ui.button("➖ -5 dps").clicked() {
                state.speed_target_x100 = state.speed_target_x100.saturating_sub(500);
                let _ = send_speed(handle, state.motor_id, state.speed_target_x100);
            }
            ui.label(format!("{:.2} deg/s", (state.speed_target_x100 as f32) / 100.0));
            if ui.button("➕ +5 dps").clicked() {
                state.speed_target_x100 = state.speed_target_x100.saturating_add(500);
                let _ = send_speed(handle, state.motor_id, state.speed_target_x100);
            }
            if ui.button("0️⃣ Zero").clicked() {
                state.speed_target_x100 = 0;
                let _ = send_speed(handle, state.motor_id, 0);
            }
        });

        ui.add_space(10.0);

        // Position control
        ui.label("Position Control:");
        if ui.button("📐 Go to 90°").clicked() {
            let _ = send_position(handle, state.motor_id, 9000); // 90° × 100
        }

        ui.add_space(10.0);

        // Read commands
        ui.label("Telemetry Reads:");
        ui.horizontal(|ui| {
            if ui.button("📏 Read Angle (0x92)").clicked() {
                let _ = send_cmd(handle, state.motor_id, [0x92, 0, 0, 0, 0, 0, 0, 0]);
            }
            if ui.button("📊 Read Status2 (0x9C)").clicked() {
                let _ = send_cmd(handle, state.motor_id, [0x9C, 0, 0, 0, 0, 0, 0, 0]);
            }
        });

        if ui.button("🔁 Enable Active Reply (Angle @ 50ms)").clicked() {
            let data = [0xB6, 0x92, 0x01, 0x05, 0x00, 0x00, 0x00, 0x00];
            let _ = send_cmd(handle, state.motor_id, data);
        }
    }
}

fn handle_keyboard_input(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut tab_state: ResMut<TabState>,
) {
    // Quick tab switching with number keys
    if keyboard.just_pressed(KeyCode::Digit1) {
        tab_state.current_tab = PadTab::SimView;
    } else if keyboard.just_pressed(KeyCode::Digit2) {
        tab_state.current_tab = PadTab::Teleop;
    } else if keyboard.just_pressed(KeyCode::Digit3) {
        tab_state.current_tab = PadTab::Can;
    } else if keyboard.just_pressed(KeyCode::Digit4) {
        tab_state.current_tab = PadTab::Sensors;
    } else if keyboard.just_pressed(KeyCode::Digit5) {
        tab_state.current_tab = PadTab::Diagnostics;
    } else if keyboard.just_pressed(KeyCode::Digit6) {
        tab_state.current_tab = PadTab::Settings;
    }
}
