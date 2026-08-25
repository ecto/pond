# PCB Generation for Pond

This crate provides programmatic PCB generation using Python and KiCad file formats. It follows the same pattern as the `cad` crate, allowing you to define PCB designs in Python and generate KiCad-compatible files.

## 🎯 Purpose

Generate **PCB stator designs** for the RANA actuator family with parametric spiral coil patterns, integrated sensors, and manufacturing-ready output.

## 🏗️ Architecture

The PCB generation system consists of:

1. **Rust CLI** (`generate-pcb`): Discovers and executes Python PCB model scripts
2. **Python Models**: Define PCB designs using parametric generators
3. **Base Classes**: Reusable utilities for creating KiCad PCB files

```
crates/pcb/
├── Cargo.toml              # Rust crate configuration
├── src/
│   ├── lib.rs              # Library (minimal)
│   └── bin/
│       └── generate_pcb.rs # CLI entry point
└── models/
    └── stators/
        ├── __init__.py           # Package exports
        ├── pcb_stator_base.py    # Base classes and utilities
        ├── rana_s.py             # RANA-S stator (60mm)
        ├── rana_m.py             # RANA-M stator (80mm)
        └── rana_l.py             # RANA-L stator (100mm)
```

## 🚀 Quick Start

### Prerequisites

- **Rust toolchain** (via Nix or rustup)
- **Python 3.8+** (available in your environment)
- **uv** package manager (for venv creation)
- **KiCad 7+** (optional, for viewing generated files)

### Generate PCB Files

Run the PCB generator from the workspace root:

```bash
cargo run --bin generate-pcb
```

This will:
1. Create/reuse a Python virtual environment (`.venv`)
2. Discover all Python scripts in `crates/pcb/models/`
3. Execute each script to generate KiCad PCB files
4. Output `.kicad_pcb` files to `target/pcb/`

### Generated Files

After running, you'll find:

```
target/pcb/
├── stators_rana_s.kicad_pcb    # RANA-S stator (60mm, 6-8 Nm)
├── stators_rana_m.kicad_pcb    # RANA-M stator (80mm, 15-25 Nm)
└── stators_rana_l.kicad_pcb    # RANA-L stator (100mm, 30-50 Nm)
```

Open these files in KiCad to view, edit, and prepare for manufacturing.

## 📐 PCB Stator Design

### What is a PCB Stator?

A PCB stator replaces traditional copper wire windings with **multi-layer spiral traces** on a printed circuit board. This approach offers:

- ✅ **Automated manufacturing** (standard PCB fab process)
- ✅ **Integrated sensors** (Hall arrays, temperature, current sense)
- ✅ **Precise geometry** (better tolerance than hand-wound coils)
- ✅ **Compact design** (10-15% shorter axial length)
- ✅ **Thermal management** (copper planes conduct heat to housing)

### Design Specifications

Based on the RANA actuator family specs:

| Parameter | RANA-S | RANA-M | RANA-L |
|-----------|--------|--------|--------|
| Outer Diameter | 60mm | 80mm | 100mm |
| Center Bore | 10mm | 15mm | 20mm |
| Slots | 12 | 12 | 12 |
| Rotor Poles | 14 | 14 | 14 |
| Layers | 4 | 4 | 4 |
| Trace Width | 0.25mm | 0.25mm | 0.25mm |
| Trace Spacing | 0.25mm | 0.25mm | 0.25mm |
| Copper Weight | 4 oz | 5 oz | 6 oz |
| Continuous Torque | 6-8 Nm | 15-25 Nm | 30-50 Nm |
| Peak Torque | 15-20 Nm | 50-60 Nm | 90-120 Nm |

### Layer Stackup

```
Layer 1 (F.Cu):   Phase A spiral coils (clockwise)
Layer 2 (In1.Cu): Phase B spiral coils (counter-clockwise)
Layer 3 (In2.Cu): Phase C spiral coils (clockwise)
Layer 4 (B.Cu):   Ground plane + thermal dissipation
```

### Integrated Sensors

Each stator includes footprints for:

- **3× Hall Sensors** (rotor position, 120° spacing)
- **1× NTC Thermistor** (stator temperature monitoring)
- **Phase Leads** (U, V, W connections)

## 🛠️ Creating Custom PCB Designs

### Step 1: Create a New Python Model

Create a new file in `crates/pcb/models/`:

```python
#!/usr/bin/env python3
"""My custom PCB design."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from stators.pcb_stator_base import StatorParams, StatorGenerator

def create_my_params() -> StatorParams:
    return StatorParams(
        name="my_custom_stator",
        outer_diameter=70.0,
        inner_diameter=12.0,
        num_slots=12,
        num_poles=14,
        num_layers=4,
        trace_width=0.25,
        trace_spacing=0.25,
        copper_weight_oz=4.0,
        turns_per_coil=8,
        coil_inner_radius=10.0,
        coil_outer_radius=30.0,
        hall_sensor_radius=18.0,
        num_hall_sensors=3,
        ntc_position=(0.0, -20.0),
        pcb_thickness=1.6,
        min_via_size=0.3,
    )

def main():
    params = create_my_params()
    generator = StatorGenerator(params)
    output_path = generator.generate()
    print(f"Generated: {output_path}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

### Step 2: Generate

```bash
cargo run --bin generate-pcb
```

Your custom PCB will be generated automatically!

## 🔧 Python API Reference

### `StatorParams`

Configuration dataclass for PCB stator designs.

**Key Parameters:**
- `outer_diameter`, `inner_diameter`: Physical board dimensions (mm)
- `num_slots`, `num_poles`: Motor electrical configuration
- `num_layers`: PCB layer count (2, 4, 6, etc.)
- `trace_width`, `trace_spacing`: Copper trace geometry (mm)
- `copper_weight_oz`: Copper thickness (oz/ft²)
- `turns_per_coil`: Spiral turns per coil
- `coil_inner_radius`, `coil_outer_radius`: Winding area (mm)

### `StatorGenerator`

Main generator class for creating PCB files.

**Methods:**
- `generate_spiral_coil()`: Create spiral coil trace points
- `add_track_segments()`: Add copper traces to PCB
- `add_via()`: Add via at position
- `generate_phase_winding()`: Generate complete phase winding
- `add_hall_sensors()`: Place Hall sensor footprints
- `add_temperature_sensor()`: Place NTC footprint
- `generate()`: Generate complete PCB design
- `write_kicad_pcb()`: Write KiCad file (S-expression format)

## 📊 Output Format

Generated files use **KiCad 7.0 S-expression format** (`.kicad_pcb`):

```scheme
(kicad_pcb (version 20221018) (generator pcbnew)
  (general
    (thickness 1.6))
  (layers
    (0 "F.Cu" signal)
    (1 "In1.Cu" signal)
    (2 "In2.Cu" signal)
    (31 "B.Cu" signal)
    ...)
  (segment (start x1 y1) (end x2 y2) (width 0.25) (layer "F.Cu") (net 0))
  (via (at x y) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 0))
  ...)
```

Files are **directly editable** in KiCad PCB Editor.

## 🔍 Comparison with Other Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **Manual KiCad** | Full control, visual feedback | Time-consuming, error-prone for spirals |
| **KiCad Python API (pcbnew)** | Native integration, powerful | Requires KiCad installation, API complexity |
| **Direct S-expression (this crate)** | ✅ No KiCad dependency<br>✅ Fast generation<br>✅ Version control friendly | Limited to basic features initially |
| **Commercial tools** | Advanced features, simulation | Expensive, proprietary formats |

This crate uses **direct S-expression generation** for simplicity and to avoid Python dependency issues with KiCad's `pcbnew` module.

## 🎓 Learning Resources

### KiCad File Format
- [KiCad S-expression Documentation](https://dev-docs.kicad.org/en/file-formats/)
- [KiCad PCB File Format](https://dev-docs.kicad.org/en/file-formats/sexpr-pcb/)

### PCB Stator Design
- [PCB Motor Stators: A Practical Guide](https://www.pcbway.com/blog/PCB_Design_Tutorial/PCB_Motor_Stators.html)
- [Axial Flux Motor Design](https://www.researchgate.net/publication/PCB_stator_BLDC)

### RANA Actuators
- See `notes/rana.md` for detailed specifications
- See `notes/axial_flux_double_rotor.md` for motor theory

## 🚧 Roadmap

- [ ] Add schematic generation (`.kicad_sch` files)
- [ ] Support for delta winding configuration
- [ ] Automated trace width calculation for current rating
- [ ] Thermal simulation export
- [ ] Gerber file generation
- [ ] BOM generation with part numbers
- [ ] 3D model integration (link to CAD crate)
- [ ] Interactive parameter tuning UI

## 🤝 Contributing

Follow the same patterns as the `cad` crate:

1. Models in `models/` subdirectories
2. Skip files starting with `__`, `base.`, or `common_`
3. Use `StatorParams` dataclass for configuration
4. Inherit from `StatorGenerator` for reusable functionality
5. Output to path specified by `KICAD_PCB_OUTPUT_PATH` env var

## 📝 Notes

- **No pcbnew dependency**: This crate generates KiCad files directly without requiring KiCad's Python API, making it more portable
- **Manufacturing ready**: Generated designs can be sent directly to PCB fabs (after review in KiCad)
- **Iterative design**: Modify parameters, regenerate, and compare in version control
- **Integration**: PCB stators are designed to fit into 3D-printed actuator housings from the `cad` crate

## 📄 License

Same as the parent Pond project. See `LICENSE.md` at workspace root.

