# FROG Robot Specification - v0.1

Friendly Robotic Open Generalist

---

## 1. Purpose

Prototype and prove out a novel quadruped robot software and hardware stack using readily available consumer electronics. Provide a foundational platform for future development towards general-purpose household tasks.

---

## 2. Hardware

High-level architecture: A v1 quadruped robot consisting of a torso, four identical servo-actuated limbs, and a head on a pan/tilt neck. The design prioritises modularity and COTS components. The compute stack follows `koi.md`; mechanical principles reference `arm.md` where applicable.

### 2.1 Compute

- **Central Brain:** NVIDIA Jetson Orin NX 16GB on Seeed reComputer J4012 carrier (plastic housing removed). Located inside the head enclosure for shortest sensor paths and improved torso volume.
- **Head Local Control:** Raspberry Pi Pico W (RP2040) dedicated to the pan/tilt drive (SPI encoder + step/dir generation) and local sensor timestamping.
- **Limb/Module MCUs:** One RP2040 microcontroller board per limb (×4) handling local servo timing and sensing.

### 2.2 Actuation

- **Primary Actuators:** 12 V high-torque digital servos (ANNIMOS RDS51150SG 150 kg·cm class) across all joints; no external motor drivers required.
- **Head Pan/Tilt:** Two matching 12 V servos configured for ±135 ° pan and tilt; driven directly from Jetson PWM outputs.

### 2.3 Structure

- **Form Factor:** Quadruped torso with four limb modules and a head.
- **Modularity:** Head and each limb are independent modules that connect to the torso.
- **Component Layout:**
  - **Head:** Houses Jetson Orin NX, RealSense D455 (RGB-D + IMU), RPLIDAR C1, 10.1″ LCD, servo-based pan/tilt stack, and (optional) Pi Pico W helper MCU. Exposes one 12 V power input and a small signal harness to the rest of the robot.
  - **Torso:** Houses Milwaukee M18 HD12 Li-ion battery pack, 18 V→12 V buck converter (main power rail), and **E-Stop Controller**.
  - **Modules (Limbs & Head):** Each limb houses its own servos and RP2040; the head hosts servos for pan/tilt and optional helper MCU.
- **Schematic Overview:** _Diagram to be updated for quadruped layout in a future revision._

  ```
  Head Module:
  +--------------------+
  | [RealSense D455]   |
  |       /\           |
  |      /  \          |
  |     +----+         |
  |     | Pi |<-- I2C  |
  |     +----+         |
  +--------------------+

  Limb Module (Simplified – showing 3 joints of one leg):
  +--------------------+
  | Shoulder Yaw (150 kg Servo) |
  |        |           |
  |        +-----------+--- Link 1
  | Shoulder Pitch (150 kg Servo)|
  |        |           |
  |        +-----------+--- Link 2
  | Elbow Pitch (150 kg Servo) |
  |        |           |
  | +----+ +-----------+--- Link 3 -> Tool
  | | RP |<-- USB      |
  | +----+             |
  +--------------------+
  ```

### 2.4 Connectivity

- **Internal Bus (v1):** Servos receive standard 50 Hz PWM signals directly from Jetson GPIO/PWM pins via short ribbon harnesses; no intermediate USB hub is used. Remaining Jetson USB ports are available for sensors or helper MCUs as needed.

### 2.5 Power

- **Source:** Milwaukee M18 HD12 Li-ion battery (12 Ah, 18 V nominal) mounted in the torso; a high-efficiency buck converter supplies a regulated 12 V system rail.
- **Distribution:** The regulated 12 V rail feeds the Jetson and all servos through the **E-Stop** relay; local 5 V regulators power logic and sensors as required.

### 2.6 Safety

- **Physical Emergency Stop (E-Stop):** A physical E-Stop button will cut 12 V to all servos via a dedicated safety relay or controller. The Jetson Orin NX and RP2040 MCUs remain powered for diagnostics and orderly shutdown.
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

- **Primary Perception:** Intel RealSense D455 (RGB-D + IMU) in head, RPLIDAR C1 mounted on head frame; torso/base LiDAR TBD.
- **Proprioception:** Internal servo potentiometer feedback (position) with optional external encoders/IMUs for higher-resolution sensing if required.
- **Other:** Microphone array (Head/Torso), IMU (Base or Torso).

#### 2.3.1 Head Mass & Power footprint (analysis)

|  Quantity | Item                              |    Mass (g) |          Peak W | Notes                           |
| --------: | --------------------------------- | ----------: | --------------: | ------------------------------- |
|         1 | Jetson Orin NX + J4012 (no shell) |         210 |              25 | Mounted to rear heat-sink block |
|         1 | RealSense D455                    |          75 |             1.5 | RGB-D + IMU                     |
|         1 | RPLIDAR C1                        |         110 |             2.0 | Mounted behind LCD              |
|         1 | Raspberry Pi Pico W               |          25 |               1 | Controls pan/tilt               |
|         2 | 150 kg servos                     |         400 |        up to 30 | \*Manufacturer stall spec       |
|         1 | 10.1″ LCD assembly                |        1000 |             7.5 | Via 5 V buck                    |
|      Misc | Frame, cabling, brackets          |         450 |               — |                                 |
| **Total** |                                   | **≈ 2 372** | **≈ 40 W peak** | figure used in `head.md`        |

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

- `core`: Defines fundamental shared types (e.g., `JointState`, `Pose`, `Twist`, `Image`, `PointCloud`, `ImuData`), common error types/enums, coordinate frame conventions, and potentially shared constants (robot dimensions). Likely uses `nalgebra` for math types, `serde`
