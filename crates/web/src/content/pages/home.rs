use leptos::*;

#[component]
pub fn HomePage() -> impl IntoView {
    view! {
        <section>
            <h1 class="font-mono text-4xl font-bold mb-2">"Pond"</h1>
            <p class="font-serif text-lg text-black">"Open-source blueprint for modular, thinking machines."</p>
        </section>
    }
}

