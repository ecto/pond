# PCB Generation Cheat Sheet

Quick reference for the PCB generation system.

## 🚀 Common Commands

```bash
# Generate all PCB designs
cargo run --bin generate-pcb

# Generate in release mode (faster)
cargo run --release --bin generate-pcb

# Check crate compiles
cargo check --package pcb

# Build binary
cargo build --package pcb

# View generated files
ls -lh target/pcb/
```

## 📂 File Locations

| Path | Description |
|------|-------------|
| `crates/pcb/models/stators/` | PCB model definitions (Python) |
| `target/pcb/` | Generated KiCad files |
| `.venv/` | Python virtual environment (auto-created) |

## 🎨 Customize a Design

1. **Copy a model**:
   ```bash
   cd crates/pcb/models/stators
   cp rana_s.py my_custom.py
   ```

2. **Edit parameters** in `my_custom.py`:
   ```python
   StatorParams(
       name="my_custom",
       outer_diameter=70.0,    # Change this
       turns_per_coil=10,      # Change this
       # ... other params
   )
   ```

3. **Regenerate**:
   ```bash
   cargo run --bin generate-pcb
   ```

4. **Find output**: `target/pcb/stators_my_custom.kicad_pcb`

## 🔧 Key Parameters

### Physical
- `outer_diameter`: PCB diameter (mm)
- `inner_diameter`: Center bore (mm)
- `pcb_thickness`: Board thickness (mm, typically 1.6)

### Electrical
- `num_slots`: Stator teeth (6, 9, 12, 15)
- `num_poles`: Rotor magnets (8, 10, 14, 16)
- `trace_width`: Copper width (mm, typically 0.25)
- `trace_spacing`: Spacing (mm, typically 0.25)
- `copper_weight_oz`: Copper thickness (oz, 2-6)

### Winding
- `turns_per_coil`: Spiral turns (6-15)
- `coil_inner_radius`: Start radius (mm)
- `coil_outer_radius`: End radius (mm)

### Sensors
- `hall_sensor_radius`: Hall array radius (mm)
- `num_hall_sensors`: Typically 3
- `ntc_position`: (x, y) coordinates (mm)

## 📐 RANA Models Quick Reference

```python
# RANA-S (Small - 60mm)
outer_diameter=60.0
inner_diameter=10.0
turns_per_coil=8
copper_weight_oz=4.0

# RANA-M (Medium - 80mm)
outer_diameter=80.0
inner_diameter=15.0
turns_per_coil=10
copper_weight_oz=5.0

# RANA-L (Large - 100mm)
outer_diameter=100.0
inner_diameter=20.0
turns_per_coil=12
copper_weight_oz=6.0
```

## 🔍 View/Edit Generated PCBs

```bash
# Open in KiCad PCB Editor
kicad-cli pcb open target/pcb/stators_rana_s.kicad_pcb

# Or use GUI: File → Open → target/pcb/stators_rana_s.kicad_pcb
```

## 🐍 Python API Quick Reference

### Create Generator
```python
from stators.pcb_stator_base import StatorParams, StatorGenerator

params = StatorParams(...)
generator = StatorGenerator(params)
output = generator.generate()
```

### Custom Generation
```python
# Generate custom spiral
points = generator.generate_spiral_coil(
    phase=0,
    layer="F.Cu",
    start_angle=0.0,
    clockwise=True
)

# Add tracks
generator.add_track_segments(points, "F.Cu", 0.25)

# Add via
generator.add_via(x=10.0, y=10.0, size=0.6, drill=0.3)

# Write file
generator.write_kicad_pcb("output.kicad_pcb")
```

## 🧮 Calculations

### Current Capacity (1 oz copper)
- 0.25mm trace ≈ 0.5A continuous
- 0.5mm trace ≈ 1.0A continuous
- Double for 2 oz, triple for 3 oz, etc.

### Resistance (approximate)
```
R = ρ × L / A
ρ (copper) ≈ 1.7e-8 Ω·m
L = trace length (m)
A = cross-sectional area (m²)
```

### Inductance (rough estimate)
- 50-200 µH per phase for typical stators
- Depends on turns, radius, spacing

## 🛠️ Troubleshooting

### Problem: "No Python model scripts found"
**Solution**: Ensure your `.py` files are in `crates/pcb/models/` and don't start with `__` or `base`

### Problem: "KICAD_PCB_OUTPUT_PATH not set"
**Solution**: Don't run Python scripts directly. Use `cargo run --bin generate-pcb`

### Problem: KiCad won't open file
**Solution**: Ensure KiCad 7+. Older versions don't support the file format.

### Problem: Spiral looks wrong
**Solution**: Check `coil_inner_radius < coil_outer_radius` and adjust `turns_per_coil`

## 📊 File Format Basics

KiCad uses S-expressions (Lisp-like syntax):

```scheme
(segment
  (start 10.0 20.0)
  (end 15.0 25.0)
  (width 0.25)
  (layer "F.Cu")
  (net 0))
```

- `segment`: Copper trace
- `via`: Through-hole connection
- `gr_circle`: Graphical circle (board outline)
- `footprint`: Component footprint

## 🎯 Workflow

1. **Design** → Edit Python parameters
2. **Generate** → `cargo run --bin generate-pcb`
3. **Review** → Open in KiCad
4. **Refine** → Adjust in KiCad or Python
5. **Export** → Generate Gerbers
6. **Order** → Send to PCB fab

## 📚 Resources

- Full docs: `crates/pcb/README.md`
- Quick start: `crates/pcb/QUICKSTART.md`
- RANA specs: `notes/rana.md`
- Python code: `crates/pcb/models/stators/pcb_stator_base.py`

## 💡 Tips

- Start with existing models, modify incrementally
- Use version control to track parameter changes
- Test with CAD models to ensure mechanical fit
- Review trace clearances in KiCad
- Calculate expected resistance/inductance
- Consider thermal management (copper weight)

---

**Most Common Task**: Generate RANA stators

```bash
cargo run --bin generate-pcb
```

**Second Most Common**: Create custom variant

```bash
cp crates/pcb/models/stators/rana_m.py crates/pcb/models/stators/my_variant.py
# Edit my_variant.py
cargo run --bin generate-pcb
```

