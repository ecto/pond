use bevy::prelude::*;
use bevy_rapier3d::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Pond Sim viewer".into(),
                ..Default::default()
            }),
            ..default()
        }))
        .add_plugins(RapierPhysicsPlugin::<NoUserData>::default())
        .add_systems(Startup, setup)
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Camera
    commands.spawn(Camera3dBundle {
        transform: Transform::from_xyz(5.0, 5.0, 5.0).looking_at(Vec3::ZERO, Vec3::Y),
        ..default()
    });

    // Light
    commands.spawn(PointLightBundle {
        point_light: PointLight { intensity: 1500.0, shadows_enabled: true, ..default() },
        transform: Transform::from_xyz(4.0, 8.0, 4.0),
        ..default()
    });

    // Ground
    commands.spawn(TransformBundle::from(Transform::from_xyz(0.0, -0.1, 0.0)))
            .insert(Collider::cuboid(10.0, 0.1, 10.0));

    // Cube mesh & material handles
    let cube_mesh = meshes.add(Mesh::from(shape::Cube { size: 1.0 }));
    let cube_mat  = materials.add(StandardMaterial { base_color: Color::GREEN, ..default() });

    commands.spawn(PbrBundle {
            mesh: cube_mesh,
            material: cube_mat,
            ..default()
        })
        .insert(RigidBody::Dynamic)
        .insert(Collider::cuboid(0.5, 0.5, 0.5));
}