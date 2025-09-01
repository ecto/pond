pub mod app;
pub mod components;
pub mod content;
pub mod markdown;

#[cfg(feature = "hydrate")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn hydrate() {

    console_error_panic_hook::set_once();

    leptos::mount_to_body(crate::app::App);
}
