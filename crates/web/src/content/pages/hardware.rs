use leptos::*;
use leptos_router::*;

#[component]
pub fn HardwarePage() -> impl IntoView {
    let params = use_params_map();
    let slug = move || params.with(|p| p.get("slug").cloned().unwrap_or_default());

    view! {
        <article class="prose max-w-none">
            <h1 class="font-mono text-3xl font-bold mb-4">{"Hardware: "}{move || slug()}</h1>
            <p class="font-serif text-black">"Hardware reference placeholder."</p>
        </article>
    }
}

