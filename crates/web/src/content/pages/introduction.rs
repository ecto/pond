use leptos::*;

#[component]
pub fn IntroductionPage() -> impl IntoView {
    view! {
        <article class="prose max-w-none">
            <h1 class="font-serif text-3xl font-semibold mb-4">"Introduction"</h1>
            <p class="font-serif text-black">"Pond is a practical foundation for autonomous robotics—focused on clear architecture, composable components, and real-world constraints."</p>
        </article>
    }
}

