use leptos::*;
use pulldown_cmark::{Parser, html, Options};
use std::collections::HashMap;

/// Parse markdown content and return HTML string
pub fn parse_markdown(content: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);

    let parser = Parser::new_ext(content, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

/// Extract frontmatter from markdown content
pub fn extract_frontmatter(content: &str) -> (Option<HashMap<String, String>>, String) {
    if !content.starts_with("---") {
        return (None, content.to_string());
    }

    let mut lines = content.lines();
    lines.next(); // Skip first ---

    let mut frontmatter_lines = Vec::new();
    let mut found_end = false;

    for line in lines.by_ref() {
        if line.trim() == "---" {
            found_end = true;
            break;
        }
        frontmatter_lines.push(line);
    }

    if !found_end {
        return (None, content.to_string());
    }

    let remaining_content: Vec<&str> = lines.collect();
    let remaining_content = remaining_content.join("\n");

    let mut frontmatter = HashMap::new();
    for line in frontmatter_lines {
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim().to_string();
            let value = value.trim().trim_matches('"').to_string();
            frontmatter.insert(key, value);
        }
    }

    (Some(frontmatter), remaining_content)
}

/// Component for rendering markdown content
#[component]
pub fn MarkdownContent(content: String) -> impl IntoView {
    let (_frontmatter, markdown_content) = extract_frontmatter(&content);
    let html = parse_markdown(&markdown_content);

    view! {
        <div class="markdown-content" inner_html=html></div>
    }
}

/// Component for rendering markdown with frontmatter display
#[component]
pub fn MarkdownPage(content: String) -> impl IntoView {
    let (frontmatter, markdown_content) = extract_frontmatter(&content);
    let html = parse_markdown(&markdown_content);

    let title = frontmatter
        .as_ref()
        .and_then(|fm| fm.get("title"))
        .cloned()
        .unwrap_or_default();

    let description = frontmatter
        .as_ref()
        .and_then(|fm| fm.get("description"))
        .cloned()
        .unwrap_or_default();

    view! {
        <article class="prose prose-lg max-w-none">
            {if !title.is_empty() {
                view! {
                    <header class="mb-8">
                        <h1 class="font-mono text-4xl font-bold mb-2">{title}</h1>
                        {if !description.is_empty() {
                            view! {
                                <p class="text-xl text-gray-600 font-serif">{description}</p>
                            }.into_view()
                        } else {
                            view! {}.into_view()
                        }}
                    </header>
                }.into_view()
            } else {
                view! {}.into_view()
            }}
            <div class="markdown-content" inner_html=html></div>
        </article>
    }
}
