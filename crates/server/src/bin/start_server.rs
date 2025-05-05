use axum::{response::Html, routing::get, Router};
use tokio::net::TcpListener;
use tower_http::services::ServeDir;
use std::fs;

#[tokio::main]
async fn main() {
    // Set up logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Load the index.html file
    let index_html = fs::read_to_string("target/site/index.html")
        .expect("Failed to read index.html");

    // Create router
    let app = Router::new()
        .route("/", get(move || async move { Html(index_html.clone()) }))
        .nest_service("/pkg", ServeDir::new("target/site/pkg"));

    // Start the server
    let addr = "127.0.0.1:3000";
    tracing::info!("Listening on http://{}", addr);

    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app.into_make_service())
        .await
        .unwrap();
}