#!/usr/bin/env python3
"""
RANA-M Integrated Controller + PCB Stator Generator

Generates a complete motor controller board with integrated PCB stator.

Features:
- PCB stator with spiral coils (80mm diameter)
- STM32G4 microcontroller with FOC firmware
- 48V 3-phase MOSFET bridge (10A peak)
- Isolated CAN FD communication
- Current sensing on all 3 phases
- Hall sensors + NTC temperature
- SPI encoder interface
- Integrated power supply (48V → 5V → 3.3V)
- All connectors and mounting hardware

This is a complete "drop-in" actuator controller that mounts directly
to the RANA-M actuator housing.
"""

import sys
import os

# Import from the models package
from models.stators.pcb_stator_base import StatorParams
from models.stators.integrated_controller import ControllerParams, IntegratedStatorController
from models.stators.integrated_schematic import IntegratedControllerSchematic


def create_rana_m_stator_params() -> StatorParams:
    """Create stator parameters for RANA-M."""
    return StatorParams(
        name="rana_m_integrated",

        # Physical dimensions
        outer_diameter=80.0,      # 80mm OD per spec
        inner_diameter=15.0,      # 15mm center bore per spec

        # Electrical configuration
        num_slots=12,             # 12 stator slots
        num_poles=14,             # 14-pole rotor

        # PCB stackup
        num_layers=4,             # 4-layer board
        pcb_thickness=1.6,        # Standard FR-4

        # Copper traces (motor windings)
        trace_width=0.25,         # 0.25mm per spec
        trace_spacing=0.25,       # 0.25mm per spec
        copper_weight_oz=5.0,     # 5 oz copper for RANA-M

        # Phase winding geometry
        turns_per_coil=10,        # 10 turns per coil
        coil_inner_radius=11.0,   # Start just outside center bore (mm)
        coil_outer_radius=32.0,   # End at ~32mm radius (leave room for electronics)

        # Sensor positions (integrated into board)
        hall_sensor_radius=20.0,  # Hall sensors at 20mm radius
        num_hall_sensors=3,       # 3 Hall sensors for commutation
        ntc_position=(0.0, -24.0), # NTC at bottom, 24mm from center

        # Manufacturing
        min_via_size=0.3,         # 0.3mm minimum via drill
    )


def create_rana_m_controller_params() -> ControllerParams:
    """Create controller parameters for RANA-M integrated board."""
    return ControllerParams(
        # Power specifications (from rana.md)
        bus_voltage_max=48.0,     # 48V maximum (24-48V range)
        phase_current_max=10.0,   # 10A peak per spec

        # MCU selection
        mcu_package="LQFP-48",
        mcu_position=(0.0, 35.0),  # Place MCU outside stator, near top

        # Power stage
        mosfet_package="TO-252",   # DPAK package (D2PAK for higher current)
        gate_driver="DRV8353",     # TI integrated 3-phase gate driver

        # CAN interface (from rana.md: CAN daisy-chain)
        can_transceiver="TCAN1044",  # TI isolated CAN FD transceiver
        can_isolated=True,            # Use isolation for noise immunity
        can_connector_type="JST_PH_4",
        can_position=(-35.0, 10.0),   # Left side connector

        # Current sensing
        current_sense_resistor=2.0,   # 2mΩ shunt (500A/V with 50x gain)
        current_sense_amp="INA240",   # TI bidirectional current amp

        # Encoder interface (from rana.md: magnetic absolute encoder)
        encoder_type="SPI",           # AS5048A, AS5147 use SPI
        encoder_connector="JST_SH_6", # 6-pin SH connector (compact)

        # Power connectors
        power_connector_type="Terminal_Block_5mm",
        power_position=(35.0, 10.0),  # Right side connector

        # Mounting holes (4 holes around perimeter)
        mounting_hole_diameter=3.2,   # M3 clearance
        mounting_hole_positions=[
            (35.0, 35.0),    # Top-right
            (-35.0, 35.0),   # Top-left
            (-35.0, -35.0),  # Bottom-left
            (35.0, -35.0),   # Bottom-right
        ],

        # Thermal management
        thermal_vias_per_mosfet=6,   # 6 thermal vias under each MOSFET
        thermal_via_size=0.5,        # 0.5mm via diameter
    )


def main():
    """Generate RANA-M integrated controller + stator board."""
    print("=" * 70)
    print("RANA-M Integrated Controller + PCB Stator Generator")
    print("=" * 70)

    # Create parameters
    stator_params = create_rana_m_stator_params()
    controller_params = create_rana_m_controller_params()

    print(f"\nBoard Configuration:")
    print(f"  Name: {stator_params.name}")
    print(f"  Outer Diameter: {stator_params.outer_diameter}mm")
    print(f"  Bus Voltage: {controller_params.bus_voltage_max}V")
    print(f"  Phase Current: {controller_params.phase_current_max}A peak")
    print(f"  Communication: CAN FD (isolated)")
    print(f"  MCU: STM32G4 ({controller_params.mcu_package})")
    print(f"  Gate Driver: {controller_params.gate_driver}")
    print(f"  Encoder: {controller_params.encoder_type}")

    print(f"\nStator Configuration:")
    print(f"  Slots: {stator_params.num_slots}")
    print(f"  Poles: {stator_params.num_poles}")
    print(f"  Layers: {stator_params.num_layers}")
    print(f"  Copper Weight: {stator_params.copper_weight_oz} oz")
    print(f"  Turns per Coil: {stator_params.turns_per_coil}")

    # Create generator
    generator = IntegratedStatorController(stator_params, controller_params)

    # Generate complete board
    print("\nGenerating complete integrated board...")
    pcb_output_path = generator.generate_integrated_board()

    print(f"\n✓ Integrated PCB generated: {pcb_output_path}")
    print(f"  Motor coil tracks: {len(generator.tracks)}")
    print(f"  Vias: {len(generator.vias)}")
    print(f"  Components: {len(generator.footprints)}")
    print(f"  Pads: {len(generator.pads)}")
    print(f"  Zones: {len(generator.zones)}")

    # Generate schematic
    print("\nGenerating hierarchical schematic...")
    schematic_generator = IntegratedControllerSchematic(
        controller_name=stator_params.name,
        bus_voltage=controller_params.bus_voltage_max,
        phase_current=controller_params.phase_current_max
    )

    # Get output directory from PCB path
    import os
    output_dir = os.path.dirname(pcb_output_path)
    sch_output_path = schematic_generator.generate_all(output_dir)

    print(f"\n✓ Hierarchical schematic generated: {sch_output_path}")

    print("\n" + "=" * 70)
    print("Generation complete!")
    print("")
    print("Generated Files:")
    print(f"  • PCB Layout: {os.path.basename(pcb_output_path)}")
    print(f"  • Schematic: {os.path.basename(sch_output_path)}")
    print(f"  • + 5 hierarchical sheets (power, mcu, motor, can, sensors)")
    print("")
    print("PCB includes:")
    print("  ✓ PCB stator with spiral motor coils")
    print("  ✓ STM32G4 microcontroller")
    print("  ✓ 3-phase MOSFET bridge (48V, 10A)")
    print("  ✓ Integrated gate driver")
    print("  ✓ Current sensing (3 phases)")
    print("  ✓ CAN FD transceiver (isolated)")
    print("  ✓ Power supply (48V → 5V → 3.3V)")
    print("  ✓ Hall sensors + NTC temperature")
    print("  ✓ SPI encoder interface")
    print("  ✓ Power, CAN, and encoder connectors")
    print("  ✓ 4× mounting holes (M3)")
    print("  ✓ Ground plane on bottom layer")
    print("")
    print("Schematic includes:")
    print("  ✓ Hierarchical design (6 sheets)")
    print("  ✓ All component symbols with values")
    print("  ✓ Net labels matching PCB layout")
    print("  ✓ Power supply architecture")
    print("  ✓ Motor drive topology")
    print("  ✓ CAN communication")
    print("  ✓ Sensor interfaces")
    print("")
    print("Next steps in KiCad:")
    print("  1. Open schematic (.kicad_sch)")
    print("  2. Review/adjust hierarchical sheets")
    print("  3. Import netlist to PCB (Tools → Update PCB from Schematic)")
    print("  4. Route traces using airwires as guide")
    print("  5. Add copper pours for power planes")
    print("  6. Run ERC (schematic) and DRC (PCB)")
    print("  7. Generate Gerbers for manufacturing")
    print("=" * 70)

    return 0


if __name__ == "__main__":
    sys.exit(main())

