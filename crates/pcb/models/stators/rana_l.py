#!/usr/bin/env python3
"""
RANA-L PCB Stator Generator

Generates KiCad PCB files for the RANA-L large actuator stator.

Specifications (from rana.md):
- Outer Diameter: 100mm
- Center Bore: 20mm ID
- Voltage: 24-48V
- Peak Current: ~20A
- Slot Count: 12 stator slots
- Rotor Poles: 14 poles
- Layer Count: 4 layers
- Trace Geometry: 0.25mm width / 0.25mm spacing (1 oz Cu minimum)
- Copper Weight: 6 oz for high power handling

Output Torque:
- Continuous: 30-50 Nm
- Peak: 90-120 Nm

Applications:
- Load-bearing limbs, spines, mobile bases
"""

import sys
import os

# Import from the stators package
# The PYTHONPATH is set to crates/pcb by the Rust CLI
from models.stators.pcb_stator_base import StatorParams, StatorGenerator


def create_rana_l_params() -> StatorParams:
    """Create parameters for RANA-L stator."""
    return StatorParams(
        name="rana_l",

        # Physical dimensions
        outer_diameter=100.0,     # 100mm OD per spec
        inner_diameter=20.0,      # 20mm center bore per spec

        # Electrical configuration
        num_slots=12,             # 12 stator slots per spec
        num_poles=14,             # 14-pole rotor per spec

        # PCB stackup
        num_layers=4,             # 4-layer board
        pcb_thickness=1.6,        # Standard FR-4 thickness (mm)

        # Copper traces
        trace_width=0.25,         # 0.25mm per spec
        trace_spacing=0.25,       # 0.25mm per spec
        copper_weight_oz=6.0,     # 6 oz copper for RANA-L (highest current)

        # Phase winding geometry
        turns_per_coil=12,        # 12 turns per coil for maximum torque
        coil_inner_radius=14.0,   # Start just outside center bore (mm)
        coil_outer_radius=46.0,   # End near outer edge, leaving room for routing (mm)

        # Sensor positions
        hall_sensor_radius=25.0,  # Position Hall sensors at 25mm radius
        num_hall_sensors=3,       # 3 Hall sensors for BLDC commutation
        ntc_position=(0.0, -30.0), # NTC at bottom, 30mm from center

        # Manufacturing
        min_via_size=0.3,         # 0.3mm minimum via drill
    )


def main():
    """Generate RANA-L stator PCB."""
    print("=" * 60)
    print("RANA-L PCB Stator Generator")
    print("=" * 60)

    # Create parameters
    params = create_rana_l_params()

    print(f"\nGenerating PCB stator with parameters:")
    print(f"  Name: {params.name}")
    print(f"  Outer Diameter: {params.outer_diameter}mm")
    print(f"  Inner Diameter: {params.inner_diameter}mm")
    print(f"  Slots: {params.num_slots}")
    print(f"  Poles: {params.num_poles}")
    print(f"  Layers: {params.num_layers}")
    print(f"  Trace Width: {params.trace_width}mm")
    print(f"  Trace Spacing: {params.trace_spacing}mm")
    print(f"  Copper Weight: {params.copper_weight_oz} oz")
    print(f"  Turns per Coil: {params.turns_per_coil}")

    # Create generator
    generator = StatorGenerator(params)

    # Generate PCB
    print("\nGenerating spiral coil patterns...")
    output_path = generator.generate()

    print(f"\n✓ PCB file generated: {output_path}")
    print(f"  Tracks: {len(generator.tracks)}")
    print(f"  Vias: {len(generator.vias)}")
    print(f"  Footprints: {len(generator.footprints)}")

    print("\n" + "=" * 60)
    print("Generation complete!")
    print("Open the file in KiCad to view and edit the design.")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())

