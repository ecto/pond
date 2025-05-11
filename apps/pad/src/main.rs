#![allow(deprecated)]

use bevy::prelude::*;
use bevy::math::EulerRot;
use ui_overlay::UiOverlayPlugin;
use rand::Rng;
use bevy::pbr::wireframe::WireframePlugin;
use bevy::pbr::wireframe::WireframeConfig;
use bevy::render::mesh::{Mesh, PrimitiveTopology, Indices};
use bevy::render::render_asset::RenderAssetUsages;
use bevy::window::{PrimaryWindow, WindowPlugin, WindowResolution, Window};
use bevy::render::camera::RenderTarget;
use bevy::window::WindowRef;
use bevy::text::Text2dBounds;

// Resource to keep track of the temporary splash window entity.
#[derive(Resource, Deref)]
struct SplashWindow(Entity);

// Path to embedded monospace font for the splash.
const SPLASH_FONT_BYTES: &[u8] = include_bytes!("../../../assets/fonts/SpaceMono-Regular.ttf");

// Status messages shown under the title.
const STATUS_MESSAGES: [&str; 5] = [
    "Starting…",
    "Loading resources…",
    "Configuring scene…",
    "Almost ready…",
    "Done!",
];

#[derive(Resource, Deref)]
struct StatusText(Entity);

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                resolution: WindowResolution::new(1280.0, 720.0),
                title: "Pad".into(),
                visible: false, // hide until splash completes
                ..default()
            }),
            ..default()
        }))
        .add_plugins(WireframePlugin)
        .insert_resource(WireframeConfig { global: false, ..Default::default() })
        .add_plugins(UiOverlayPlugin)
        .init_state::<AppState>()
        .add_systems(OnEnter(AppState::Splash), splash_setup)
        .add_systems(Update, splash_timer.run_if(in_state(AppState::Splash)))
        .add_systems(Update, splash_status_update.run_if(in_state(AppState::Splash)))
        .add_systems(OnExit(AppState::Splash), splash_cleanup)
        .add_systems(OnEnter(AppState::InGame), setup)
        .run();
}

/// Sets up a basic 3-D scene: camera, light, and a simple cube.
fn setup(mut commands: Commands, mut meshes: ResMut<Assets<Mesh>>, mut materials: ResMut<Assets<StandardMaterial>>) {
    // Global ambient light so unlit areas aren't pitch black.
    commands.insert_resource(AmbientLight {
        color: Color::WHITE,
        brightness: 0.3,
    });

    // Light
    commands.spawn(PointLightBundle {
        point_light: PointLight {
            intensity: 1500.0,
            shadows_enabled: true,
            ..default()
        },
        transform: Transform::from_xyz(4.0, 8.0, 4.0),
        ..default()
    });

    // Directional (sun) light.
    commands.spawn(DirectionalLightBundle {
        directional_light: DirectionalLight {
            illuminance: 5000.0,
            shadows_enabled: true,
            ..default()
        },
        transform: Transform::from_rotation(Quat::from_euler(EulerRot::YXZ, -std::f32::consts::FRAC_PI_4, -std::f32::consts::FRAC_PI_4, 0.0)),
        ..default()
    });

    // Cube
    commands.spawn(PbrBundle {
        mesh: meshes.add(Mesh::from(shape::Cube { size: 1.0 })),
        material: materials.add(StandardMaterial {
            base_color: Color::rgb(0.8, 0.7, 0.6),
            ..default()
        }),
        ..default()
    });

    // --- Ground grid composed of lines (no diagonals) ---
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
        // Lines parallel to X (varying in Z)
        push_line(Vec3::new(-half, 0.0, offset), Vec3::new(half, 0.0, offset));
        // Lines parallel to Z (varying in X)
        push_line(Vec3::new(offset, 0.0, -half), Vec3::new(offset, 0.0, half));
    }

    let mut grid_mesh = Mesh::new(PrimitiveTopology::LineList, RenderAssetUsages::default());
    grid_mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    grid_mesh.insert_indices(Indices::U32(indices));

    let grid_handle = meshes.add(grid_mesh);

    commands.spawn(PbrBundle {
        mesh: grid_handle,
        material: materials.add(StandardMaterial {
            base_color: Color::rgb(0.8, 0.8, 0.8),
            emissive: Color::rgb(0.8, 0.8, 0.8),
            unlit: true,
            cull_mode: None, // visible from underside
            ..default()
        }),
        ..default()
    });

    // --- Example point cloud (simulated from LIDAR / RealSense) ---
    let mut rng = rand::thread_rng();
    for _ in 0..1500 {
        let x = rng.gen_range(-2.0..2.0);
        let y = rng.gen_range(0.0..2.0);
        let z = rng.gen_range(-2.0..2.0);
        let color = Color::rgb_linear(rng.gen(), rng.gen(), rng.gen());
        commands.spawn(PbrBundle {
            mesh: meshes.add(Mesh::from(shape::Cube { size: 0.03 })),
            material: materials.add(StandardMaterial { base_color: color, emissive: color, ..default() }),
            transform: Transform::from_translation(Vec3::new(x, y, z)),
            ..default()
        });
    }

    // --- Camera position / orientation indicator (axes) ---
    let axis_len = 0.3;
    let axis_thickness = 0.01;

    // X axis (red)
    commands.spawn(PbrBundle {
        mesh: meshes.add(Mesh::from(shape::Cube { size: 1.0 })),
        material: materials.add(StandardMaterial { base_color: Color::RED, emissive: Color::RED, ..default() }),
        transform: Transform::from_scale(Vec3::new(axis_len, axis_thickness, axis_thickness))
            .with_translation(Vec3::new(axis_len / 2.0, 0.0, 0.0)),
        ..default()
    });

    // Y axis (green)
    commands.spawn(PbrBundle {
        mesh: meshes.add(Mesh::from(shape::Cube { size: 1.0 })),
        material: materials.add(StandardMaterial { base_color: Color::GREEN, emissive: Color::GREEN, ..default() }),
        transform: Transform::from_scale(Vec3::new(axis_thickness, axis_len, axis_thickness))
            .with_translation(Vec3::new(0.0, axis_len / 2.0, 0.0)),
        ..default()
    });

    // Z axis (blue)
    commands.spawn(PbrBundle {
        mesh: meshes.add(Mesh::from(shape::Cube { size: 1.0 })),
        material: materials.add(StandardMaterial { base_color: Color::BLUE, emissive: Color::BLUE, ..default() }),
        transform: Transform::from_scale(Vec3::new(axis_thickness, axis_thickness, axis_len))
            .with_translation(Vec3::new(0.0, 0.0, -axis_len / 2.0)),
        ..default()
    });
}

// --- App state definitions ---
#[derive(States, Debug, Clone, Eq, PartialEq, Hash, Default)]
enum AppState {
    #[default]
    Splash,
    InGame,
}

// Marker component for splash entities so we can clean them up easily.
#[derive(Component)]
struct SplashScreen;

// Simple countdown timer resource
#[derive(Resource, Deref, DerefMut)]
struct SplashTimer(Timer);

// Spawns a very basic splash screen: a 2-D camera and some centered text.
fn splash_setup(mut commands: Commands, mut fonts: ResMut<Assets<Font>>) {
    // Create a dedicated, border-less splash window.
    let splash_window = commands
        .spawn(Window {
            resolution: WindowResolution::new(600.0, 350.0),
            title: "Pad Loading".into(),
            decorations: false,
            resizable: false,
            ..default()
        })
        .id();

    // Remember the window entity so we can close it later.
    commands.insert_resource(SplashWindow(splash_window));

    // Camera
    commands.spawn((
        Camera2dBundle {
            camera: Camera {
                target: RenderTarget::Window(WindowRef::Entity(splash_window)),
                ..default()
            },
            ..default()
        },
        SplashScreen,
    ));

    // Background panel so the splash stands out (dark slate colour).
    commands.spawn((
        SpriteBundle {
            sprite: Sprite {
                color: Color::hex("0000FF").unwrap(),
                custom_size: Some(Vec2::new(1.0, 1.0)), // scaled by camera view
                ..default()
            },
            transform: Transform::from_scale(Vec3::new(2000.0, 2000.0, -1.0)),
            ..default()
        },
        SplashScreen,
    ));

    // Add the embedded monospace font to the asset system (instant, no IO).
    let font_handle = fonts.add(Font::try_from_bytes(SPLASH_FONT_BYTES.to_vec()).unwrap());

    // Main title text (pseudo-bold by drawing twice with slight offset)
    let title_style = TextStyle {
        font: font_handle.clone(),
        font_size: 72.0,
        color: Color::WHITE,
        ..default()
    };

    // Base layer
    commands.spawn((
        Text2dBundle {
            text: Text::from_section("POND", title_style.clone()),
            text_2d_bounds: Text2dBounds { size: Vec2::new(800.0, 300.0) },
            text_anchor: bevy::sprite::Anchor::Center,
            transform: Transform::from_translation(Vec3::new(0.0, 0.0, 1.0)),
            ..default()
        },
        SplashScreen,
    ));
    // Offset layer to mimic bold
    commands.spawn((
        Text2dBundle {
            text: Text::from_section("POND", title_style),
            text_2d_bounds: Text2dBounds { size: Vec2::new(800.0, 300.0) },
            text_anchor: bevy::sprite::Anchor::Center,
            transform: Transform::from_translation(Vec3::new(1.0, 0.0, 1.01)),
            ..default()
        },
        SplashScreen,
    ));

    // Status text entity (initially first message)
    let status_entity = commands
        .spawn((
            Text2dBundle {
                text: Text::from_section(
                    STATUS_MESSAGES[0],
                    TextStyle {
                        font: font_handle,
                        font_size: 24.0,
                        color: Color::WHITE,
                        ..default()
                    },
                ),
                text_anchor: bevy::sprite::Anchor::Center,
                transform: Transform::from_translation(Vec3::new(0.0, -80.0, 1.0)),
                ..default()
            },
            SplashScreen,
        ))
        .id();

    commands.insert_resource(StatusText(status_entity));

    // Insert countdown timer – splash stays at least 5 seconds
    commands.insert_resource(SplashTimer(Timer::from_seconds(5.0, TimerMode::Once)));
}

// Progress the countdown; when finished switch to InGame state.
fn splash_timer(mut timer: ResMut<SplashTimer>, time: Res<Time>, mut next_state: ResMut<NextState<AppState>>) {
    if timer.tick(time.delta()).finished() {
        next_state.set(AppState::InGame);
    }
}

// Update status text based on elapsed time
fn splash_status_update(
    timer: Res<SplashTimer>,
    status: Res<StatusText>,
    mut query: Query<&mut Text>,
) {
    let elapsed = timer.elapsed().as_secs_f32();
    let idx = (elapsed.floor() as usize).min(STATUS_MESSAGES.len() - 1);
    if let Ok(mut text) = query.get_mut(**status) {
        if text.sections[0].value != STATUS_MESSAGES[idx] {
            text.sections[0].value = STATUS_MESSAGES[idx].to_string();
        }
    }
}

// Remove all entities tagged as part of the splash screen.
fn splash_cleanup(
    mut commands: Commands,
    query: Query<Entity, With<SplashScreen>>,
    mut window_q: Query<&mut Window, With<PrimaryWindow>>,
    splash_win: Res<SplashWindow>,
) {
    // Remove splash entities.
    for entity in &query {
        commands.entity(entity).despawn_recursive();
    }

    // Restore window to a standard size with decorations.
    if let Ok(mut primary) = window_q.get_single_mut() {
        primary.visible = true;
    }

    // Close the temporary splash window.
    commands.entity(**splash_win).despawn();
}