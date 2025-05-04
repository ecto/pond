# FROG Project Checklist - v0.3

This checklist is derived from the v0.2 roadmap, integrating hardware, software, and AI tasks.

---

## Phase 0: Preparation & Procurement

**Goal:** Order all components and set up development tools.
**Definition of Done:** All components ordered, tracking spreadsheet created, host and target dev environments configured with basic build/flash/deploy workflows tested.

0.  [ ] **Workspace Setup:**
    - [ ] Create a top-level `Cargo.toml` with a `[workspace]` section defining `members = ["crates/*"]`.
1.  [ ] **BOM Finalization:**
    - [ ] Review `notes/arm.md` Section 6 (Bill of Materials) for arm components.
    - [ ] Define initial chassis components (e.g., aluminium extrusion profile, connectors, base plate material).
    - [ ] Define required fasteners (screws, nuts, washers) based on `arm.md` and chassis design.
    - [ ] Consolidate all items into a spreadsheet (e.g., create `procurement/BOM_v0.2.xlsx`).
    - [ ] Verify/update all vendor links (ASINs for Amazon, part numbers for McMaster-Carr, SendCutSend, etc.) and quantities in the spreadsheet.
2.  [ ] **Procurement:**
    - [ ] Place orders for arm components via Amazon using ASINs from `notes/arm.md` / BOM spreadsheet.
    - [ ] Place orders for chassis materials (e.g., Misumi, Tuli extrusion).
    - [ ] Place orders for fasteners (e.g., McMaster-Carr).
    - [ ] Place order for laser-cut plates via SendCutSend (using `/cad/plates/` DXFs - _assuming these exist/will be created_).
    - [ ] Place orders for electronic components not on Amazon (e.g., RP2040 boards if specific model needed, sensors from specific vendors).
    - [ ] Track all order numbers and estimated delivery dates in the BOM spreadsheet.
3.  [ ] **Dev Environment Setup:**
    - [ ] **Rust Toolchains (Host & Jetson):**
      - [ ] Install `rustup` on host machine (and later on Jetson) from [rustup.rs](https://rustup.rs/).
      - [ ] Add RP2040 target on host: `rustup target add thumbv6m-none-eabi`.
      - [ ] Add Jetson target on host: `rustup target add aarch64-unknown-linux-gnu`.
      - [ ] Install linker tools for cross-compilation (e.g., `sudo apt install gcc-arm-none-eabi`, potentially `cross` tool via `cargo install cross`).
    - [ ] **Flashing/Deployment Workflows:**
      - [ ] Install RP2040 flashing tool on host: `cargo install probe-rs --features cli`.
      - [ ] Test flashing a basic example (e.g., `blinky`) to an RP2040 board using `probe-rs run`.
      - [ ] Establish SSH access to the Jetson Orin NX.
      - [ ] Test deploying and running a basic Rust "hello world" executable on Jetson via `scp` and SSH.
    - [ ] **Jetson Orin NX Setup:**
      - [ ] Flash Jetson Orin NX with the latest JetPack 6 using NVIDIA SDK Manager.
      - [ ] Run initial system updates (`sudo apt update && sudo apt upgrade`).
      - [ ] Install essential build tools on Jetson: `sudo apt install build-essential git pkg-config libusb-1.0-0-dev libudev-dev joystick`.
      - [ ] Install `rustup` on the Jetson itself.

---

## Phase 1: Core Communication, Control Link & Basic Assembly

**Goal:** Establish the core Jetson <-> RP2040 communication link AND assemble basic physical structures.
**Definition of Done:** `cli` on Jetson can send a single joint command via `bridge` over USB serial to `firmware` on RP2040, receive a status back, and trigger basic pulsing on a connected motor. Basic arm column, chassis frame, and power distribution are assembled.

4.  [ ] **Minimal `core` Crate:**
    - [ ] Create `crates/core` directory.
    - [ ] Initialize `crates/core/Cargo.toml` (name=`core`, version=`0.1.0`, edition=`2021`).
    - [ ] **Decision:** Determine if `core` needs to be `#![no_std]`. If so, add `#![cfg_attr(not(feature = \"std\"), no_std)]` to `lib.rs`.
    - [ ] Add dependencies to `Cargo.toml`:
      - [ ] `serde` (with `derive` feature, and `alloc` or `std` feature depending on `no_std` decision).
      - [ ] `thiserror` (for `FrogError` later, ensure `derive` feature if needed).
    - [ ] Define `struct JointTarget { id: u8, target: f32 }` in `crates/core/src/lib.rs` (deriving `Serialize`, `Deserialize`). (Used in Phase 2 `MultiJointTarget`)
    - [ ] Define `struct SetJointTarget { id: u8, target: f32 }` in `crates/core/src/lib.rs` (deriving `Serialize`, `Deserialize`).
    - [ ] Define `struct JointState { id: u8, position: f32, velocity: f32 }` in `crates/core/src/lib.rs` (deriving `Serialize`, `Deserialize`).
    - [ ] Define basic `pub enum FrogError { CommunicationError, SerializationError, ... }` in `crates/core/src/lib.rs` (potentially deriving `thiserror::Error` later).
5.  [ ] **Minimal `firmware` Crate (RP2040):**
    - [ ] Create `crates/firmware` directory.
    - [ ] Initialize `crates/firmware/Cargo.toml`:
      - [ ] Add dependencies: `rp-pico` (consider `default-features = false` and specifying needed HAL features like `rom-func-cache`, `critical-section-impl`), `usb-device`, `usbd-serial`, `cortex-m-rt`, `panic-probe` (crate name: `panic_probe`), `embedded-hal`, `fugit`, `postcard`.
      - [ ] Add `core` path dependency: `core = { path = \"../core\" }`.
    - [ ] Configure `crates/firmware/.cargo/config.toml` for RP2040 target and runner:
      ```toml
      [target.thumbv6m-none-eabi]
      runner = "probe-rs run --chip RP2040"
      # Add other relevant probe-rs options if needed
      ```
    - [ ] Add `memory.x` linker script for RP2040.
    - [ ] Create `crates/firmware/src/main.rs` with `#[cortex_m_rt::entry]` function.
    - [ ] Initialize RP2040 clocks, peripherals (USB, GPIO) using `rp_pico::hal`.
    - [ ] Set up USB bus allocator and `usbd_serial::SerialPort`.
    - [ ] Implement main loop:
      - [ ] Poll USB device (`usb_dev.poll(...)`).
      - [ ] Read from serial port (`serial.read(...)`).
      - [ ] Deserialize `SetJointTarget` command using `postcard::from_bytes()`.
      - [ ] Configure one set of STEP/DIR GPIO pins.
      - [ ] _Placeholder:_ Implement basic pulsing on STEP pin based on command delta (or simply log command).
      - [ ] Create placeholder `JointState` response.
      - [ ] Serialize `JointState` using `postcard::to_slice()`.
      - [ ] Write serialized status back via `serial.write(...)`.
6.  [ ] **Minimal `bridge` Crate (Jetson):**
    - [ ] Create `crates/bridge` directory.
    - [ ] Initialize `crates/bridge/Cargo.toml`:
      - [ ] Add dependencies: `serialport` (Note: blocking by default, consider `serialport-tokio` if async is needed later), `postcard`, `thiserror`.
      - [ ] Add `core` path dependency: `core = { path = \"../core\" }`.
    - [ ] Create `crates/bridge/src/lib.rs`.
    - [ ] Implement `struct BridgeClient` with methods:
      - [ ] `fn connect(port_name: &str) -> Result<Self, Error>`: Opens serial port, configures settings.
      - [ ] `fn send_command(&mut self, command: &SetJointTarget) -> Result<(), Error>`: Serializes command using `postcard::to_slice()`, writes to serial port.
      - [ ] `fn receive_status(&mut self) -> Result<JointState, Error>`: Reads from serial port, deserializes using `postcard::from_bytes()`.
    - [ ] Implement helper function to discover potential RP2040 serial ports (e.g., list ports, filter by name pattern or VID/PID if available).
7.  [ ] **Integration Test App (Jetson):**
    - [ ] Create `crates/cli` directory.
    - [ ] Initialize `crates/cli/Cargo.toml`:
      - [ ] Add dependencies: `bridge = { path = \"../bridge\" }`, `clap` (with `derive` feature).
    - [ ] Create `crates/cli/src/main.rs`.
    - [ ] Define CLI arguments using `clap::Parser` (e.g., `--port`, `--joint-id`, `--target`).
    - [ ] In `main`, parse arguments.
    - [ ] Create `SetJointTarget` command from args.
    - [ ] Instantiate `BridgeClient` and connect to the specified serial port.
    - [ ] Call `bridge.send_command(...)`.
    - [ ] Call `bridge.receive_status(...)`.
    - [ ] Print the received `JointState` to the console.
8.  [ ] **Arm Assembly (Partial):**
    - [ ] Attach J1 slewing bearing to column top section.
    - [ ] Mount J1 NEMA-23 motor + 20:1 planetary gearbox assembly below bearing.
    - [ ] Laser-cut/receive J2 yoke plates (`/cad/plates/`).
    - [ ] Assemble J2 yoke plates.
    - [ ] Mount J2 NEMA-23 motor + gearbox assembly to J2 yoke.
    - [ ] Attach Ø80mm upper-arm tube section to J2 yoke.
9.  [ ] **Chassis Assembly (Basic):**
    - [ ] Cut aluminium extrusion profiles to length per design.
    - [ ] Assemble main rectangular/square base frame using corner connectors/brackets.
    - [ ] Attach base plate (e.g., sheet metal, plywood) to frame if part of design.
    - [ ] Mount arm column base to chassis base plate/frame.
10. [ ] **Power System (Basic):**
    - [ ] Mount MeanWell LRS-350-24 SMPS securely within chassis.
    - [ ] Wire AC input cord (with appropriate strain relief and fusing if needed) to SMPS AC terminals.
    - [ ] Wire SMPS 24V DC output terminals (+V, -V/GND) to WAGO 221 lever-nut distribution block(s).
    - [ ] Implement E-stop circuit: Wire physical E-stop button to interrupt 24V+ main feed OR the enable signal path for drivers.
    - [ ] Wire 24V+/GND from WAGO block to _one_ STEPPERONLINE CL57T driver power input terminals.
    - [ ] Wire J1 or J2 motor phases (A+/A-/B+/B-) to the corresponding CL57T driver output terminals.
    - [ ] Wire CL57T driver STEP/DIR/ENABLE inputs (placeholder connection for now, maybe to GND/VCC).
11. [ ] **Integration Test:**
    - [ ] Connect assembled J1 or J2 motor (via CL57T driver) STEP/DIR pins to the specific GPIO pins defined in the Item 5 `firmware` code on an RP2040 board.
    - [ ] Connect the RP2040 board to the Jetson via USB cable.
    - [ ] Connect the CL57T driver to the 24V power system (Item 10).
    - [ ] On the host machine (with RP2040 connected via USB debug probe), navigate to `crates/firmware` and run `cargo run` (using `probe-rs` runner defined in `.cargo/config.toml`) to flash the firmware.
    - [ ] On the Jetson, navigate to `crates/cli`.
    - [ ] Build the CLI app: `cargo build`.
    - [ ] Run the CLI app: `./target/debug/cli --port /dev/ttyACM0 --joint-id 0 --target 1.0` (adjust port, ID, target as needed).
    - [ ] Verify physical motor movement occurs.
    - [ ] Verify `JointState` information is printed to the Jetson console.

---

## Phase 2: Multi-Joint Coordination, Feedback & Full Arm Assembly

**Goal:** Expand software control to multiple joints with sensor feedback AND complete the physical arm build.
**Definition of Done:** `cli` can send multi-joint commands and receive multi-joint status including basic sensor feedback (encoders/limits). Full arm is assembled, wired, and individual joints respond to commands.

12. [ ] **Expand `core` Crate:**
    - [ ] Define `struct MultiJointTarget { targets: heapless::Vec<JointTarget, 6> }` in `crates/core/src/lib.rs` (if `core` is `no_std`) or `targets: Vec<JointTarget>` (if `std`). Uses `JointTarget` from Item 4.
    - [ ] Define `struct MultiJointState { states: heapless::Vec<JointState, 6> }` (or `Vec<JointState>`) in `crates/core/src/lib.rs`.
    - [ ] Update `FrogError` enum with potentially new error types (e.g., `JointIdNotFound`), potentially deriving `thiserror::Error`.
13. [ ] **Refactor `firmware` Crate (RP2040):**
    - [ ] **Hardware Abstraction:**
      - [ ] Define `struct MotorController { id: u8, step_pin: ..., dir_pin: ..., ... }`.
      - [ ] Store multiple `MotorController` instances (e.g., `heapless::Vec<MotorController, 6>`). Note: `heapless` size needs to be compile-time constant; consider const generics if capacity needs runtime flexibility.
      - [ ] Modify initialization to configure GPIO pins for all 6 motors based on a predefined pinout map.
      - [ ] Update command handling logic to lookup the correct `MotorController` by `id` from the incoming command.
    - [ ] **Sensor Reading:**
      - [ ] Configure GPIO pins for limit switches (if used) as inputs with pull-ups/downs.
      - [ ] Configure PIO state machines (using `rp2040_hal::pio`) or software interrupt-based logic for reading encoders (RP2040 lacks dedicated hardware quadrature peripherals).
      - [ ] Implement logic to read limit switch states and encoder counts periodically or on demand.
    - [ ] **Feedback Integration:**
      - [ ] Update the `JointState` population logic to include actual encoder counts (scaled to position) and limit switch statuses.
      - [ ] _Optional:_ Implement basic PID control loop using the `pid` crate, taking encoder position as feedback and outputting step frequency/commands.
    - [ ] **USB Protocol:**
      - [ ] Update `postcard` deserialization to handle `MultiJointTarget`.
      - [ ] Update `postcard` serialization to send `MultiJointState`.
      - [ ] Increase USB Serial buffer size (e.g., `SerialPort::new_with_buffers(usb_alloc, 256, 256)`) to accommodate larger `MultiJointState` messages.
14. [ ] **Refactor `bridge` Crate (Jetson):**
    - [ ] Update `BridgeClient` methods (`send_command`, `receive_status`) to use the new multi-joint structures from `core` (Item 12).
    - [ ] Ensure serialization/deserialization logic matches the updated `firmware` protocol (Item 13).
15. [ ] **Enhance Integration Test App (`cli`):**
    - [ ] Modify `clap` argument parsing to accept multiple joint targets (e.g., `--target id=0,pos=1.0 --target id=1,pos=-0.5`).
    - [ ] Parse arguments into the `MultiJointTarget` structure.
    - [ ] Call the updated `bridge.send_command()` method.
    - [ ] Receive the `MultiJointState` response.
    - [ ] Print the status of all joints received in the response clearly.
16. [ ] **Arm Assembly (Complete):**
    - [ ] Attach J3 motor/gearbox assembly to upper-arm distal end; bolt elbow plate.
    - [ ] Assemble Ø60mm fore-arm tube section.
    - [ ] Mount J4 motor/gearbox assembly within the fore-arm section.
    - [ ] Assemble J5 wrist pitch mechanism (belt drive as per `arm.md` details).
    - [ ] Mount J5 motor/gearbox assembly.
    - [ ] Mount J6 wrist roll motor/gearbox assembly at the end of the fore-arm.
    - [ ] Attach ISO 9409-1-50-4-M6 tool flange to J6 output.
17. [ ] **Mounting:**
    - [ ] Securely fasten the base of the arm's column (J1 housing) to the chassis structure assembled in Phase 1, ensuring proper alignment.
18. [ ] **Wiring (Arm):**
    - [ ] Carefully route the combined USB/Power harness through the internal passages of the J2 yoke, upper-arm tube, J3 elbow, fore-arm tube, J5 mechanism, and J6 housing.
    - [ ] Terminate the harness wires appropriately at the specified USB-C tool flange connector.
    - [ ] Route individual motor phase cables (6 sets) from each motor joint back towards the chassis base, ensuring sufficient slack for movement and protection from pinching/abrasion.
19. [ ] **Wiring (Control Box):**
    - [ ] Mount all six CL57T drivers onto DIN rail or chassis plate.
    - [ ] Connect 24V+ and GND from the distribution block (Item 10) to the power input terminals of _each_ of the six drivers.
    - [ ] Connect the phase wires (A+/A-/B+/B-) from each motor (routed in Item 18) to the corresponding output terminals on its designated CL57T driver.
    - [ ] Define RP2040 GPIO pin assignments for 6x STEP, 6x DIR, 6x ENABLE signals.
    - [ ] Connect the chosen RP2040 GPIO pins to the STEP+, DIR+, ENA+ inputs on the six drivers (ensure common ground connection, potentially using driver's internal optoisolation correctly).
    - [ ] _Optional:_ Connect encoder outputs (A/B/Z) from CL57T drivers (if using their feedback) or external encoders to the designated RP2040 PIO/GPIO pins (Item 13).
    - [ ] _Optional:_ Connect limit switch signals to designated RP2040 GPIO pins (Item 13).
20. [ ] **Integration Test:**
    - [ ] Flash the updated `firmware` (Item 13) with multi-joint support to the RP2040.
    - [ ] Connect the fully wired RP2040 to the Jetson via USB.
    - [ ] Apply 24V power to the system (ensure E-stop is accessible and functional!).
    - [ ] On the Jetson, use the enhanced `cli` (Item 15) to send commands to individual joints (e.g., `cargo run -- --target id=0,pos=0.1`, then `cargo run -- --target id=1,pos=0.1`, etc.) to verify wiring and basic function of each axis.
    - [ ] Send a multi-joint command (e.g., `cargo run -- --target id=0,pos=0.2 --target id=3,pos=-0.1`).
    - [ ] Verify all commanded joints move as expected.
    - [ ] Verify the received `MultiJointState` printed by `cli` shows plausible position feedback (and sensor states, if implemented) for all joints.

---

## Phase 3: Kinematics, State Management & System Integration

**Goal:** Implement FK/IK and state machines in software AND integrate all hardware systems for basic teleoperation capability, enabling initial data collection.
**Definition of Done:** Arm can be controlled via gamepad in Cartesian space using FK/IK. Joint-level state machines manage movement and homing. Logging framework captures sensor and proprioceptive data during teleoperation. All hardware components (Jetson, sensors, power) are mounted and wired.

21. [ ] **Kinematics Library (Jetson):**
    - [ ] Choose primary kinematics library (e.g., `nalgebra` for core math).
    - [ ] Define robot kinematic parameters (DH parameters or URDF-style link lengths/offsets based on `arm.md`) likely in a config file (e.g., `config/arm_params.yaml`) or constants module. Ensure parameters use `f32` for consistency with `core` types.
    - [ ] Create `crates/kinematics` crate.
    - [ ] Implement Forward Kinematics function: `fn forward_kinematics(joint_angles: &[f32; 6]) -> nalgebra::Isometry3<f32>` in `kinematics/src/lib.rs`.
    - [ ] Implement Inverse Kinematics function: `fn inverse_kinematics(target_pose: &nalgebra::Isometry3<f32>, current_joint_angles: &[f32; 6]) -> Option<[f32; 6]>` using e.g., Jacobian pseudo-inverse or numerical optimization (`optimize` crate?). Handle joint limits.
    - [ ] Add unit tests for FK/IK (e.g., check IK(FK(q)) ≈ q).
22. [ ] **State Machines (`firmware`):**
    - [ ] Define `#[derive(Serialize, Deserialize, ...)] pub enum JointOpState { Idle, Homing, Moving, Error(u8) }` in `core/src/lib.rs`.
    - [ ] Add `state: JointOpState` field to `MotorController` struct in `firmware`.
    - [ ] Implement state transition logic within the `firmware` main loop or `MotorController` methods:
      - [ ] `Idle` -> `Moving` when a new, valid `SetJointTarget` is received.
      - [ ] `Moving` -> `Idle` when target position (from command) is reached (within tolerance, using encoder feedback from Item 13).
      - [ ] `Idle` -> `Homing` on receiving a specific `HomingCommand`.
      - [ ] Implement Homing sequence (e.g., move towards limit switch (Item 13), detect activation, back off slowly, zero encoder count).
      - [ ] `Homing` -> `Idle` on successful completion.
      - [ ] Any state -> `Error(code)` on detecting faults (e.g., excessive position error, limit switch hit unexpectedly, communication timeout).
    - [ ] Update `MultiJointState` struct in `core` to include the `JointOpState` for each joint.
23. [ ] **State Management (`bridge`):**
    - [ ] Modify `BridgeClient` to store the latest received `MultiJointState`, perhaps in an `Arc<Mutex<...>>` for thread-safe access. (Note: Consider `tokio::sync::Mutex` if adopting async later).
    - [ ] Create `crates/control` crate or module.
    - [ ] Implement `struct RobotController { bridge: Arc<Mutex<BridgeClient>>, kinematics: ..., current_state: ... }`.
    - [ ] Implement `RobotController::move_to_pose(&mut self, target_pose: Isometry3<f32>)`:
      - [ ] Reads current joint angles from stored `current_state`.
      - [ ] Calls `inverse_kinematics` (Item 21) to get target joint angles.
      - [ ] Performs safety checks (e.g., joint limits, workspace boundaries, singularity checks).
      - [ ] Constructs `MultiJointTarget` command.
      - [ ] Calls `bridge.lock().unwrap().send_command(...)`.
      - [ ] _Optional:_ Implement trajectory generation/interpolation if smooth motion is needed.
      - [ ] _Optional:_ Monitor joint states via `bridge` until `Idle` or `Error` state is reached for relevant joints.
    - [ ] Implement `RobotController::home_all(&mut self)`:
      - [ ] Sends appropriate homing commands via `bridge`.
      - [ ] Monitors joint states until all joints report `Idle` or `Error`.
24. [ ] **Teleoperation Interface (Jetson):**
    - [ ] Create `crates/teleop` crate.
    - [ ] Add dependencies: `control` (or `bridge`), `gilrs` (gamepad), `nalgebra`.
    - [ ] In `main.rs`, initialize `gilrs` and find connected gamepad. (Ensure `/dev/input/js*` is available; `joystick` package installed in Phase 0).
    - [ ] Initialize `RobotController` instance (Item 23).
    - [ ] Start a loop to process gamepad events (`gilrs.next_event()`):
      - [ ] Read joystick axes values.
      - [ ] Map joystick axes to desired Cartesian velocity (X, Y, Z, Roll, Pitch, Yaw) of the end-effector.
      - [ ] In a separate thread or using async, periodically:
        - [ ] Read current joint angles from `RobotController`'s state.
        - [ ] Calculate current end-effector pose using `forward_kinematics` (Item 21).
        - [ ] Calculate target pose by applying small delta based on Cartesian velocity command: `target_pose = current_pose * nalgebra::Isometry3::new(delta_translation, delta_rotation)`.
        - [ ] Call `robot_controller.move_to_pose(target_pose)`.
      - [ ] Map gamepad buttons to actions like `HomeAll`, gripper control (placeholder), enable/disable control.
25. [ ] **Component Mounting:**
    - [ ] Design/print/fabricate mounting brackets for Jetson, Camera(s), LiDAR on the chassis or arm structure, ensuring stability and appropriate fields of view.
    - [ ] Securely mount the Jetson Orin NX using its bracket.
    - [ ] Securely mount the primary camera (e.g., Realsense, ZED) using its bracket.
    - [ ] Securely mount the LiDAR sensor using its bracket.
26. [ ] **Wiring (Final):**
    - [ ] Connect Jetson Orin NX power input to a suitable 24V->(required voltage, e.g., 12V/19V) DC-DC converter, which is powered from the main 24V distribution block.
    - [ ] Connect Camera data cable (USB or MIPI CSI) to the Jetson.
    - [ ] Connect LiDAR data cable (USB or Ethernet) to the Jetson.
    - [ ] Connect the RP2040 board's USB cable to one of the Jetson's USB ports.
    - [ ] Organize and secure all wiring using cable ties, sleeves, conduits, ensuring no cables can snag or interfere with arm movement through its full range of motion.
27. [ ] **Logging Framework:**
    - [ ] Create `crates/logger` or add module to `control`.
    - [ ] Add dependencies: `serde_json`, `chrono`, `nalgebra`, `image` (if saving images directly), `numpy` format crate (if saving lidar/proprio as npy).
    - [ ] Define `struct LogEntry { ts: f64, rgb: Option<String>, lidar: Option<String>, qpos: [f32; 6], qvel: [f32; 6], goal: Option<String>, skill: Option<String>, torque: Option<[f32; 6]> }` matching `koi.md`.
    - [ ] Implement `struct Logger` with a method `fn log_state(&mut self, ...)`:
      - [ ] Captures timestamp (`chrono::Utc::now()`).
      - [ ] Captures sensor data (requires integration with sensor reading - placeholder for now or use dummy data).
      - [ ] Captures proprioception (`qpos`, `qvel`) from `RobotController`'s state.
      - [ ] Captures commanded action/goal/skill from teleop interface (Item 24).
      - [ ] Saves images/lidar scans to separate files (`data/rgb/NNNNN.jpg`, `data/lidar/NNNNN.npy`) if needed, stores filenames in `LogEntry`.
      - [ ] Serializes `LogEntry` to JSON using `serde_json::to_string()`.
      - [ ] Appends JSON string as a new line to a log file (e.g., `data/teleop_log_YYYYMMDD_HHMMSS.jsonl`).
28. [ ] **Initial Data Collection:**
    - [ ] Create the `data/` directory and subdirs (`rgb/`, `lidar/`) if saving sensor data separately.
    - [ ] Launch the `teleop` application (Item 24) integrated with the `Logger` (Item 27).
    - [ ] Perform a variety of arm movements using the teleoperation interface, mimicking potential tasks (reaching, pick/place motions, exploring workspace).
    - [ ] After a session, stop the logger gracefully.
    - [ ] Inspect the generated `.jsonl` file and any accompanying sensor data files. Verify format correctness against `notes/koi.md` and check for data completeness/plausibility. (Repeated check in Phase 5 focuses on aggregated data).
29. [ ] **Integration Test:**
    - [ ] Power on all systems.
    - [ ] Ensure `firmware` is running on RP2040.
    - [ ] Launch the integrated `teleop` application (with kinematics, state management, and logging) on the Jetson.
    - [ ] Verify smooth, intuitive control of the robot arm end-effector using the gamepad in Cartesian space.
    - [ ] Perform a homing sequence using a mapped gamepad button and verify correct execution.
    - [ ] Check that sensor/proprioception/action data is being actively logged to the `.jsonl` file during operation.

---

## Phase 4: Basic Perception & Task Execution (Traditional)

**Goal:** Implement basic sensor processing and autonomous task execution using traditional robotics techniques (non-KOI) while continuing data collection.
**Definition of Done:** A demo application can use camera/LiDAR input to detect a simple object and command the arm to move towards it using the `RobotController`. Data collection continues.

30. [ ] **Sensor Integration (Jetson):**
    - [ ] Create `crates/perception` crate.
    - [ ] Add dependencies for camera (e.g., `rscam`, `image`, `imageproc`) and/or LiDAR (e.g., vendor SDK bindings, ROS client library, or custom parser for serial/UDP). Note: If using UDP sockets directly, the application might need network capabilities (`cap_net_raw`) or run as root (see Item 39).
    - [ ] Implement `struct CameraReader` or `struct LidarReader`:
      - [ ] Initialize connection to the sensor (open device `/dev/videoX`, connect to ROS topic, connect to network socket).
      - [ ] Provide method `fn capture(&mut self) -> Result<SensorData, Error>` where `SensorData` is an enum/struct containing `image::RgbImage` or LiDAR point cloud data (e.g., using `pcl` crate types or custom struct).
    - [ ] Implement simple processing functions within `perception`:
      - [ ] `fn find_red_blob(image: &image::RgbImage) -> Option<BlobResult>`: Uses color thresholding (check HSV space), contour finding (`imageproc::contours`), calculates centroid and bounding box.
      - [ ] `fn find_closest_point(point_cloud: &PointCloud) -> Option<Point>`: Iterates through points, finds minimum distance within a specified angular/distance range.
    - [ ] Define result structs (e.g., `struct BlobResult { center_uv: (u32, u32), area: u32 }`).
    - [ ] Integrate sensor reading and processing into a perception thread/task that periodically captures data, processes it, and makes results available (e.g., via `Arc<Mutex<Option<PerceptionResult>>>` or message channel).
31. [ ] **Task Planning/Execution (Jetson):**
    - [ ] Create `crates/task_planner` crate or module within `control`.
    - [ ] Implement `struct SimplePlanner`:
      - [ ] Takes perception results (Item 30) as input (e.g., reads from shared state/channel).
      - [ ] Contains simple logic: `if let Some(blob) = perception_result.blob { ... }`.
      - [ ] Translates perception result to a motion goal:
        - [ ] For blob: Calculate a 3D pointing direction or a target pose near the estimated 3D position (requires camera calibration/depth info if available, otherwise just point in 2D direction).
        - [ ] Call `robot_controller.move_to_pose(calculated_target_pose)` (from Item 23).
      - [ ] Implement basic task monitoring: check the result/state returned by `move_to_pose` or monitor `RobotController` state.
32. [ ] **Messaging Crate (Optional but Recommended):**
    - [ ] Consider creating `crates/messages`.
    - [ ] Define perception result structs (e.g., `BlobResult`) from Item 30 here instead of `core` to decouple perception from low-level control.
    - [ ] Define high-level task command/status enums here if needed (e.g., `enum Task { PointAt(BlobResult), ... }`, `enum TaskStatus { Pending, Active, Succeeded, Failed }`).
33. [ ] **Demonstration Application:**
    - [ ] Create `crates/demo_blob` crate.
    - [ ] Initialize and run the sensor reader/perception thread (Item 30).
    - [ ] Initialize the `RobotController` (Item 23).
    - [ ] Initialize the `SimplePlanner` (Item 31).
    - [ ] Implement a main loop that:
      - [ ] Gets latest perception results.
      - [ ] Passes results to the planner.
      - [ ] Allows triggering the planner logic (e.g., via terminal input).
      - [ ] Prints status updates ("No blob detected", "Blob found at X,Y", "Commanding move to pose...", "Move complete/failed").
    - [ ] _Optional:_ Use `show-image` crate to display the camera feed with detected blob overlay.
34. [ ] **Continue Data Collection:**
    - [ ] Run more teleoperation sessions using the setup from Phase 3 (Item 28).
    - [ ] Focus on capturing diverse interactions, including manipulating objects if a gripper is functional, to provide rich data for later KOI training.
    - [ ] Regularly back up collected `data/` directory.
    - [ ] Review data quality periodically.
35. [ ] **Integration Test:**
    - [ ] Place a visually distinct object (e.g., red ball) in the robot's workspace and field of view.
    - [ ] Run the `demo_blob` application (Item 33) on the Jetson.
    - [ ] Verify the application detects the object (e.g., prints detection info, shows overlay if visualization exists).
    - [ ] Trigger the task execution.
    - [ ] Verify the robot arm moves to point towards or reach for the detected object based on the `SimplePlanner` logic.
    - [ ] Verify task status reporting (success/failure).

---

## Phase 5: KOI Model Training & Deployment

**Goal:** Train, quantize, and deploy the `koi0-think` (planner) and `koi0-act` (reflex) models onto the Jetson for AI-driven control.
**Definition of Done:** KOI models are trained, quantized, and deployed via `robotd` service on Jetson. High-level text commands can be sent to `robotd` to initiate autonomous tasks. Performance metrics (latency, resource usage) are measured.

36. [ ] **Data Preparation:**
    - [ ] Aggregate all `.jsonl` logs collected during Phase 3 (Item 28) and Phase 4 (Item 34).
    - [ ] Develop and run data cleaning scripts (e.g., `crates/training/scripts/clean_data.py`): filter out bad data points (e.g., discontinuities, missing sensor readings), potentially normalize values.
    - [ ] Develop and run data splitting scripts (e.g., `crates/training/scripts/split_data.py`): divide data into `train.jsonl`, `validation.jsonl`, and `calibration.jsonl` (for QAT, Stage F in `koi.md`). Ensure splits are representative and non-overlapping.
    - [ ] Verify the quantity and quality of the prepared datasets are sufficient based on `notes/koi.md` requirements or empirical testing.
37. [ ] **KOI Training Pipeline:**
    - [ ] **Setup Training Environment:** On a dedicated machine with sufficient GPU(s) and RAM, potentially using Nix environment defined within `crates/training`, create environment and install dependencies as per `notes/koi.md`, Section 4.1.
    - [ ] **Download Base Models:** Obtain Gemma 27B (`koi0-teach`) and Gemma 7B base models from Hugging Face or other sources.
    - [ ] **Install/Verify TensorRT-LLM Version:** Ensure the version of TensorRT-LLM used matches the TensorRT version included in the target JetPack (e.g., JetPack 6 includes TRT 9.x). Follow official NVIDIA guides for installing compatible TRT-LLM (potentially managed via Nix).
    - [ ] **Stage A (KD):** Run `python crates/training/scripts/kd_train.py ...` (or similar path within the crate) using prepared `train.jsonl`, tuning `tau_grid` and `kl_grid` as needed. Select best checkpoint based on validation loss.
    - [ ] **Stage B (VL Align):** Run `python crates/training/scripts/vision_finetune.py ...` using the best checkpoint from Stage A.
    - [ ] **Stage C (RL - Optional):** If performing RL polish, set up Isaac Sim environment, implement reward function, run SAC training (scripts likely within `crates/training`).
    - [ ] **Stage D (PTQ Think):** Run `python TensorRT-LLM/tools/qlora_int4_export.py ...` (Note: Assumes TensorRT-LLM is installed system-wide or via Nix, path might differ) on the Stage B/C checkpoint to generate `koi0-think.plan` (TRT-LLM engine file).
    - [ ] **Stage E (VLA Distill):** Run `python crates/training/scripts/vla_distill.py ...` using `koi0-think.plan` and training data to produce `koi0-act-fp16`.
    - [ ] **Stage F (QAT Act):** Run `python crates/training/scripts/qat_int8_export.py ...` using `koi0-act-fp16` and `calibration.jsonl` to generate `koi0-act.plan` (TRT-LLM engine file).
    - [ ] **Stage G (HF Upload - Optional):** Use `huggingface-cli` to upload generated `.plan` files and model cards to Hugging Face Hub (`pond/koi0-think`, `pond/koi0-act`).
38. [ ] **Model Transfer:**
    - [ ] Copy `koi0-think.plan` and `koi0-act.plan` from the training machine to the Jetson Orin NX using `scp` or `rsync`, placing them in `/opt/models/` (create directory if needed).
    - [ ] Verify file integrity using checksums (`md5sum` or `sha256sum`).
39. [ ] **Runtime Setup (Jetson):**
    - [ ] **Install Dependencies:** Install NVIDIA TensorRT and TensorRT-LLM libraries on the Jetson following official NVIDIA documentation for JetPack 6.
    - [ ] **Implement `robotd` Service:**
      - [ ] Create a new project/executable (`robotd`) likely in C++ or Python, leveraging TensorRT-LLM C++ or Python runtime APIs.
      - [ ] Implement model loading logic: use TRT-LLM API to load `/opt/models/koi0-think.plan` onto a low-priority CUDA stream and `/opt/models/koi0-act.plan` onto a high-priority stream.
      - [ ] Implement threading (`koi.md`, Sec 5.2): Spawn separate threads for sensor input, reflex (`koi0-act`), and planner (`koi0-think`). Consider using RT priorities and CPU affinity (`sched_setscheduler`, `taskset`) for the reflex thread to ensure low latency.
      - [ ] Implement inter-thread communication (e.g., using message queues like `std::sync::mpsc` or ZeroMQ) for passing sensor data, planner goals, and reflex actions.
      - [ ] Implement the reflex loop: `sensor_data -> koi0-act -> low_level_motor_commands`.
      - [ ] Implement the planner loop: `sensor_data + goal -> koi0-think -> high_level_actions/subgoals -> reflex_thread`.
    - [ ] **Systemd Service:**
      - [ ] Create `/etc/systemd/system/robotd.service` file defining how to start the `robotd` executable, dependencies, user, restart policy. Ensure the service has necessary permissions (e.g., `AmbientCapabilities=CAP_NET_RAW` if using UDP sockets, or correct device group access).
      - [ ] Enable the service: `sudo systemctl enable robotd.service`.
      - [ ] Start the service: `sudo systemctl start robotd.service`.
      - [ ] Check status: `sudo systemctl status robotd.service`.
40. [ ] **Integration with `bridge`/Controller:**
    - [ ] **Decision Point:** Explicitly decide and document how `robotd` (specifically the reflex thread) sends motion commands:
      - [ ] Option A: `robotd` implements the `core` serial protocol (`postcard` over serial) and talks directly to the RP2040 via `/dev/ttyACMx`. Requires serial port access management.
      - [ ] Option B: `robotd` sends `MultiJointTarget` commands back to the existing `bridge` crate (e.g., via a new method or IPC channel), which then handles the serial communication. Requires `bridge` modifications.
    - [ ] Implement the chosen command flow (modify `robotd`, `bridge`, or both).
    - [ ] Modify the high-level control interface (e.g., `teleop` or a new GUI `dashboard`).
    - [ ] Instead of calling `RobotController::move_to_pose`, implement functionality to send high-level goals (e.g., text commands like "pick up the red block") to the `robotd` planner thread via its communication channel (e.g., ZeroMQ socket).
41. [ ] **Performance Benchmarking:**
    - [ ] While `robotd` is running under load (e.g., executing a task), run `tegrastats` on the Jetson terminal to monitor GPU/CPU/RAM usage.
    - [ ] Instrument `robotd` code (e.g., using `std::chrono` in C++ or `timeit` in Python) to measure the execution time (latency) of the reflex loop (`koi0-act` inference + overhead) and planner steps (`koi0-think` inference).
    - [ ] Collect statistics (average, p99 latency) over a period.
    - [ ] Compare measured latency and resource usage against the targets specified in `notes/koi.md`, Section 6.
42. [ ] **Task Evaluation:**
    - [ ] Define a set of standardized benchmark tasks representative of the robot's intended function (e.g., "pick object from location A, place at B", "wipe surface C", "navigate to point D").
    - [ ] Execute these tasks using the KOI stack by sending high-level goals to `robotd`.
    - [ ] Measure quantitative metrics: success rate, completion time, path smoothness (e.g., jerk analysis).
    - [ ] Qualitatively assess performance: robustness to minor variations, naturalness of motion.
    - [ ] Compare KOI stack performance against baseline (teleoperation, Phase 4 traditional methods) for the same tasks.
43. [ ] **Final Integration Test:**
    - [ ] Reboot the entire robot system.
    - [ ] Verify `robotd.service`
