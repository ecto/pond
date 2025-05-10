# Pad Operator Console – Engineering Specification (v1.0)

_Updated 2025‑05‑05_

---

## 1 Objective

Deliver **Pad**: a cross‑platform operator console that connects to any **Pond** robot for real‑time teleoperation, 3‑D visualisation, diagnostics, and data capture. Initial robots: **Frog v1**, **Newt v0.3**.

### Success Criteria

| #   | Criterion                                                                         | Metric                                       |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | 60 FPS on Steam Deck in _Teleop_ and _World 3‑D_ views                            | Render thread ≤ 16 ms/frame on Deck 40 W TDP |
| 2   | ≤ 50 ms round‑trip teleop latency (Deck ↔ robot over Wi‑Fi 6)                     | Median RTT measured by Pad network overlay   |
| 3   | Hot‑reload shader & asset pipeline                                                | Edit WGSL → live update < 2 s                |
| 4   | CI emits notarised `.dmg`, signed `.AppImage`, and `.visionos` bundles            | Artifacts downloadable from GitHub Release   |
| 5   | Codebase fully covered by `cargo clippy --all-targets -- -D warnings` & `rustfmt` | CI gate                                      |

---

## 2 Platform Targets & Build Triples

| Platform                 | Triple                                        | Graphics API | Notes                      |
| ------------------------ | --------------------------------------------- | ------------ | -------------------------- |
| Steam Deck (SteamOS 3)   | `x86_64-unknown-linux-gnu`                    | Vulkan       | Bundled AppImage & Flatpak |
| macOS (Intel & M‑series) | `x86_64-apple-darwin`, `aarch64-apple-darwin` | Metal        | Notarised `.dmg`           |
| visionOS (Vision Pro)    | `aarch64-apple-visionos`                      | Metal        | Immersive & window scenes  |
| (Optional) Web demo      | `wasm32-unknown-unknown`                      | WebGPU       | Limited—no video decode    |

---

## 3 Crate Topology

```
pond/                   # Rust monorepo
├─ crates/
│   ├─ pad_core/        # math, time, error, logging, serde (no graphics)
│   ├─ pad_net/         # tonic gRPC + UDP low‑latency channel helper
│   ├─ pad_render/      # Bevy plugin group (PBR, loaders, shaders)
│   ├─ teleop/          # gamepad ↔ cmd mapping; dead‑zones, profiles
│   ├─ env/             # SLAM map, point‑cloud, voxel, octree utils
│   ├─ ui_overlay/      # bevy_egui panels & app‑state
│   └─ vision/          # UIKit/winit bridge, foveated ext (visionOS only)
└─ apps/
    ├─ pad/             # Desktop & Deck binary (winit main)
    ├─ pad_deck/        # Thin wrapper with Deck‑specific launch flags
    └─ pad_vr/          # visionOS bundle (UIKit main)
```

Guidelines:

- **No platform‑specific code outside `vision/` and minimal `#[cfg]` blocks elsewhere**.
- Public APIs documented with `rustdoc` examples.

---

## 4 UI Views & ASCII Wire‑frames

| ID  | View                         | F‑key     | Steam Deck RB cycle index |
| --- | ---------------------------- | --------- | ------------------------- |
| V1  | Teleop (default)             | F5        | 1                         |
| V2  | World 3‑D                    | F6        | 2                         |
| V3  | Diagnostics                  | F7        | 3                         |
| V4  | Param Tuning                 | F8        | 4                         |
| V5  | Replay                       | F9        | 5                         |
| V6  | Settings (modal)             | F10       | –                         |
| V7  | Network / System overlay     | always‑on | –                         |
| V8  | Spatial HUD (visionOS)       | N/A       | –                         |
| V9  | Immersive Cockpit (visionOS) | N/A       | –                         |

ASCII mockups are embedded for V1–V5 and overlays; use them as reference for initial Bevy UI layout.

---

## 5 Input Mapping (default profile)

| Action           | Gamepad (Deck) | KB/Mouse   | Vision Pro            |
| ---------------- | -------------- | ---------- | --------------------- |
| Drive            | Left stick     | WASD       | N/A                   |
| Camera pan/tilt  | Right stick    | Mouse drag | Eye‑gaze + pinch‑drag |
| Gripper toggle   | A              | G          | Pinch‑tap button      |
| Headlight toggle | B              | H          | Double‑pinch          |
| E‑stop           | Start+East     | Esc Esc    | Long‑pinch            |
| Cycle view       | RB             | F6         | Two‑finger swipe      |
| Mark event       | X              | M          | Double‑tap HUD        |

Dead‑zones, sensitivity and bindings are editable at runtime via _Settings → Input_.

---

## 6 Performance Profiles

- deck‑eco – 40 FPS target, MSAA 2×, HDR off, point‑cloud 50 % LOD
- deck‑hq – 60 FPS, MSAA 2×, HDR off, point‑cloud 75 %
- mac‑mbp – 60/120 FPS, MSAA 4×, HDR on, LOD 100 %
- sim‑headless – Renderer disabled; deterministic ECS step
  Runtime flag `--profile <id>` or GUI selector.

---

## 7 Deployment Pipeline (CI/CD)

GitHub Actions workflow `ci.yml` must:

1. Check `clippy` + `fmt` + tests.
2. Build release binaries for each triple.
3. Codesign & notarise macOS `.dmg` (Apple ID in CI secrets).
4. Build `.AppImage` + Flatpak (`org.pond.pad`) with `flatpak-builder`.
5. Build `.visionos` via `cargo‑apple –target aarch64-apple-visionos –bundle`.
6. Upload artefacts to GitHub Release under tag.
7. Regenerate SHA256 manifest `pad.json` for OTA updater.

---

## 8 Asset Pipeline

1. **Robot meshes**: URDF → `urdf‑rs` → glTF (pre‑commit hook).
2. **Shaders**: WGSL compiled at build to SPIR‑V (Vulkan) & Metal lib (mac/visionOS) – embed in binary.
3. **Point‑cloud stream**: binary PCD protobuf chunks (max 2 M pts/s) → GPU storage buffer.
4. **CDN**: Release assets & large mesh pack hosted on `cdn.pond‑robots.com` (S3 + CloudFront). CI syncs.

---

## 9 Roadmap / Milestones

| Sprint | Deliverable                             | Exit Criteria                                                             |
| ------ | --------------------------------------- | ------------------------------------------------------------------------- |
|  0     | DevEnv bootstrap                        | `cargo run` spawns empty Bevy window on Deck & macOS                      |
|  1     | Teleop MVP (V1)                         | Live H.264 feed + drive commands reach robot; HUD shows latency           |
|  2     | World 3‑D MVP (V2)                      | Robot skeleton + SLAM point‑cloud render at ≥ 45 FPS on Deck              |
|  3     | Diagnostics (V3) & Network overlay (V7) | Logs, CPU/GPU graphs, node graph; overlay alerts                          |
|  4     | Param Tuning (V4) & Replay (V5)         | Real‑time param patch, 20 s ring‑buffer; export clip                      |
|  5     | Packaging + CI sign‑off                 | All artefacts downloadable; smoke‑tested on Deck, MBP, Vision Pro dev kit |

---

## 10 Risk Register & Mitigations

| Risk                            | Impact      | Mitigation                                             |
| ------------------------------- | ----------- | ------------------------------------------------------ |
| gRPC overhead too high on Wi‑Fi | Control lag | Fallback to UDP raw mode in pad_net                    |
| Bevy update breaking APIs       | Build break | Pin to Bevy 0.13; update via weekly PR with CI tests   |
| visionOS SDK changes            | Launch slip | Isolate code in `vision/`; maintain separate CI target |
