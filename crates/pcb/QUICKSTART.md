# PCB Generation Quick Start

Get started with PCB stator generation in 5 minutes.

## 🚀 Generate Your First PCB

From the workspace root:

```bash
# Generate all PCB stator designs
cargo run --bin generate-pcb
```

Output location: `target/pcb/*.kicad_pcb`

## 📂 What Gets Generated

```
target/pcb/
├── stators_rana_s.kicad_pcb    # 60mm, 6-8 Nm, for wrists/grippers
├── stators_rana_m.kicad_pcb    # 80mm, 15-25 Nm, for elbows/shoulders
└── stators_rana_l.kicad_pcb    # 100mm, 30-50 Nm, for limbs/bases
```

## 🔍 View in KiCad

1. Install KiCad 7+ (if not already installed)
2. Open KiCad PCB Editor
3. File → Open → Select `target/pcb/stators_rana_s.kicad_pcb`
4. View the spiral coil patterns, sensor placements, and board outline

## ✏️ Modify a Design

Edit `crates/pcb/models/stators/rana_s.py`:

```python
# Change the number of turns per coil
turns_per_coil=12,  # Was 8, now 12 for more inductance
```

Regenerate:

```bash
cargo run --bin generate-pcb
```

## 🎨 Create a Custom Stator

1. Copy an existing model:
```bash
cp crates/pcb/models/stators/rana_s.py crates/pcb/models/stators/my_stator.py
```

2. Edit parameters in `my_stator.py`

3. Regenerate:
```bash
cargo run --bin generate-pcb
```

4. Find your design in `target/pcb/stators_my_stator.kicad_pcb`

## 🔧 Key Parameters to Adjust

| Parameter | What It Does | Typical Range |
|-----------|--------------|---------------|
| `outer_diameter` | PCB size | 40-150mm |
| `turns_per_coil` | Winding density | 6-15 turns |
| `trace_width` | Copper width | 0.2-0.5mm |
| `copper_weight_oz` | Copper thickness | 2-6 oz |
| `num_slots` | Stator teeth | 6, 9, 12, 15 |
| `num_poles` | Rotor magnets | 8, 10, 14, 16 |

## 📖 Next Steps

- Read the full README: `crates/pcb/README.md`
- Study the base generator: `crates/pcb/models/stators/pcb_stator_base.py`
- Review RANA specs: `notes/rana.md`
- Open generated files in KiCad to refine and add connectors

## 💡 Pro Tips

1. **Version control your parameters**: Commit changes to Python files to track design iterations
2. **Compare in KiCad**: Use KiCad's diff tools to compare different parameter sets
3. **Test coil resistance**: Calculate expected resistance based on trace length and copper weight
4. **Thermal analysis**: Use copper weight calculator to ensure adequate current handling
5. **Manufacturing review**: Check design rules (trace/space, via size) against your PCB fab capabilities

## 🐛 Troubleshooting

**Problem**: `KICAD_PCB_OUTPUT_PATH environment variable not set`
- **Solution**: This is set automatically by `generate-pcb`. Don't run Python scripts directly.

**Problem**: Output file not created
- **Solution**: Check console for Python errors. Ensure all parameters are valid.

**Problem**: KiCad can't open the file
- **Solution**: Ensure you have KiCad 7+. Older versions may not support the file format.

**Problem**: Spiral coils look wrong
- **Solution**: Adjust `coil_inner_radius`, `coil_outer_radius`, and `turns_per_coil`.

## 📞 Get Help

- Check the main README: `crates/pcb/README.md`
- Review example models in `crates/pcb/models/stators/`
- See RANA specifications: `notes/rana.md`

