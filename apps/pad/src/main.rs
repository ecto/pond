#![allow(deprecated)]

use bevy::prelude::*;
use bevy::math::EulerRot;
use ui_overlay::UiOverlayPlugin;
use rand::Rng;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
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

    // Ground plane (X/Y).
    commands.spawn(PbrBundle {
        mesh: meshes.add(Mesh::from(shape::Plane { size: 50.0 , subdivisions: 0})),
        material: materials.add(StandardMaterial {
            base_color: Color::rgb(0.2, 0.2, 0.2),
            perceptual_roughness: 1.0,
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