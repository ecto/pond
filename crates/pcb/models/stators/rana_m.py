#!/usr/bin/env python3
"""
RANA-M PCB Stator Generator

Generates KiCad PCB files for the RANA-M medium actuator stator.

Specifications (from rana.md):
- Outer Diameter: 80mm
- Center Bore: 15mm ID
- Voltage: 24V
- Peak Current: ~10A
- Slot Count: 12 stator slots
- Rotor Poles: 14 poles
- Layer Count: 4 layers
- Trace Geometry: 0.25mm width / 0.25mm spacing (1 oz Cu minimum)
- Copper Weight: 5 oz for higher power handling

Output Torque:
- Continuous: 15-25 Nm
- Peak: 50-60 Nm

Applications:
- Elbows, shoulders, light-duty joints
"""

import sys
import os

# Import from the stators package
# The PYTHONPATH is set to crates/pcb by the Rust CLI
from models.stators.pcb_stator_base import StatorParams, StatorGenerator


def create_rana_m_params() -> StatorParams:
    """Create parameters for RANA-M stator."""
    return StatorParams(
        name="rana_m",

        # Physical dimensions
        outer_diameter=80.0,      # 80mm OD per spec
        inner_diameter=15.0,      # 15mm center bore per spec

        # Electrical configuration
        num_slots=12,             # 12 stator slots per spec
        num_poles=14,             # 14-pole rotor per spec

        # PCB stackup
        num_layers=4,             # 4-layer board
        pcb_thickness=1.6,        # Standard FR-4 thickness (mm)

        # Copper traces
        trace_width=0.25,         # 0.25mm per spec
        trace_spacing=0.25,       # 0.25mm per spec
        copper_weight_oz=5.0,     # 5 oz copper for RANA-M (higher current)

        # Phase winding geometry
        turns_per_coil=10,        # 10 turns per coil for more inductance
        coil_inner_radius=11.0,   # Start just outside center bore (mm)
        coil_outer_radius=36.0,   # End near outer edge, leaving room for routing (mm)

        # Sensor positions
        hall_sensor_radius=20.0,  # Position Hall sensors at 20mm radius
        num_hall_sensors=3,       # 3 Hall sensors for BLDC commutation
        ntc_position=(0.0, -24.0), # NTC at bottom, 24mm from center

        # Manufacturing
        min_via_size=0.3,         # 0.3mm minimum via drill
    )


def main():
    """Generate RANA-M stator PCB."""
    print("=" * 60)
    print("RANA-M PCB Stator Generator")
    print("=" * 60)

    # Create parameters
    params = create_rana_m_params()

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

