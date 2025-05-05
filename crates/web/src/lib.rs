pub mod app;

// ======= WASM-SPECIFIC CODE =======
// All code below is compiled ONLY for wasm32 target
#[cfg(target_arch = "wasm32")]
mod wasm {
    use wasm_bindgen::prelude::wasm_bindgen;
    use wasm_bindgen::JsCast;
    use web_sys::{window, console};
    use crate::app::App;
    use log::Level;

    #[wasm_bindgen]
    pub fn hydrate() {
        // initializes logging using the `log` crate
        _ = console_log::init_with_level(Level::Debug);
        console_error_panic_hook::set_once();

        // Find the #app element and mount to it instead of the body
        let window = match window() {
            Some(win) => win,
            None => {
                console::error_1(&"No global window exists".into());
                // Fall back to mounting to body if window doesn't exist
                leptos::mount_to_body(App);
                return;
            }
        };

        let document = match window.document() {
            Some(doc) => doc,
            None => {
                console::error_1(&"No document exists on window".into());
                // Fall back to mounting to body if document doesn't exist
                leptos::mount_to_body(App);
                return;
            }
        };

        // Try to find the #app element
        match document.get_element_by_id("app") {
            Some(el) => {
                // Clear existing content
                el.set_inner_html("");
                // Mount our app to the #app element
                leptos::mount_to(el.unchecked_into(), App);
            },
            None => {
                // If #app doesn't exist, fall back to mounting to body
                console::warn_1(&"#app element not found, mounting to body instead".into());
                leptos::mount_to_body(App);
            }
        }
    }

    // Add a mount_to function that can target a specific element
    #[wasm_bindgen]
    pub fn mount_to(selector: &str) {
        // initializes logging using the `log` crate
        _ = console_log::init_with_level(Level::Debug);
        console_error_panic_hook::set_once();

        // Get the element by selector - with better error handling
        let window = match window() {
            Some(win) => win,
            None => {
                console::error_1(&"No global window exists".into());
                return;
            }
        };

        let document = match window.document() {
            Some(doc) => doc,
            None => {
                console::error_1(&"No document exists on window".into());
                return;
            }
        };

        let element = match document.query_selector(selector) {
            Ok(Some(el)) => el,
            Ok(None) => {
                console::error_1(&format!("No element found with selector: {}", selector).into());
                return;
            },
            Err(err) => {
                console::error_1(&format!("Error selecting element: {:?}", err).into());
                return;
            }
        };

        // Clear any existing content
        element.set_inner_html("");

        // Mount the app to the element
        leptos::mount_to(element.unchecked_into(), App);
    }
}
