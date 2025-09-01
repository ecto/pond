use leptos::*;

/// Heading component that follows brand typography scale
#[component]
pub fn Heading(
    level: u8,
    children: Children,
    #[prop(optional)] class: Option<String>,
) -> impl IntoView {
    let base_classes = "font-mono font-bold text-black leading-tight";
    let size_classes = match level {
        1 => "text-4xl", // 2.5rem
        2 => "text-3xl", // 2rem
        3 => "text-2xl", // 1.5rem
        4 => "text-xl",  // 1.25rem
        _ => "text-lg",  // fallback
    };

    let classes = match class {
        Some(c) => format!("{} {} {}", base_classes, size_classes, c),
        None => format!("{} {}", base_classes, size_classes),
    };

    match level {
        1 => view! { <h1 class=classes>{children()}</h1> }.into_view(),
        2 => view! { <h2 class=classes>{children()}</h2> }.into_view(),
        3 => view! { <h3 class=classes>{children()}</h3> }.into_view(),
        4 => view! { <h4 class=classes>{children()}</h4> }.into_view(),
        5 => view! { <h5 class=classes>{children()}</h5> }.into_view(),
        _ => view! { <h6 class=classes>{children()}</h6> }.into_view(),
    }
}

/// Body text component that uses serif font
#[component]
pub fn BodyText(
    children: Children,
    #[prop(optional)] class: Option<String>,
) -> impl IntoView {
    let base_classes = "font-serif text-base leading-relaxed text-black";
    let classes = match class {
        Some(c) => format!("{} {}", base_classes, c),
        None => base_classes.to_string(),
    };

    view! {
        <p class=classes>{children()}</p>
    }
}

/// Technical text component that uses monospace font
#[component]
pub fn TechText(
    children: Children,
    #[prop(optional)] class: Option<String>,
) -> impl IntoView {
    let base_classes = "font-mono text-sm text-gray-700";
    let classes = match class {
        Some(c) => format!("{} {}", base_classes, c),
        None => base_classes.to_string(),
    };

    view! {
        <span class=classes>{children()}</span>
    }
}
