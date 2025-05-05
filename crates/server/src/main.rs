use web::app::App;

#[tokio::main]
async fn main() {
    use axum::{routing::get, Router};
    use leptos::{view, logging::log, get_configuration};
    use leptos_axum::{generate_route_list, LeptosRoutes};
    use tower_http::services::ServeDir;

    // Setup tracing
    use tracing_subscriber::fmt;
    fmt::init();

    let conf = get_configuration(None).await.unwrap();
    let leptos_options = conf.leptos_options;
    let addr = leptos_options.site_addr;
    let routes = generate_route_list(App); // Generate routes from App in web crate

    // Define static file handler
    // Server functions handler - updated signature might be needed depending on leptos_axum version/usage
    // async fn server_fn_handler(State(options): State<LeptosOptions>, req: Request<Body>) -> impl IntoResponse {
    //     handle_server_fns(req).await // Try with only req
    // }

    // Define Leptos handler
    // async fn leptos_routes_handler(State(options): State<LeptosOptions>, req: Request<Body>) -> Response {
    //     let handler = leptos_axum::render_app_to_stream(options.to_owned(), App);
    //     handler(req).await.into_response()
    // }

    // build our application with a route
    let app = Router::new()
        .route("/api/*fn_name", get(leptos_axum::handle_server_fns).post(leptos_axum::handle_server_fns)) // Use leptos_axum::handle_server_fns directly
        .leptos_routes(&leptos_options, routes, || view! { <App/> }) // Pass closure for view
        .fallback_service(ServeDir::new(&leptos_options.site_root)) // Serve static files from site root
        .with_state(leptos_options);

    log!("listening on http://{}", &addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app.into_make_service())
        .await
        .unwrap();
}
