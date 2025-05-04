# NEMA‑23 Homogeneous Cobot Arm — **FINAL SPEC v1.0**

_Household service arm, 1 kg payload @ 0.4 m reach — Prime‑sourced, no on‑site machining required_

---

## 1  System Overview

| Item                 | Value                                                            |
| -------------------- | ---------------------------------------------------------------- |
| DoF                  | 6 rotary + quick‑change tool flange                              |
| Payload (continuous) | **1 kg** at 0.4 m (≥2× dynamic margin)                           |
| Reach                | Shoulder pivot → tool point **650 mm**                           |
| Repeatability        | ≤ ±0.3 mm Cartesian (0.004 ° joint)                              |
| Backlash             | ≤ 1.6 ° @ joint (planetary), software compensated                |
| Supply               | 24 V DC (EcoFlow River 2 inverter or 12→24 V boost)              |
| Control bus          | **USB 2.0 High-Speed (480 Mbit/s)**                              |
| Safety               | 24 V e‑stop loop, software velocity/torque caps, no pinch cables |

---

## 2  Actuator Stack (Homogeneous)

- **Motor / Driver** STEPPERONLINE closed‑loop NEMA‑23 kit 3 N·m + CL57T V4.1 (ASIN B0C6943QBM)
- **Gearhead** 20 : 1 planetary, NEMA‑23 flange (ASIN B0BPHQF2FW)
- **Effective output** 18 N·m peak, 0.0045 ° step, 0.42 m s⁻¹ tip speed @ 24 V

All six joints share the same SKU → one spare repairs any axis.

---

## 3  Mechanics

### 3.1 Link Architecture

```
          (J6)──────────── TOOL (Gripper)
           || Roll
          /==\              [Tool Flange]
         // J5 \\ Pitch
        //______\\ <-- Belt Drive
       ||        ||
       ||  (J4)  || Yaw     Fore-arm (Ø60)
       ||________||--------- 250 mm --------→
      /__________\
     //          \\
    //    (J3)    \\ Elbow
   //______________\\
  ||                ||
  ||                ||      Upper-arm (Ø80)
  ||                ||-------- 300 mm --------→
  ||                ||
  ||     (J2)       || Shoulder
  ||________________|| Pitch
 /==================\
//                  \\
||       (J1)       || Base Yaw
\\__________________// <--- Slewing Bearing
       |         |
       | Column  | (Ø100)
       | housing | 500 mm
       |_________|
```

_Tube stock_ — 6061‑T6, Ø80×4 mm upper‑arm (ASIN B0B3Y9NX83), Ø60×4 mm fore‑arm (ASIN B0B3Y9V9BP), Ø100×6 mm column (ASIN B0BH7Z77YV). Cut with drop‑saw; no machining ops.

### 3.2 Motor Yokes & Plates

Flat adapters (3 mm 6061) laser‑cut by SendCutSend; DXF set provided in `/cad/plates/`. Bolts are ISO 4762 M5‑0.8 grade 8.8 with Nylock nuts.

### 3.3 Cable & Hose Routing

- 24 V/GND + **USB** pair run _inside tubes_ → **USB-C tool connector**.
- Motor phase bundles exit via M12 shield glands at each yoke, loop back inside.
- Ø80 mm base column uses **USB-compatible slip-ring** (ASIN TBD) for unlimited J1 rotation.

---

## 4  Electronics

### 4.1 Power Train

| Stage        | Part                             | Note                    |
| ------------ | -------------------------------- | ----------------------- |
| AC‑in        | EcoFlow River 2 inverter         | 120 VAC → 300 W         |
| 24 V bus     | Mean‑Well LRS‑350‑24 SMPS        | 350 W, fan off <55 °C   |
| Distribution | WAGO 221‑615 bus + 15 A ATO fuse | Star topology in column |

### 4.2 Control

| Level      | HW                            | Function                                              |
| ---------- | ----------------------------- | ----------------------------------------------------- |
| High‑level | Jetson Orin NX                | ROS 2 MoveIt‑2, trajectory generation                 |
| Arm MCU    | **RP2040 Board (e.g., Pico)** | Generates STEP/DIR for six axes via PIO DMA @ 200 kHz |
| Drivers    | CL57T (×6) on DIN rail        | 2 kHz current loop, 1 kHz position loop               |

_Bus timing_ — USB 2.0 provides ample bandwidth for real-time setpoints and status updates.

---

## 5  End Effector

### 5.1 Tool‑Changer

- **Interface** ISO‑9409‑1‑50‑4‑M6 flange, Ø6 H7 dowel, **USB-C power/data connector**.
- **Retention** Manual cam‑lock ring (Kant‑Twist 6005A53) → ±0.05 mm face repeatability.

### 5.2 NEMA‑17 Screw Gripper (Aluminium)

| Metric | Value                                      |
| ------ | ------------------------------------------ |
| Travel | 55 mm parallel                             |
| Force  | 150 N @ 24 V (0.7 N·m motor → 20 mm lever) |
| Speed  | 40 mm s⁻¹                                  |
| Weight | 320 g                                      |
| Cost   | 129 USD                                    |

No printed parts: jaws, coupler block, flange are water‑jet 6061; jaw faces use nitrile pads (McMaster 8633K12).

---

## 6  Bill of Materials (Arm + Gripper)

_All prices Prime, captured 2025‑05‑02, Cleveland zip._

### 6.1 Motion

| Qty | Part                     | ASIN       | Unit \$ | Ext \$     |
| --- | ------------------------ | ---------- | ------- | ---------- |
| 6   | NEMA‑23 closed‑loop kit  | B0C6943QBM | 85.99   | 515.94     |
| 6   | 20 : 1 planetary gearbox | B0BPHQF2FW | 41.00   | 246.00     |
| —   | **Motion sub‑total**     |            |         | **761.94** |

### 6.2 Structure & bearings

\| | Tubes, plates, slewing bearing, bolts | | | 212.00 |

### 6.3 Electronics & power

\| | Jetson NX, **RP2040 hub**, SMPS, WAGO, glands, wiring | | | 425.00 |

### 6.4 Tool‑changer & gripper

\| | ISO flange, **USB-C conn.**, NEMA‑17 kit, lead‑screw, jaws | | | 185.00 |

**Total hardware per arm ≈ 1 585 USD** (ex‑tax, excl. tools).

---

## 7  Assembly Order (high‑level)

1. Cut aluminium tubes to length; deburr inside edges.
2. Mount J1 slewing bearing to column top, seat NEMA‑23 + gearbox beneath.
3. Slide Ø80 upper‑arm tube over J2 yoke; feed **24 V/USB harness** through.
4. Install J3 motor/gearbox at upper‑arm distal end; bolt elbow plate.
5. Assemble Ø60 fore‑arm with J4 & belt‑driven J5; pull harness through to flange.
6. Terminate **USB-C connector**, plug gripper.
7. Mount DIN rail & six CL57Ts in column; land WAGO bus wiring.
8. Power‑on: run CL57T auto‑tune, then home joints via limit switches or motor amp‑zero.
9. Flash **RP2040 firmware**, verify **USB communication** @ >100 Hz.
10. Load URDF into MoveIt‑2, calibrate TCP, run first pick‑and‑place.

---

## 8  Future Options

- **Upgrade to 48 V** for 2× tip speed—CL57T supports it natively.
- **Swap wrist belt to harmonic gear** for backlash‑free precision tasks.
- **Add FT‑300 force sensor** in tool flange (5 V, **via USB interface**).

---

## 9  Revision History

| Date       | Version | Note                                                                |
| ---------- | ------- | ------------------------------------------------------------------- |
| 2025‑05‑01 | 0.1     | Initial draft, multi‑diameter links, LX‑224 gripper                 |
| 2025‑05‑02 | 0.6     | Added CAN‑FD, ESP32 hub, aluminium gripper                          |
| 2025‑05‑02 | 1.0     | Finalised tubing, BOM costs, ASCII blow‑outs; ready for procurement |
| **TODAY**  | **1.1** | **Switched control bus to USB, MCU to RP2040**                      |
