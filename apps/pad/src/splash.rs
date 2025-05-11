use bevy::prelude::*;

// Plugin that groups all splash-screen systems together.
// It keeps the splash logic in the root crate intact but
// exposes it as a tidy Bevy `Plugin` so `main.rs` only has
// to add the plugin.
//
// NOTE: The actual system functions (`splash_setup`,
// `splash_timer`, etc.) are still defined in the crate root.
// This keeps the refactor minimal while enabling clean wiring.

pub struct SplashPlugin;

impl Plugin for SplashPlugin {
    fn build(&self, app: &mut App) {
        use crate::{splash_setup, splash_timer, splash_status_update, splash_cleanup};
        // Import the shared `AppState` enum from the crate root.
        use crate::AppState;

        app
            // Do NOT re-init the state; `main.rs` already does that.
            .add_systems(OnEnter(AppState::Splash), splash_setup)
            .add_systems(Update, splash_timer.run_if(in_state(AppState::Splash)))
            .add_systems(Update, splash_status_update.run_if(in_state(AppState::Splash)))
            .add_systems(OnExit(AppState::Splash), splash_cleanup);
    }
}