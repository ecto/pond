# Pond Website + Robot Visualizer Monorepo Spec

## Goals

- Serve a public website with SSR and interactive 3D content
- Visualize live robot state (e.g., SLAM pointclouds, kinematics)
- Remain idiomatic to the Rust ecosystem
- Use unified monorepo build/deploy with Cargo
- Leverage JS interop for complex 3D rendering (e.g., Three.js)
- Deploy via Fly.io, Shuttle.rs, or Render.com

---

## Tech Stack

### 🧠 Frontend

- **[Leptos](https://github.com/leptos-rs/leptos)** for full-stack SSR and reactivity
- **WASM + JS interop** to invoke:
  - **Three.js** for general 3D scenes
  - **Potree** (optional) for point cloud streaming
- TailwindCSS for styling (via Leptos integration)

### 🌐 Backend

- **[Axum](https://github.com/tokio-rs/axum)** HTTP API server
  - REST endpoints for robot telemetry (e.g., `/pose`, `/slam`)
  - Optional WebSocket or SSE endpoint for live robot data
- Shared `types.rs` crate for serializable structs across frontend/backend

---

## Monorepo Layout

```text
pond/
├── Cargo.toml                # Workspace root
├── website/                  # Leptos SSR site
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── app.rs
│   │   ├── components/
│   │   │   └── viewer.rs     # <canvas id="viz"> mount + state bindings
│   │   └── js_bindings.rs    # wasm_bindgen to call viz.js
│   ├── static/
│   │   └── viz.js            # Three.js code to render the scene
│   ├── style/
│   │   └── tailwind.css
│   └── Cargo.toml
├── backend/                  # Axum API server
│   ├── src/
│   │   └── main.rs
│   └── Cargo.toml
├── shared/                   # Shared types (e.g., RobotPose, PointCloud)
│   ├── src/lib.rs
│   └── Cargo.toml
└── README.md
```

⸻

Interop Details

📦 Leptos SSR View

```rust
view! {
<div>
<canvas id="viz" width="1024" height="768"></canvas>
</div>
}
```

📦 wasm_bindgen Binding

```rust
#[wasm_bindgen(module = "/static/viz.js")]
extern "C" {
fn start_viz(canvas_id: &str);
}
```

📦 JavaScript Entrypoint (viz.js)

````js
import \* as THREE from 'three';

export function start_viz(canvas_id) {
const canvas = document.getElementById(canvas_id);
const renderer = new THREE.WebGLRenderer({ canvas });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 4/3, 0.1, 1000);

// Example robot model or point cloud
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

camera.position.z = 5;
function animate() {
requestAnimationFrame(animate);
cube.rotation.x += 0.01;
cube.rotation.y += 0.01;
renderer.render(scene, camera);
}
animate();
}

⸻

API Endpoints

Endpoint Method Description
/pose GET Returns current robot pose
/slam GET Returns latest point cloud
/model.gltf GET Returns URDF or mesh model
/ws WS Live telemetry stream (optional)

All endpoints serialize using serde and shared::types::\*.

⸻

Deployment Targets
• Fly.io: Rust-native, fast boot, region support
• Shuttle.rs: Rust-native deploy-as-a-service
• Render.com: More general-purpose, can run multiple services
• GitHub Pages / Vercel (only for static Zola-like version)

⸻

Build Commands

# Build the frontend + backend in release mode

```bash
cargo build --release
````

# Serve Axum backend on localhost

```bash
cargo run -p backend
```

# Run website with Leptos SSR

```bash
cargo leptos serve
```

⸻

Future Ideas

• Replace Three.js with Rust-native WebGPU (e.g., wgpu + egui) when mature
• Add ROS 2 bridge for real robot integration
• Export SLAM recordings to .ply or .gltf from Axum
• Add a robot command console with WASM-terminal

---
