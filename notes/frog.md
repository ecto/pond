# FROG Robot Specification - v0.1

Friendly Robotic Open Generalist

---

## 1. Purpose

Prototype and prove out a novel humanoid robot software and hardware stack using readily available consumer electronics. Provide a foundational platform for future development towards general-purpose household tasks.

---

## 2. Hardware

High-level architecture: A v1 humanoid form factor with a wheeled base for locomotion. Designed for modularity and leveraging COTS components. Referencing `koi.md` for AI compute stack and `arm.md` for arm construction principles where applicable.

### 2.1 Compute

- **Central Brain:** NVIDIA Jetson Orin NX 16GB. Housed within the torso.
- **Limb/Module MCUs:** RP2040 microcontroller board per major module (Arms, Head, Legs/Base).

### 2.2 Actuation

- **Primary Actuators:** Homogeneous use of closed-loop NEMA-17 stepper motors across all joints (specific model TBD, analogous to NEMA-23 in `arm.md` §2).

### 2.3 Structure

- **Form Factor:** Humanoid upper body (torso, 2 arms, head) mounted on a wheeled mobile base.
- **Modularity:** Arms, Head, and Legs/Base designed as distinct modules.
- **Component Layout:**
  - **Torso:** Houses Jetson Orin NX, 24V Power Supply/Distribution, **USB Hub**, **E-Stop Controller**.
  - **Wheeled Base (v1 specific):** Houses Ecoflow River 3 Power Station, base locomotion motors/drivers.
  - **Modules (Arms, Head):** Contain respective actuators, RP2040 MCUs, and local wiring.
- **Schematic Overview:**
  `      +---------+
        |  Head   |
        | (RP2040)| -- USB --\
        +----|----+
             |
    +--------|--------+
 L Arm|        |        | R Arm
(RP2040|  Torso        |(RP2040 -- USB --\
-- USB-->|  (Jetson NX)  |---------- USB Hub ----> Jetson
    |  (24V PSU)    |---------- E-Stop ---> Actuator Power Cutoff
    |  (USB Hub)    |
    |  (E-Stop)     |   /-- USB -- Base (RP2040)
    +--------|--------+
             |
    +--------|--------+
    | Wheeled Base    |
    | (RP2040)        |
    | (Ecoflow River) |
    | (Motors)        |
    +-----------------+`
- **Module Schematics (Conceptual):**

  ```
  Head Module:
  +--------------------+
  | [RGB-D Camera]     |
  |       /\           |
  |      /  \          |
  |     +----+         |
  |     | RP |<-- USB  |
  |     +----+         |
  +--------------------+

  Arm Module (Simplified - showing 3 joints):
  +--------------------+
  | Shoulder Yaw (N17) |
  |        |           |
  |        +-----------+--- Link 1
  | Shoulder Pitch(N17)|
  |        |           |
  |        +-----------+--- Link 2
  | Elbow Pitch (N17)  |
  |        |           |
  | +----+ +-----------+--- Link 3 -> Tool
  | | RP |<-- USB      |
  | +----+             |
  +--------------------+

  Wheeled Base Module (v1):
  +--------------------------+
  |  [RP2040] <-- USB        |
  |         |                |
  | +-------+-------+        |
  | | Motor Driver L|        |
  | +---------------+        |
  | | Motor Driver R|        |
  | +-------+-------+        |
  |         |                |
  | +-------------------+    |
  | | Ecoflow River Bat |    |
  | +-------------------+    |
  |      |         |         |
  | Wheel L     Wheel R      |
  +--------------------------+
  ```

### 2.4 Connectivity

- **Internal Bus:** USB 2.0 High-Speed connecting limb/base RP2040s to the central Jetson Orin NX **via a powered USB Hub located in the torso**.

### 2.5 Power

- **Source:** Ecoflow River 3 Portable Power Station (housed in wheeled base for v1).
- **Distribution:** Downstream 24V DC power supply located in the torso. Power is distributed to the Jetson, USB Hub, and **separately to actuators via the E-Stop circuit**.

### 2.6 Safety

- **Physical Emergency Stop (E-Stop):** A physical E-Stop button will cut power directly to all actuators (NEMA-17 motors, base motors) via a dedicated safety relay or controller. The Jetson Orin NX and RP2040 MCUs will remain powered to allow for diagnostics and controlled shutdown procedures.
- **Software E-Stop:** A mechanism triggered via the `comms` bus (e.g., from `cli` or `diag`) to command all motion (`control`, `firmware`) to halt gracefully while keeping compute powered.
- **Watchdogs:**
  - **Firmware Watchdog:** Implemented on RP2040s (`firmware`) to reset or enter a safe state if the main loop hangs.
  - **Communication Watchdog:** Heartbeat mechanism between `bridge` (Jetson) and `firmware` (RP2040s) to ensure connectivity; triggers safe state on timeout.
  - **Process Watchdog:** `robotd` monitors critical Jetson processes (`control`, `planner`, etc.); triggers safe state or restarts on failure.
- **Software Limits:**
  - **Joint Limits:** Position, velocity, acceleration limits enforced primarily in `firmware`, potentially double-checked in `control`.
  - **Cartesian Limits:** Velocity/acceleration limits for end-effectors/base enforced in `control`.
  - **Torque/Current Limits:** Enforced in `firmware` and potentially `control`.
- **Collision Avoidance/Detection (Future):**
  - **Reactive:** `control` uses real-time sensor data to halt/modify motion before imminent collision.
  - **Proactive:** `planner`/`tasks` generate collision-free paths based on map/perception.
- **Stability Control:** `control` uses IMU data to monitor base stability and trigger corrective actions or halt on tip detection.
- **Thermal Monitoring:** Monitor Jetson CPU/GPU and potentially motor temperatures; throttle or shut down safely if thresholds exceeded.
- **Power Monitoring:** Monitor main battery level; trigger warnings and safe shutdown on low battery.

### 2.7 Sensing

- **Primary Perception:** RGB-D Camera (Head-mounted), LiDAR (Torso or Base mounted - TBD).
- **Proprioception:** Closed-loop stepper feedback (position/velocity), potentially joint encoders if needed.
- **Other:** Microphone array (Head/Torso), IMU (Base or Torso).

---

## 3. Software

A custom Rust-based software stack, drawing inspiration from ROS2 concepts but implemented cleanly for performance, maintainability, and specific project needs.

### 3.1 Core Architecture

- **Language:** Rust.
- **Communication:** Custom inter-process/inter-module communication bus (details TBD).
- **OS:** Ubuntu 22.04 LTS on Jetson (aligns with `koi.md` §2).

### 3.2 AI / Control Systems (on Jetson)

- **System 1 (Reactive Control):** Visual Language Model (VLA) translating high-level goals and sensor data into desired kinematics/actions (e.g., similar architecture to `koi0-act` in `koi.md`).
- **System 2 (Deliberative Planning):** Large Language Model (LLM) for task planning, goal decomposition, and reasoning (e.g., similar architecture to `koi0-think` in `koi.md`).
- **Coordination:** Mechanism for blending or switching between System 1 and System 2 outputs (TBD).

### 3.3 Module Firmware (on RP2040s)

- Real-time control loops (position/velocity/torque) for actuators.
- Local sensor processing (if applicable).
- Communication interface to the central Jetson via USB.

### 3.4 Supporting Services

- **SLAM:** Simultaneous Localization and Mapping service for base navigation.
- **Voice Interaction:** Service for processing voice commands and generating speech responses.
- **Behavior Tree / Goal Management:** System for managing complex, multi-step tasks like "fold the laundry".

### 3.5 Tooling

- **Visualization:** Real-time 3D visualization of robot state, sensor data, and planning outputs (e.g., custom Rerun.io integration or similar).
- **Diagnostics:** Tools for monitoring system health, performance bottlenecks, and debugging.
- **Training:** Infrastructure and tools for training/fine-tuning the VLA and LLM components (potentially leveraging methods outlined in `koi.md` §4).

### 3.6 Deployment & Updates (Prototype Phase)

- **Method:** Static Binaries + Scripted Push.
- **Packaging:** Rust services compiled to binaries on a development machine (targeting `aarch64-unknown-linux-gnu`). Dynamic linking against necessary system libraries provided by JetPack (CUDA, TensorRT, etc.) is expected.
- **Deployment:** Binaries are pushed from the development machine to the Jetson via `scp` or `rsync`.
- **Service Management:** Custom scripts on the development machine use `ssh` to connect to the Jetson and manage `systemd` service units (e.g., start/stop/restart services corresponding to the pushed binaries). Initial placement of `systemd` unit files on the Jetson is required (can be part of the deployment script).
- **Dependencies:** Relies on the base JetPack installation on the Jetson to provide required system libraries (CUDA, cuDNN, TensorRT, etc.). Rust application dependencies are compiled into the binary or managed via `Cargo`.
- **Updates:** New binaries are pushed, overwriting old ones, followed by an SSH command to restart the relevant service.
- **Rollback:** Manual process involving pushing the previous known-good binary version.

### 3.7 Crate Architecture (Initial Plan)

A potential structure for the Rust crates within the `crates/` directory, favoring single-word names:

**Core Crates:**

- `core`: Defines fundamental shared types (e.g., `JointState`, `Pose`, `Twist`, `Image`, `PointCloud`, `ImuData`), common error types/enums, coordinate frame conventions, and potentially shared constants (robot dimensions). Likely uses `nalgebra` for math types, `serde` for serialization.
- `comms`: Implements the custom inter-process communication bus. Defines message schemas (likely using `serde`), handles serialization (e.g., CBOR/`ciborium`), provides publish/subscribe and request/response abstractions. Might use `tokio` for async operations and potentially shared memory or domain sockets for transport.
- `flog`: Shared logging facade and configuration. Wraps `tracing` or `log`. Sets up structured logging, potentially with different sinks (stdout, file). Used by most other crates.

**Hardware Interface Crates (Jetson):**

- `bridge`: Manages USB communication (`rusb` or `serialport`) with the `firmware` on RP2040 modules. Defines and implements the command/status protocol (e.g., `SetJointTargets`, `ReportJointStates`), handles device discovery, serialization/deserialization. Publishes status to `comms`, receives commands.
- `sensors`: Provides drivers and interfaces for sensors connected directly to the Jetson. Examples: RGB-D camera (`opencv` bindings, `v4l`), LiDAR (vendor SDK/FFI), Microphone array (`alsa`, `cpal`). Publishes sensor data structures (defined in `core`) onto the `comms` bus.

**AI / Control Systems Crates (Jetson):**

- `vla`: Wraps the reactive Visual Language Model (VLA) inference engine. Uses TensorRT bindings (`trt-rs` or similar) for accelerated inference. Subscribes to sensor data and goals via `comms`, publishes kinematic targets (e.g., end-effector commands, joint velocities) via `comms`.
- `planner`: Wraps the deliberative LLM planning engine. Uses TensorRT bindings. Handles task decomposition, sub-goal generation based on high-level instructions (from `voice` or `tasks`). Interacts via `comms`.
- `control`: Coordinates motion commands. Subscribes to outputs from `vla` and `planner` (via `comms`), implements blending/switching logic, performs safety checks, and sends final commands to the hardware via the `bridge` crate.

**Supporting Services Crates (Jetson):**

- `slam`: Implements the chosen SLAM algorithm. Subscribes to relevant sensor data (LiDAR, IMU from `sensors`, Wheel Odometry from `bridge`) via `comms`. Publishes robot pose estimates and map updates via `comms`.
- `voice`: Handles the voice interaction pipeline. Includes Wake-Word detection, Speech-to-Text (STT engine, local/cloud), and Text-to-Speech (TTS engine). Interacts with `planner` for NLU/dialogue via `comms`.
- `tasks`: Executes complex, multi-step tasks defined using Behavior Trees (`bonsai-bt` or similar) or State Machines. Interacts with `planner` for high-level steps and `control` for action execution via `comms`.

**Firmware Crates (RP2040):**

- `firmware`: Embedded code running on the RP2040s (`rp-pico` HAL, `cortex-m-rt`). Implements the USB device counterpart to `bridge`. Runs real-time control loops for motors (e.g., PID, step generation), reads local encoders/sensors. Uses `defmt` for logging.

**Tooling Crates:**

- `viz`: Connects to `comms` bus, subscribes to relevant data (pose, joint states, sensor data, plans), and sends it to Rerun (`rerun-rs`) for 3D visualization. May load URDF for robot model display.
- `diag`: Diagnostics monitor. Subscribes to health/status messages via `comms`, potentially collects system metrics. Provides a TUI (`ratatui`) or web interface (`axum`) for display.
- `cli`: Command-line tools (`clap`) for interacting with the live system via `comms` (sending commands, requesting status, debugging).

**Main Orchestrator (Jetson):**

- `robotd`: The main daemon running on the Jetson. Parses configuration, launches, monitors, and manages the lifecycle of the various service processes (`planner`, `vla`, `control`, etc.). Handles graceful shutdown.

---

## 4. Capabilities

The ultimate goal is autonomous laundry folding. This necessitates a range of intermediate capabilities:

- **Mobility:** Navigation in indoor home environments and simple outdoor paths (sidewalks).
- **Manipulation:** Dexterous grasping and manipulation suitable for clothing items.
- **Perception:** Object recognition (clothing types, laundry basket, folding surface), environment mapping (SLAM), human interaction (voice, potentially gesture).
- **Planning & Reasoning:** Decomposing the high-level goal ("fold laundry") into sequential and parallel sub-tasks (e.g., fetch basket, identify item, grasp, fold, place).
- **Interaction:** Natural language conversations for task instruction and status updates.

---

## 5. Operating Environment

- **Primary:** Indoor residential environments (apartments, houses).
- **Secondary:** Simple, controlled outdoor environments (e.g., paved sidewalks, parks) in favorable weather conditions. Assumed flat or mildly sloped terrain.

---

## 6. Training Workflow (within Monorepo)

This section outlines the approach for training the AI models (VLA, LLM) used by FROG, keeping all necessary code within the `pond` monorepo.

### 6.1 Technology Choice: Python

While the robot's runtime software is implemented in Rust for performance and safety, the **model training workflow will primarily utilize Python.**

**Reasoning:**

- **Ecosystem Maturity:** The Python ML ecosystem (PyTorch, TensorFlow, Hugging Face `transformers`, `datasets`, `trl`, `accelerate`, etc.) is vastly more mature and feature-rich than Rust alternatives for deep learning research and training.
- **Tooling Availability:** Essential tools for training, evaluation, quantization (e.g., QLoRA, bitsandbytes), distillation, and exporting models (e.g., to ONNX or TensorRT) are predominantly available and optimized for Python.
- **Pre-trained Models & Research:** State-of-the-art foundation models (like Gemma, Llama) and associated research codebases are released in Python, simplifying fine-tuning and adaptation.
- **Developer Focus:** This allows the Rust development effort to focus on building a robust inference runtime, while leveraging the best tools available for the distinct task of offline model training.
- **Consistency with `koi.md`:** Aligns with the likely Python-based tooling and methods referenced in `koi.md` if components of that pipeline are reused.

### 6.2 Directory Structure

A dedicated `training/` directory will exist at the root of the monorepo:

```
pond/
├── crates/          # Rust runtime crates
├── training/        # Python training code
│   ├── datasets/    # Data or links to data
│   ├── notebooks/   # Exploration
│   ├── scripts/     # Main training/eval/export scripts
│   └── src/         # Python source code (e.g., learn package)
│       └── learn/
├── notes/           # Documentation
# ... other files ...
└── requirements-train.txt # Python dependencies
```

### 6.3 Key Components within `training/`

- **Python Packages (`src/learn`):** Reusable Python code for model definitions, data loading, training loops, etc.
- **Training Scripts (`scripts/train.py`):** Main scripts to launch training jobs, potentially using libraries like `accelerate` or `pytorch-lightning`.
- **Evaluation Scripts (`scripts/eval.py`):** Scripts to evaluate trained checkpoints.
- **Export Scripts (`scripts/export_trt.py`):** Scripts to convert trained models (e.g., PyTorch) into optimized formats (e.g., ONNX, TensorRT `.plan` files) loadable by the Rust runtime crates (`vla`, `planner`).
- **Dependency Management (`requirements-train.txt` or `pyproject.toml`):** Defines necessary Python libraries (PyTorch, Transformers, TensorRT Python bindings, etc.).
- **Configuration Files:** Files defining training parameters, model configurations, dataset paths.
- **(Optional) Experiment Tracking:** Integration with tools like MLflow or Weights & Biases.

---
