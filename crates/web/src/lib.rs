pub mod app;

// ======= WASM-SPECIFIC CODE =======
// All code below is compiled ONLY for wasm32 target
#[cfg(target_arch = "wasm32")]
mod wasm {
    use wasm_bindgen::prelude::wasm_bindgen;
    use wasm_bindgen::JsCast;
    use web_sys::window;
    use crate::app::App;
    use log::Level;

    #[wasm_bindgen]
    pub fn hydrate() {
        // initializes logging using the `log` crate
        _ = console_log::init_with_level(Level::Debug);
        console_error_panic_hook::set_once();

        // Using mount_to_body instead of trying to hydrate since we're not using SSR
        leptos::mount_to_body(App);
    }

    // Add a mount_to function that can target a specific element
    #[wasm_bindgen]
    pub fn mount_to(selector: &str) {
        // initializes logging using the `log` crate
        _ = console_log::init_with_level(Level::Debug);
        console_error_panic_hook::set_once();

        // Get the element by selector
        let window = window().expect("no global window exists");
        let document = window.document().expect("no document exists on window");
        let element = document.query_selector(selector)
            .expect("query_selector failed")
            .expect("no element with that selector exists");

        // Clear the element
        element.set_inner_html("");

        // Mount the app to the element
        leptos::mount_to(element.unchecked_into(), App);
    }
}
