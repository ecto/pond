use bevy::prelude::*;

// Plugin that sets up the main in-game 3-D scene once the application
// transitions to `AppState::InGame`.
// The heavy-lifting is done by the existing `setup` function defined in
// the crate root; this wrapper merely registers it at the appropriate
// lifecycle stage.

pub struct ScenePlugin;

impl Plugin for ScenePlugin {
    fn build(&self, app: &mut App) {
        use crate::setup;
        use crate::AppState;

        app.add_systems(OnEnter(AppState::InGame), setup);
    }
}