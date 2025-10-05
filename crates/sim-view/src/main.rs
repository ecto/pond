use clap::Parser;
use sim_view::{sim_view_app, SimViewConfig};

#[derive(Parser, Debug)]
#[command(name = "sim-view")]
#[command(about = "Pond Simulation 3D Viewer", long_about = None)]
struct Args {
    /// WebSocket server address for simulation state
    #[arg(short, long, default_value = "ws://localhost:8080")]
    server: String,

    /// Disable third-person camera following
    #[arg(long)]
    no_follow: bool,

    /// Hide ground grid
    #[arg(long)]
    no_grid: bool,

    /// Hide coordinate axes
    #[arg(long)]
    no_axes: bool,
}

fn main() {
    let args = Args::parse();

    let config = SimViewConfig {
        server_address: args.server,
        follow_robot: !args.no_follow,
        show_grid: !args.no_grid,
        show_axes: !args.no_axes,
    };

    println!("🐸 Pond Sim View");
    println!("Connecting to: {}", config.server_address);

    let mut app = sim_view_app(config);
    app.run();
}

