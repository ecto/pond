//! Sim View – 3D Visualization for Pond Simulation
//! =================================================
//! This crate provides a real-time 3D view of the Pond simulation state.
//! It can run standalone (connecting to a sim server) or be embedded in
//! the PAD application.
//!
//! ## Features
//! - Third-person camera following the robot
//! - Real-time physics visualization
//! - Ground grid and coordinate axes
//! - WebSocket connection to sim server
//!
//! ## Usage as standalone
//! ```bash
//! sim-view --server ws://localhost:8080
//! ```

use bevy::prelude::*;
use bevy::math::primitives::Cuboid;
use bevy_rapier3d::prelude::*;
use serde::{Deserialize, Serialize};

/// Configuration for the sim viewer
#[derive(Resource, Clone)]
pub struct SimViewConfig {
    pub server_address: String,
    pub follow_robot: bool,
    pub show_grid: bool,
    pub show_axes: bool,
}

impl Default for SimViewConfig {
    fn default() -> Self {
        Self {
            server_address: "ws://localhost:8080".to_string(),
            follow_robot: true,
            show_grid: true,
            show_axes: true,
        }
    }
}

/// Marker component for the robot entity
#[derive(Component)]
pub struct RobotMarker;

/// Marker component for the third-person camera
#[derive(Component)]
pub struct FollowCamera {
    pub distance: f32,
    pub height: f32,
    pub smoothness: f32,
}

impl Default for FollowCamera {
    fn default() -> Self {
        Self {
            distance: 5.0,
            height: 3.0,
            smoothness: 5.0,
        }
    }
}

/// Simulation state received from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimState {
    pub robot_position: [f32; 3],
    pub robot_rotation: [f32; 4], // quaternion
    pub timestamp: f64,
}

/// Initialize the sim viewer with custom config
pub fn sim_view_app(config: SimViewConfig) -> App {
    let mut app = App::new();

    app.add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Pond Sim View".into(),
                resolution: bevy::window::WindowResolution::new(1920.0, 1080.0),
                ..Default::default()
            }),
            ..default()
        }))
        .add_plugins(RapierPhysicsPlugin::<NoUserData>::default())
        .insert_resource(config)
        .add_systems(Startup, setup)
        .add_systems(Update, (update_camera, update_sim_state));

    app
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    config: Res<SimViewConfig>,
) {
    // Global ambient light
    commands.insert_resource(AmbientLight {
        color: Color::WHITE,
        brightness: 0.3,
    });

    // Directional (sun) light
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

    // Ground plane (physics)
    commands
        .spawn(TransformBundle::from(Transform::from_xyz(0.0, -0.1, 0.0)))
        .insert(Collider::cuboid(50.0, 0.1, 50.0));

    if config.show_grid {
        spawn_grid(&mut commands, &mut meshes, &mut materials);
    }

    if config.show_axes {
        spawn_axes(&mut commands, &mut meshes, &mut materials);
    }

    // Robot visuals are driven by server state; no local placeholder geometry
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

    // X axis (red)
    commands.spawn(PbrBundle {
        mesh: meshes.add(Cuboid::new(axis_len, axis_thickness, axis_thickness)),
        material: materials.add(StandardMaterial {
            base_color: Color::rgb(1.0, 0.0, 0.0),
            emissive: Color::rgb(1.0, 0.0, 0.0),
            unlit: true,
            ..default()
        }),
        transform: Transform::from_translation(Vec3::new(axis_len / 2.0, 0.0, 0.0)),
        ..default()
    });

    // Y axis (green)
    commands.spawn(PbrBundle {
        mesh: meshes.add(Cuboid::new(axis_thickness, axis_len, axis_thickness)),
        material: materials.add(StandardMaterial {
            base_color: Color::rgb(0.0, 1.0, 0.0),
            emissive: Color::rgb(0.0, 1.0, 0.0),
            unlit: true,
            ..default()
        }),
        transform: Transform::from_translation(Vec3::new(0.0, axis_len / 2.0, 0.0)),
        ..default()
    });

    // Z axis (blue)
    commands.spawn(PbrBundle {
        mesh: meshes.add(Cuboid::new(axis_thickness, axis_thickness, axis_len)),
        material: materials.add(StandardMaterial {
            base_color: Color::rgb(0.0, 0.0, 1.0),
            emissive: Color::rgb(0.0, 0.0, 1.0),
            unlit: true,
            ..default()
        }),
        transform: Transform::from_translation(Vec3::new(0.0, 0.0, axis_len / 2.0)),
        ..default()
    });
}

// Robot entities are spawned from server-driven state; no local spawn here

fn update_camera(
    time: Res<Time>,
    config: Res<SimViewConfig>,
    mut camera_query: Query<(&mut Transform, &FollowCamera), Without<RobotMarker>>,
    robot_query: Query<&Transform, With<RobotMarker>>,
) {
    if !config.follow_robot {
        return;
    }

    if let Ok(robot_transform) = robot_query.get_single() {
        for (mut cam_transform, follow_cam) in camera_query.iter_mut() {
            let robot_pos = robot_transform.translation;

            // Calculate desired camera position behind and above the robot
            let desired_pos = robot_pos
                + Vec3::new(0.0, follow_cam.height, follow_cam.distance);

            // Smoothly interpolate camera position
            let smooth_factor = follow_cam.smoothness * time.delta_seconds();
            cam_transform.translation = cam_transform
                .translation
                .lerp(desired_pos, smooth_factor.min(1.0));

            // Always look at the robot
            let look_target = robot_pos + Vec3::new(0.0, 0.5, 0.0);
            if let Some(direction) = (look_target - cam_transform.translation).try_normalize() {
                cam_transform.look_to(direction, Vec3::Y);
            }
        }
    }
}

fn update_sim_state(
    // TODO: Receive state updates from sim server via WebSocket
    // For now this is a placeholder
) {
    // This will be implemented to receive SimState from the server
    // and update robot position/rotation accordingly
}

