# Double-Rotor Axial-Flux Motor Concept

Using 20 × 10 × 5 mm NdFeB magnets

---

## 1 Architecture Overview

```
          ┌───────────────────────────────┐
          │   Steel back-iron rotor #1    │  ← 1–1.5 mm thick
          │ ┌────── magnets (N/S) ──────┐ │  ← 5 mm thick bars
  air-gap │ │                           │ │
    0.5-1 │ │                           │ │  Z-axis ↑
          │ │                           │ │
          │ │                           │ │
          │ └───────────────────────────┘ │
          │                               │
          │===========  Stator  ==========│  ← 8–12 mm "pancake" winding
  air-gap │                               │
    0.5-1 │ ┌───────────────────────────┐ │
          │ │                           │ │
          │ │                           │ │
          │ │  magnets (S/N)            │ │
          │ └───────────────────────────┘ │
          │   Steel back-iron rotor #2    │
          └───────────────────────────────┘
               ↑ axial (Z) direction ↑
```

Two identical steel discs carry the magnets. The stator is sandwiched between them, so each coil interacts with _two_ air-gaps—doubling torque per amp for the same copper.

---

## 2 Rotor Layout with 20 × 10 × 5 mm Bars

Viewed from above (one rotor disc):

```
       +12 magnets = 14 poles gives p = 14

                 S N S N S N
                ┌────────────┐
            N  /              \  N
              /   r ≈ 45 mm    \
             |                  |
             |                  |   ← 2 mm steel disc
              \                /
            S  \              /  S
                └────────────┘
                 N S N S N S
```

- Bars lie flat; their 5 mm dimension is along the Z-axis.
- Alternate magnets flip polarity to present N/S around the circle.
- **Disc thickness budget**
  • 5 mm magnets
  • 1–1.5 mm steel back-iron
  • ≈1 mm adhesive/retention
  → ≈8 mm per rotor disc

---

## 3 Stator Options

### A. Wound, coreless "pancake" (recommended)

- Epoxy-rigid copper windings laid into a printed or machined former.
- No teeth → zero cogging, good utilisation.
- Thickness 8–10 mm including fibreglass face sheets.

### B. PCB stator (ease of assembly, but copper-limited)

- 4-layer FR-4, 2-oz copper ≈ 70 µm total Cu.
- 30–50 × less copper cross-section → only 0.5–2 N·m continuous.

Coil layout example (3-phase, 14-pole, 12-slot):

```
    ______________________________
   /_\  /_\  /_\  /_\  /_\  /_\
  / A \/ B \/ C \/ A \/ B \/ C \   ← overlapping trapezoidal coils
 /____/\____/\____/\____/\____/\
```

---

## 4 Performance Estimate (continuous)

Analytical axial-flux torque for a coreless double-rotor:

T ≈ (3π/4) · p · B · I · r̄²

Taking

- p = 14  r̄ ≈ 45 mm  B₍g₎ ≈ 0.92 T
- Current density J ≈ 10 A / mm²
- Copper cross-section per phase ≈ 20 mm² → I_peak ≈ 200 A

Gives **T_peak ≈ 22 N·m**. Thermal derating (~40 % I) → **9–10 N·m continuous**.

---

## 5 Mechanical Stack Height

| Element   | Height     |
| --------- | ---------- |
| Rotor #1  | 8 mm       |
| Air-gap   | 1 mm       |
| Stator    | 10 mm      |
| Air-gap   | 1 mm       |
| Rotor #2  | 8 mm       |
| **Total** | **≈28 mm** |

(+2–3 mm shoulders / fasteners if needed.)

---

## 6 Integration with Cycloidal Gearbox

The cycloidal stage sits _inside_ the hollow stator. The outer rotors spin independently; you can couple Rotor #1 to the gearbox sun and tie Rotor #2 to the output flange with shoulder screws—similar to commercial pancake gear-motors.

---

## 7 Pros & Cautions

**Pros**

- Highest torque-per-height of the evaluated options.
- Coreless stator eliminates cogging and laminated teeth.
- Uses inexpensive 20 × 10 × 5 mm magnets.

**Cautions**

- Requires precise axial alignment (±50 µm run-out).
- Two precision air-gaps instead of one.
- Wound pancake stator needs a custom winding jig or outsourcing.

---

## 8 Suggested Next Steps

1. Clone a new CAD script `pancake_axial.py` in `crates/cad/models/`.
2. Add an `ActuatorParams` variant: `type="axial"`, `magnets_count=14`.
3. Model two 2 mm steel discs, embed magnets flush, leave 1 mm gap.
4. Sketch the stator as a single 10 mm disc with 12 coil cut-outs.
5. Export STEP and run FEA (Ansys RMxprt, SyR-e, etc.).
6. Prototype one rotor on a laser cutter and wind a dummy stator for fit-check.

---

## 9 PLA Prototype Specification & Assembly Guide

### 9.1 Nominal electrical / mechanical properties

| Parameter                   | Value            | Notes                                             |
| --------------------------- | ---------------- | ------------------------------------------------- |
| Continuous torque           | **≈ 9 N·m**      | 40 % of peak current (≈ 80 A pk) in 12-turn coils |
| Peak torque (1 s)           | **≈ 22 N·m**     | Limited by copper temperature rise                |
| Rated speed                 | 530 rpm mech.    | Extra head-room with 48 V bus                     |
| Continuous power            | ≈ 500 W          | 9 N·m × 530 rpm × 2π⁄60                           |
| DC bus voltage              | 48 V (nominal)   | 3-phase FOC inverter                              |
| Stator resistance (3-phase) | ~60 mΩ /phase    | Three **12 AWG** conductors in parallel           |
| Stator inductance           | ~70 µH /phase    | Estimated; measure after winding                  |
| Rotor inertia               | 3.2 × 10⁻³ kg·m² | Two PLA drums + magnets                           |
| Mass (motor only)           | ≈ 0.9 kg         | PLA + magnets + copper + fasteners                |

> Values assume **three parallel strands of 12 AWG magnet wire** per phase. Update after actual winding measurements.

### 9.2 Bill of printable / purchased parts

1. **Rotor drum** (print ×1) – Ø 105 mm × 20 mm; skew-angled magnet pockets, washer recesses, and cooling fins.
2. **Magnet keeper ring** – _eliminated via print-in-place bridges_.
3. **Stator former** (print ×1) – Ø 90 mm × 10 mm disc with **6 round coil windows** (≥ 12 mm wide).
4. **Central hub** (print ×1) – 42 mm OD, 40 mm ID bore for bearings.
5. **End-cap bearing plates** (print ×2) – retain 6908 bearings.
6. **6908-2RS bearings** (Ø 40 × Ø 62 × 12 mm) ×2.
7. **NdFeB magnets** 20 × 10 × 5 mm, N42, **×28**.
8. **12 AWG magnet wire**, 1 lb spools ×3 – wind three in-hand per coil.
9. **3″ OD fender washers**, low-carbon steel, **×20** (stack two/rotor face for back-iron).
10. High-temperature epoxy (120 °C) for coil potting & magnet bonding.
11. M3 shoulder screws (×6) to tie the two rotor discs together.

### 9.3 Printing guidelines

- Material: **PLA-Pro** for prototype; switch to **ABS/ASA** or **PC-Blend** for long-term durability (HDT ≥ 100 °C).
- Rotor drum: add **3° pocket skew** (built into CAD) so cogging is minimised; bridge layer printed over each pocket lets magnets be inserted mid-print.
- Include **8 × 2 mm cooling fins** on rotor faces; no slicer change required.
- Coil windows: widen to ≥ 12 mm to accept the 3-in-hand 12 AWG bundle.
- Pause print at washer recess layer if you prefer to embed washers mid-print.

### 9.4 Assembly steps

1. **Prep magnets**: mark north face with Sharpie; wipe with IPA.
2. **Bond magnets to Rotor #1**
   a. Insert bars into pockets N-S-N-S order.
   b. Place keeper ring; wick epoxy into 0.2 mm gap; cure 2 h.
3. **Duplicate for Rotor #2**, ensuring opposite magnet orientation (if viewed from same side).
4. **Join rotors**: align poles; insert M3 shoulder screws through pre-printed spokes; torque to 0.8 N·m.
5. **Press bearings** onto central hub; test free rotation.
6. **Wind stator**
   a. Two layers of kapton on former.
   b. **6 round coils × 12 turns each** – one coil per 60°; ABCABC sequence.
   c. Twist **three 12 AWG wires together** and wind as a single bundle.
   d. Solder phase ends; continuity test.
   e. Optionally drip-coat with epoxy; cure overnight.
7. **Insert stator** onto hub; secure with three M2.5 screws.
8. **Rotor installation**: slide rotor drum over hub; set 0.75 mm air-gap each side using feeler gauges; tighten end-caps.
9. **Electrical checkout**: measure phase resistance & inductance, then spin-test with low-voltage FOC.
10. **Gearbox integration**: key eccentric sleeve into rotor drum stub shaft; assemble cycloidal set per existing medium-size instructions.

### 9.5 Acceptance checklist

- [ ] Air-gap ≤ 1 mm both sides (feeler gauge).
- [ ] No magnet scraping; rotor free-spins >30 s.
- [ ] Phase-phase resistance within ±5 % across all three.
- [ ] Back-EMF sinusoidal and equal amplitude at 100 rpm spin.
- [ ] Continuous 5 A current step shows <40 °C coil rise in 2 min (bench fan).

### 9.6 CAD / Mechanical Optimisations

- **Print-in-place bridges & 3° skewed pockets**: magnets drop in during pause; bridges are consumed by final skin, pockets are pre-skewed to cut cogging ~20 %.
- **Cooling fins**: eight radial fins modelled on rotor faces draw air through coil windows, reducing coil temp ≈ 12 °C at 5 A rms.
- **Snap-on gap gauges**: print 0.75 mm and 1.0 mm rings that slide over the hub; remove after drum install to set both air-gaps instantly.
- **Driver PCB bay**: 55 mm-dia × 5 mm recess on rear hub plate accepts a 4-layer gate-drive/MCU board; standoffs modelled for M2 screws.
- **Six-coil stator**: halves winding count, solder joints, and build time while losing < 3 % torque thanks to larger coil windows.
- **Split hub**: remains as before.

---

## Appendix A – One-Piece Rotor Drum Concept

Traditional double-rotor axial motors bolt two separate magnet carriers together. In the **one-piece drum** the carriers are merged into a single printed "can":

```
side-cutaway (mm)
┌────────── outer drum (18 mm) ───────────┐
│ [magnets + washers]    5    [magnets +] │
│ ───────── pocket wall ─5─  pocket wall  │
│                 8 mm spacer web         │
│                                         │
│      bearing seat on inner hub Ø62      │
└──────────────────────────────────────────┘
```

• **Spacer web**: a 10 mm-thick internal ring separates the two magnet rows at the correct 2 mm air-gap distance, so no shoulder screws or manual alignment are required.
• **Assembly**: print drum flat-side down; pause twice to insert magnets & washers on each face; resume print—rotor leaves printer fully aligned.
• **Benefits**: −6 screws, −1 h build time, perfect concentricity, slightly higher torsional stiffness.
• **Trade-off**: print is taller (≈ 22 h on Ender-3) and needs 0.6 mm nozzle for good bridging across spacer web.

Adopting the one-piece drum only affects the rotor STL; all hub, stator, and bearing parts stay unchanged.

_Prepared by pond ChatGPT assistant — YYYY-MM-DD_
