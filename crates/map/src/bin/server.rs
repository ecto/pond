use map::server::router;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let addr = std::env::var("MAP_LISTEN").unwrap_or_else(|_| "0.0.0.0:8081".to_string());
    println!("🐸 Pond Map Server listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router()).await?;
    Ok(())
}


