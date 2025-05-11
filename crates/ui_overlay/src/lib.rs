use bevy::prelude::*;
use bevy::render::camera::RenderTarget;
use bevy::render::render_resource::{Extent3d, TextureDescriptor, TextureDimension, TextureFormat, TextureUsages};
use bevy_egui::{egui, EguiContexts, EguiPlugin, EguiUserTextures};
use bevy::input::ButtonInput;
use bevy::input::gamepad::{GamepadButton, GamepadButtonType, Gamepads};
use bevy::input::mouse::{MouseMotion, MouseWheel, MouseButton};
use std::f32::consts::PI;
use bevy::prelude::Time;
use bevy::diagnostic::{DiagnosticsStore, FrameTimeDiagnosticsPlugin};
use bevy::input::keyboard::KeyCode;

/// UI overlay plugin powered by `bevy_egui`.
pub struct UiOverlayPlugin;

impl Plugin for UiOverlayPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(EguiPlugin)
            .add_plugins(FrameTimeDiagnosticsPlugin)
            .init_resource::<CurrentTab>()
            .init_resource::<DesiredPreviewSize>()
            .init_resource::<OrbitCamera>()
            .init_resource::<ConnectionStatus>()
            .init_resource::<SystemMessages>()
            .init_resource::<ShowFps>()
            .add_systems(Startup, (setup_preview_texture, setup_fonts))
            .add_systems(Update, (fps_toggle, egui_ui, update_preview_texture_size, gamepad_tab_cycle, orbit_camera));
    }
}

/// Keeps a handle to the texture that the off-screen camera renders to.
#[derive(Resource, Deref)]
struct ScenePreviewImage(Handle<Image>);

/// Enumeration of the top-level UI tabs.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum AppTab {
    Scene,
    Teleop,
    Inspector,
    Log,
}

impl AppTab {
    const ALL: [AppTab; 4] = [AppTab::Scene, AppTab::Teleop, AppTab::Inspector, AppTab::Log];

    fn title(self) -> &'static str {
        match self {
            AppTab::Scene => "Scene",
            AppTab::Teleop => "Tele-op",
            AppTab::Inspector => "Inspector",
            AppTab::Log => "Log",
        }
    }

    fn next(self) -> Self {
        use AppTab::*;
        match self {
            Scene => Teleop,
            Teleop => Inspector,
            Inspector => Log,
            Log => Scene,
        }
    }

    fn prev(self) -> Self {
        use AppTab::*;
        match self {
            Scene => Log,
            Teleop => Scene,
            Inspector => Teleop,
            Log => Inspector,
        }
    }
}

#[derive(Resource, Deref, DerefMut)]
struct CurrentTab(AppTab);

impl Default for CurrentTab {
    fn default() -> Self {
        CurrentTab(AppTab::Scene)
    }
}

/// Marker component for the off-screen scene preview camera.
#[derive(Component)]
struct PreviewCamera;

/// Simple orbit-camera controller (yaw/pitch around target, adjustable radius).
#[derive(Resource)]
struct OrbitCamera {
    yaw: f32,
    pitch: f32,
    radius: f32,
    target: Vec3,
}

impl Default for OrbitCamera {
    fn default() -> Self {
        OrbitCamera {
            yaw: -45.0_f32.to_radians(),
            pitch: -30.0_f32.to_radians(),
            radius: 7.0,
            target: Vec3::ZERO,
        }
    }
}

/// Desired size for the preview render target in physical pixels.
#[derive(Resource, Default, Clone, Copy, Debug, PartialEq, Eq)]
struct DesiredPreviewSize {
    width: u32,
    height: u32,
}

/// Possible connection states for the droid realtime feed.
#[derive(Resource, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

impl Default for ConnectionStatus {
    fn default() -> Self {
        ConnectionStatus::Disconnected
    }
}

/// Rolling list of system messages displayed in the status bar.
#[derive(Resource, Default, Debug)]
pub struct SystemMessages(pub Vec<String>);

/// Whether to show the FPS meter.
#[derive(Resource)]
struct ShowFps(pub bool);

impl Default for ShowFps {
    fn default() -> Self {
        ShowFps(true)
    }
}

/// Creates a texture, a second camera that renders the current world into it, and
/// registers the texture with `bevy_egui` so it can be displayed in the UI.
fn setup_preview_texture(
    mut commands: Commands,
    mut images: ResMut<Assets<Image>>,
    mut egui_textures: ResMut<EguiUserTextures>,
) {
    let size = Extent3d {
        width: 1024,
        height: 1024,
        ..default()
    };

    let mut image = Image {
        texture_descriptor: TextureDescriptor {
            label: None,
            size,
            dimension: TextureDimension::D2,
            format: TextureFormat::Bgra8UnormSrgb,
            mip_level_count: 1,
            sample_count: 1,
            usage: TextureUsages::TEXTURE_BINDING
                | TextureUsages::COPY_DST
                | TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        },
        ..default()
    };
    image.resize(size);
    let image_handle = images.add(image);

    egui_textures.add_image(image_handle.clone());
    commands.insert_resource(ScenePreviewImage(image_handle.clone()));

    commands.spawn((Camera3dBundle {
        camera: {
            let mut cam = Camera3dBundle::default().camera;
            cam.order = -1;
            cam.target = RenderTarget::Image(image_handle.clone().into());
            cam.clear_color = ClearColorConfig::Custom(Color::NONE);
            cam
        },
        transform: Transform::from_xyz(5.0, 5.0, 5.0).looking_at(Vec3::ZERO, Vec3::Y),
        ..default()
    }, PreviewCamera));
}

/// Inject a custom monospace font (JetBrains Mono) into egui and set it as the
/// highest-priority font for the `Monospace` family.  This is done once at
/// startup after the `EguiPlugin` is registered.  The font file is embedded at
/// compile time via `include_bytes!`; simply replace the `MONO_FONT_BYTES`
/// constant or load bytes dynamically if you prefer.
fn setup_fonts(mut contexts: EguiContexts) {
    let ctx = contexts.ctx_mut();

    let mut fonts = egui::FontDefinitions::default();

    // Candidate fonts in priority order.
    const CANDIDATES: &[&str] = &[
        "assets/fonts/BerkeleyMono-Regular.ttf",
        "assets/fonts/SpaceMono-Regular.ttf",
        "assets/fonts/JetBrainsMono-Regular.ttf",
    ];

    let mut picked: Option<Vec<u8>> = None;
    let mut picked_name: &str = "";
    for path in CANDIDATES {
        if let Ok(bytes) = std::fs::read(path) {
            picked = Some(bytes);
            picked_name = path;
            break;
        }
    }

    if let Some(bytes) = picked {
        fonts.font_data.insert(
            "custom_mono".to_owned(),
            egui::FontData::from_owned(bytes),
        );

        for family in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
            fonts
                .families
                .entry(family)
                .or_default()
                .insert(0, "custom_mono".to_owned());
        }
        info!("Loaded custom monospace font from {picked_name}");
    } else {
        warn!("No custom font found – using egui defaults");
    }

    ctx.set_fonts(fonts);
}

/// Main egui drawing system with a top tab-bar.
fn egui_ui(
    preview: Option<Res<ScenePreviewImage>>,
    mut contexts: EguiContexts,
    mut current_tab: ResMut<CurrentTab>,
    mut desired_size: ResMut<DesiredPreviewSize>,
    connection_status: Res<ConnectionStatus>,
    system_messages: Res<SystemMessages>,
    show_fps: Res<ShowFps>,
    diagnostics: Res<DiagnosticsStore>,
) {
    let tex_id = preview
        .as_ref()
        .and_then(|h| contexts.image_id(&***h));

    let ctx = contexts.ctx_mut();

    // Top tab-bar
    egui::TopBottomPanel::top("tab_bar").show(ctx, |ui| {
        ui.horizontal(|ui| {
            for tab in AppTab::ALL.iter() {
                let selected = **current_tab == *tab;
                if ui.selectable_label(selected, tab.title()).clicked() {
                    **current_tab = *tab;
                }
            }
        });
    });

    let pixels_per_point = ctx.pixels_per_point();

    egui::CentralPanel::default()
        .frame(egui::Frame::none())
        .show(ctx, |ui| {
        match **current_tab {
            AppTab::Scene => {
                let avail = ui.available_size();
                let desired_px = (avail * pixels_per_point).max(egui::vec2(1.0,1.0));
                desired_size.width = desired_px.x.round() as u32;
                desired_size.height = desired_px.y.round() as u32;

                if let Some(id) = tex_id {
                    ui.image(egui::load::SizedTexture::new(id, avail));
                } else {
                    ui.label("No preview available");
                }
            }
            AppTab::Teleop => draw_teleop_tab(ui),
            AppTab::Inspector => draw_inspector_tab(ui),
            AppTab::Log => draw_log_tab(ui),
        }
    });

    // --- Status bar at the bottom ---
    egui::TopBottomPanel::bottom("status_bar").show(ctx, |ui| {
        ui.horizontal(|ui| {
            // Connection status indicator
            use ConnectionStatus::*;
            let (label, color) = match *connection_status {
                Disconnected => ("Disconnected", egui::Color32::from_rgb(200, 0, 0)),
                Connecting => ("Connecting", egui::Color32::from_rgb(200, 200, 0)),
                Connected => ("Connected", egui::Color32::from_rgb(0, 200, 0)),
                Error => ("Error", egui::Color32::from_rgb(200, 0, 0)),
            };
            ui.colored_label(color, format!("● {label}"));

            ui.separator();

            // Show the most recent few system messages (if any).
            const MAX_RECENT: usize = 3;
            let start = system_messages.0.len().saturating_sub(MAX_RECENT);
            for msg in &system_messages.0[start..] {
                ui.label(msg);
            }

            if show_fps.0 {
                if let Some(fps) = diagnostics
                    .get(&FrameTimeDiagnosticsPlugin::FPS)
                    .and_then(|d| d.smoothed())
                {
                    ui.separator();
                    ui.label(format!("{fps:.1} FPS"));
                }
            }
        });
    });
}

fn draw_teleop_tab(ui: &mut egui::Ui) {
    ui.heading("Tele-operation");
    ui.label("(Controller / virtual joystick UI will go here)");
}

fn draw_inspector_tab(ui: &mut egui::Ui) {
    ui.heading("Inspector");
    ui.label("(Entity/component details go here)");
}

fn draw_log_tab(ui: &mut egui::Ui) {
    ui.heading("Log");
    ui.label("(Structured log output goes here)");
}

/// Cycle tabs with controller shoulder buttons.
fn gamepad_tab_cycle(
    buttons: Res<ButtonInput<GamepadButton>>,
    gamepads: Res<Gamepads>,
    mut current_tab: ResMut<CurrentTab>,
) {
    // Cycle through tabs using the shoulder buttons of any connected gamepad.
    for gamepad in gamepads.iter() {
        let left = GamepadButton { gamepad, button_type: GamepadButtonType::LeftTrigger };
        let right = GamepadButton { gamepad, button_type: GamepadButtonType::RightTrigger };

        if buttons.just_pressed(left) {
            **current_tab = current_tab.prev();
        }
        if buttons.just_pressed(right) {
            **current_tab = current_tab.next();
        }
    }
}

/// Mouse-driven orbit controls for the preview camera.
fn orbit_camera(
    mut motion_evr: EventReader<MouseMotion>,
    mut scroll_evr: EventReader<MouseWheel>,
    buttons: Res<ButtonInput<MouseButton>>,
    mut contexts: EguiContexts,
    mut controller: ResMut<OrbitCamera>,
    time: Res<Time>,
    mut query: Query<&mut Transform, With<PreviewCamera>>,
) {
    // Ignore if egui wants the pointer (e.g. dragging windows) to avoid conflict.
    if contexts.ctx_mut().wants_pointer_input() {
        motion_evr.clear();
        scroll_evr.clear();
        return;
    }

    // Auto orbit every frame.
    let auto_speed = 0.2; // radians per second (adjust as desired)
    controller.yaw += auto_speed * time.delta_seconds();

    let mut changed = true;

    // Rotate with left mouse drag.
    if buttons.pressed(MouseButton::Left) {
        for ev in motion_evr.read() {
            let delta = ev.delta;
            let sensitivity = 0.005;
            controller.yaw -= delta.x * sensitivity;
            controller.pitch -= delta.y * sensitivity;
            controller.pitch = controller.pitch.clamp(-PI / 2.0 + 0.1, PI / 2.0 - 0.1);
            changed = true;
        }
    } else {
        motion_evr.clear(); // We are not using them, just drop.
    }

    // Zoom with scroll wheel.
    for ev in scroll_evr.read() {
        let scroll = ev.y; // Positive for up.
        let zoom_sensitivity = 0.1;
        controller.radius = (controller.radius - scroll * zoom_sensitivity).clamp(1.0, 100.0);
        changed = true;
    }

    if !changed {
        return;
    }

    if let Ok(mut transform) = query.get_single_mut() {
        let (sin_yaw, cos_yaw) = controller.yaw.sin_cos();
        let (sin_pitch, cos_pitch) = controller.pitch.sin_cos();

        let dir = Vec3::new(cos_pitch * cos_yaw, sin_pitch, cos_pitch * sin_yaw);
        transform.translation = controller.target + dir * controller.radius;
        transform.look_at(controller.target, Vec3::Y);
    }
}

/// Resize the off-screen render texture if the UI layout demands a new size.
fn update_preview_texture_size(
    desired: Res<DesiredPreviewSize>,
    preview: Option<Res<ScenePreviewImage>>,
    mut images: ResMut<Assets<Image>>,
) {
    if !desired.is_changed() {
        return;
    }

    let Some(preview) = preview else { return };
    if let Some(image) = images.get_mut(&**preview) {
        let current = image.texture_descriptor.size;
        if current.width != desired.width || current.height != desired.height {
            let new_size = Extent3d { width: desired.width.max(1), height: desired.height.max(1), ..current };
            image.texture_descriptor.size = new_size;
            image.resize(new_size);
        }
    }
}

/// New system: toggle FPS with 'F' key
fn fps_toggle(
    keys: Res<ButtonInput<KeyCode>>,
    mut show_fps: ResMut<ShowFps>,
) {
    if keys.just_pressed(KeyCode::KeyF) {
        show_fps.0 = !show_fps.0;
    }
}