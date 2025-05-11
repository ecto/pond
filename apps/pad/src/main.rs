#![allow(deprecated)]

use bevy::prelude::*;
use bevy::math::EulerRot;
use ui_overlay::UiOverlayPlugin;
use rand::Rng;
use bevy::pbr::wireframe::WireframePlugin;
use bevy::pbr::wireframe::WireframeConfig;
use bevy::render::mesh::{Mesh, PrimitiveTopology, Indices};
use bevy::render::render_asset::RenderAssetUsages;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(WireframePlugin)
        .insert_resource(WireframeConfig { global: false, ..Default::default() })
        .add_plugins(UiOverlayPlugin)
        .add_systems(Startup, setup)
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