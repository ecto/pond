# “Frog‑Head v0” integrated perception package

(RPLIDAR C1 + Intel RealSense D455 + 10.1-inch capacitive touch display on a 12 V high-torque-servo pan/tilt neck, framed in 2020-series aluminium extrusion)

⸻

## 1. Functional objectives

- Layer Goal Sensor / actuator role
- Global navigation 360 ° 2-D scans feeding 2-D cost-map + loop-closure prior for full 3-D SLAM RPLIDAR C1
- Near-field dense 3-D + semantics Object meshes, grasp planning, VI-SLAM, face / gesture detection RealSense D455 stereo + RGB + IMU
- Human-robot interface "Face" for emotive output, tele-op widgets, status indicators 10.1" IPS 1280 × 800 capacitive touchscreen
- Active perception & expression Direct head gaze, expressive nod/shake, 3-D map densification sweeps 2-axis 150 kg-servo stack (pan, tilt)

⸻

## 2. Bill of materials (mechanical & electro-optical)

Qty Item Key specs Mass (g)
1 RPLIDAR C1 360 °, 12 m, 5 k s⁻¹ samples 110 g ￼
1 Intel RealSense D455 124 × 26 × 29 mm, 0.52–6 m, on-die BMI055 IMU 75 g (datasheet) ￼
1 Elecrow 10.1" IPS capacitive monitor (B0BKGCB18T) 10.4 " W ×6.6 " H ×1.2 " D, 1920 × 1080, USB-C PD 5 V @ 1.5 A typ. 1000 g ￼
2 High-torque 12 V digital servo (ANNIMOS RDS51150SG, 150 kg·cm stall) 200 g ea.
4 2020-T6 extrusion, 150 mm length + corner brackets "frame cage" 310 g total
2 6061-T6 machined side plates (5 mm) pan-axis cheeks 190 g total
1 1.5 mm 5052 aluminium front bezel for LCD — 160 g
— Wiring, JST/USB harness, fasteners — ~120 g

Total head mass @ home-pose: ≈ 2.4 kg (including gearheads & wiring).
Centre of gravity is 48 mm behind LCD glass, 35 mm above pan axis (see drawing).

⸻

## 3. Actuation & load analysis

Axis Range Worst-case torque budget (static) Drive train Notes
Pan ±180 ° continuous 2.3 kg × 9.81 m s⁻² × 0.05 m ≈ 1.1 N·m direct output of 150 kg servo ⇒ 14 N·m stall >10× margin; internal steel gears, ≈0.4 ° backlash
Tilt +40 ° / −30 ° lever arm 0.15 m ⇒ 3.4 N·m same servo class ⇒ 14 N·m stall Plenty margin; keeps face orientation stiff for display taps

Servos expose internal position feedback (~0.3 ° resolution) → publish /joint_states at 200 Hz for TF.

⸻

## 4. Mechanical stack-up (side view, ASCII 1:8)

```
          ┌───────────────────────┐
          │   RealSense D455      │  <-- M2 standoffs (10 mm)

┌─────────┴───────────────────────┴─────────┐
│ 10.1" LCD + PCB │
│ (front bezel flush to frame opening) │
└┬──────────────────────────────────────────┬┘
├───── tilt-axis cheeks (6061 side plates) │
│ (Direct-drive 150 kg servo tilt axis) │
│ │
│ ╭──────────RPLIDAR C1──────────╮ │ <-- top surface 12 mm below tilt axis
│ ╰──────────────────────────────╯ │
│ │
│ (Direct-drive 150 kg servo pan axis) │
├──────────────────────────────────────────┤
│ 2020-T-slot square frame │
└───────────↓ pan axis bearing ↓───────────┘
```

Back view shows USB-C (D455) and USB-C PD (LCD) routed through a hollow 10 mm ID aluminium shaft (pan axis) to the torso.

⸻

## 5. Electrical & data topology

```
Jetson-Orin (native USB 3.0 ports)
├── rplidar_node (/dev/ttyUSB0, 115k2)
├── /camera/* (D455 USB3)
├── /imu (in-camera BMI055, 200 Hz)
└── /touchscreen (USB-HID)

12 V DC rail in torso
├── 12 V direct → pan/tilt servos (2 × ≤8 A stall each)
├── 5 V @ 5 A buck → LCD (7.5 W typ)
└── 5 V @ 2 A buck → D455 (1.5 W typ)
```

Sync line: D455 frame-sync pin wired to Jetson GPIO 23; lidar timestamped in driver with last rising edge (±200 µs).

⸻

## 6. Software integration & recording

| Stack element | ROS 2 topic                              | Stored in MCAP                   |
| ------------- | ---------------------------------------- | -------------------------------- |
| Raw lidar     | /rplidar/scan (sensor_msgs/LaserScan)    | yes                              |
| Stereo depth  | /camera/depth/color/points (PointCloud2) | yes                              |
| RGB           | /camera/color/image_raw                  | yes                              |
| IMU           | /camera/imu                              | yes                              |
| Joint states  | /joint_states (pan, tilt)                | yes                              |
| Fused cloud   | /perception/fused_cloud (voxel 2 cm)     | optional (reproducible from raw) |

Offline converter pipeline (Python):

```
ros2 bag convert frog_head.mcap \
 --output dataset_kitti \
 --plugin perception/kit_converter.so
```

Outputs standard KITTI velodyne64 + RGB + poses directories for existing depth-completion or NeRF tooling.

⸻

## 7. Pan/tilt justification vs fixed mount

- Criteria Fixed mount Pan/tilt head
- Vertical coverage 58 ° (D455) +0 ° lidar ±70 ° tilt lidar sweeps yield sparse 3-D shell
- Expressivity static nod, shake, lean – conveys intent
- Mapping density rely on base motion local 3-D fill-in without driving base
- Mass, cost, calibration lowest +1.1 kg, +$160, extrinsic drift risk

Given humanoid-class emotivity and the need to densify overhead/low-shelf voxels without torso motion, the articulated head is worth the complexity.

⸻

## 8. Next fabrication steps

1. CAD: Import STEP models (Intel, Slamtec) → assembly in Onshape; drive dimensions with spreadsheet.
2. Panel manufacture: Water-jet 5 mm 6061 cheeks, bend 1.5 mm bezel; powder-coat RAL 6018 (frog green) if desired.
3. Harness: Make 30 AWG FFC for LCD USB-C (flex during tilt) + slip-ring option if continuous pan required (> ±270 °).
4. Calibration script: Run kalibr_calibrate_imu_camera (IMU+stereo) then lidar_camera_calib to derive T_cam_lidar.
5. Test sequence: bench-power, centre servos, sweep tilt ±40 °, verify point-cloud stitching < 1 px reprojection error.

⸻

Bottom line

A 2.4 kg aluminium-extrusion head with RPLIDAR C1, RealSense D455, and 10.1" touchscreen driven by high-torque 12 V servos provides Frog with a 360 ° planar map, dense forward RGB-D, expressive motion, and a ready-to-record fused dataset (LaserScan + RGB-D + IMU + joint states) that can be exported to KITTI-style or point-cloud archives for later training. The integrated steel-gear servos supply ample torque while simplifying electronics and eliminating external gearboxes.
