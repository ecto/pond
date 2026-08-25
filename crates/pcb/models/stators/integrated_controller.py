"""
Integrated motor controller for PCB stators.

This module extends the base PCB stator generator to include an integrated
motor controller with FOC drive, CAN communication, and all supporting circuitry.

Architecture:
- PCB Stator (spiral coils on inner area)
- 3-phase MOSFET bridge (48V capable)
- STM32G4 MCU with FOC firmware
- Isolated CAN FD transceiver
- Current sense amplifiers (INA240)
- Gate drivers (DRV8353 or similar)
- Power supply (48V → 5V → 3.3V)
- Sensor interfaces (Hall, encoder, temperature)
"""

import os
import math
from dataclasses import dataclass
from typing import List, Tuple, Optional
from models.stators.pcb_stator_base import StatorParams, StatorGenerator


@dataclass
class ControllerParams:
    """Parameters for integrated motor controller."""

    # Power specifications
    bus_voltage_max: float        # Maximum bus voltage (V), e.g., 48V
    phase_current_max: float      # Maximum phase current (A), e.g., 20A

    # MCU selection
    mcu_package: str             # e.g., "LQFP-64", "LQFP-100"
    mcu_position: Tuple[float, float]  # (x, y) position on board (mm)

    # Power stage
    mosfet_package: str          # e.g., "DPAK", "D2PAK", "PowerPAK"
    gate_driver: str             # e.g., "DRV8353", "DRV8323"

    # CAN interface
    can_transceiver: str         # e.g., "TCAN1044", "SN65HVD230"
    can_isolated: bool           # Use isolated CAN transceiver
    can_connector_type: str      # e.g., "JST-PH-4", "Terminal_Block"
    can_position: Tuple[float, float]  # Connector position (mm)

    # Current sensing
    current_sense_resistor: float  # Shunt resistance (mΩ)
    current_sense_amp: str         # e.g., "INA240", "INA181"

    # Encoder interface
    encoder_type: str            # e.g., "ABI", "SPI", "BiSS-C"
    encoder_connector: str       # e.g., "JST-SH-6", "Molex_PicoBlade_6"

    # Power connectors
    power_connector_type: str    # e.g., "XT60", "Terminal_Block_5mm"
    power_position: Tuple[float, float]  # Power connector position (mm)

    # Mounting
    mounting_hole_diameter: float  # Mounting hole size (mm)
    mounting_hole_positions: List[Tuple[float, float]]  # Hole positions (mm)

    # Thermal
    thermal_vias_per_mosfet: int  # Number of thermal vias under each MOSFET
    thermal_via_size: float       # Thermal via diameter (mm)


class IntegratedStatorController(StatorGenerator):
    """Generate integrated motor controller + PCB stator board.

    This extends the basic StatorGenerator to add:
    - 3-phase MOSFET power stage
    - MCU and supporting circuitry
    - CAN communication
    - Current sensing
    - Power conditioning
    - All connectors and mounting hardware
    """

    def __init__(self, stator_params: StatorParams, controller_params: ControllerParams):
        super().__init__(stator_params)
        self.ctrl = controller_params
        self.pads = []  # Component pads
        self.zones = []  # Copper pours/fills

    def add_component_footprint(
        self,
        reference: str,
        value: str,
        footprint: str,
        position: Tuple[float, float],
        rotation: float = 0.0,
        layer: str = "F.Cu"
    ):
        """Add a component footprint to the board.

        Args:
            reference: Component reference (e.g., "U1", "R1")
            value: Component value (e.g., "STM32G473", "10k")
            footprint: Footprint library reference
            position: (x, y) coordinates (mm)
            rotation: Rotation angle (degrees)
            layer: Component layer
        """
        self.footprints.append({
            'type': 'component',
            'reference': reference,
            'value': value,
            'footprint': footprint,
            'position': position,
            'rotation': rotation,
            'layer': layer
        })

    def add_mounting_hole(self, position: Tuple[float, float], diameter: float):
        """Add a mounting hole at the specified position."""
        self.footprints.append({
            'type': 'mounting_hole',
            'position': position,
            'diameter': diameter
        })

    def add_phase_terminal(self, phase: str, position: Tuple[float, float], pad_size: float = 3.0):
        """Add a large terminal pad for phase connection (U, V, W)."""
        self.pads.append({
            'type': 'phase_terminal',
            'phase': phase,
            'position': position,
            'size': pad_size,
            'layer': 'F.Cu'
        })

    def add_power_supply_section(self):
        """Add power supply components (48V → 5V → 3.3V)."""
        # Buck converter (48V → 5V)
        self.add_component_footprint(
            'U2', 'TPS54560',
            'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
            (-15.0, 0.0), 0.0
        )

        # LDO (5V → 3.3V)
        self.add_component_footprint(
            'U3', 'AMS1117-3.3',
            'Package_TO_SOT_SMD:SOT-223-3_TabPin2',
            (-15.0, -5.0), 0.0
        )

        # Input capacitors (48V)
        for i, offset in enumerate([(-18, 3), (-18, -3)]):
            self.add_component_footprint(
                f'C{i+1}', '100uF',
                'Capacitor_SMD:C_1210_3225Metric',
                offset, 0.0
            )

    def add_mosfet_bridge(self):
        """Add 3-phase MOSFET half-bridge topology."""
        # Position MOSFETs around the stator perimeter
        # 6 MOSFETs total (2 per phase: high-side + low-side)

        mosfet_radius = self.params.outer_diameter / 2 + 8.0  # Just outside stator

        phases = ['U', 'V', 'W']
        for i, phase in enumerate(phases):
            angle_high = (i * 120 + 30) * math.pi / 180
            angle_low = (i * 120 + 60) * math.pi / 180

            # High-side MOSFET
            x_h = mosfet_radius * math.cos(angle_high)
            y_h = mosfet_radius * math.sin(angle_high)
            self.add_component_footprint(
                f'Q{i*2+1}', f'{phase}_HIGH',
                'Package_TO_SOT_SMD:TO-252-2',
                (x_h, y_h), math.degrees(angle_high) + 90
            )

            # Low-side MOSFET
            x_l = mosfet_radius * math.cos(angle_low)
            y_l = mosfet_radius * math.sin(angle_low)
            self.add_component_footprint(
                f'Q{i*2+2}', f'{phase}_LOW',
                'Package_TO_SOT_SMD:TO-252-2',
                (x_l, y_l), math.degrees(angle_low) + 90
            )

            # Add thermal vias under each MOSFET
            for via_idx in range(self.ctrl.thermal_vias_per_mosfet):
                via_offset_x = (via_idx - self.ctrl.thermal_vias_per_mosfet/2) * 2.0
                self.add_via(x_h + via_offset_x, y_h, 0.8, 0.4)
                self.add_via(x_l + via_offset_x, y_l, 0.8, 0.4)

    def add_gate_driver(self):
        """Add gate driver IC (e.g., DRV8353)."""
        self.add_component_footprint(
            'U4', self.ctrl.gate_driver,
            'Package_SO:VQFN-48-1EP_7x7mm_P0.5mm_EP5.15x5.15mm',
            (0.0, -10.0), 0.0
        )

    def add_mcu(self):
        """Add microcontroller (STM32G4)."""
        x, y = self.ctrl.mcu_position
        self.add_component_footprint(
            'U1', 'STM32G473CBT6',
            'Package_QFP:LQFP-48_7x7mm_P0.5mm',
            (x, y), 45.0  # 45° rotation for better routing
        )

        # MCU support components
        # Crystal
        self.add_component_footprint(
            'Y1', '8MHz',
            'Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm',
            (x + 5, y), 0.0
        )

        # Decoupling caps
        cap_positions = [(x-3, y-3), (x+3, y-3), (x-3, y+3), (x+3, y+3)]
        for i, pos in enumerate(cap_positions):
            self.add_component_footprint(
                f'C{10+i}', '100nF',
                'Capacitor_SMD:C_0603_1608Metric',
                pos, 0.0
            )

    def add_current_sensing(self):
        """Add current sense amplifiers and shunt resistors."""
        # One shunt per phase in low-side
        shunt_positions = [
            (-10.0, 8.0),   # Phase U
            (5.0, 10.0),    # Phase V
            (10.0, -5.0)    # Phase W
        ]

        for i, pos in enumerate(shunt_positions):
            phase = ['U', 'V', 'W'][i]

            # Shunt resistor (kelvin connection)
            self.add_component_footprint(
                f'R{i+1}', f'{self.ctrl.current_sense_resistor}mΩ',
                'Resistor_SMD:R_2512_6332Metric',
                pos, 0.0
            )

            # Current sense amplifier
            self.add_component_footprint(
                f'U{5+i}', self.ctrl.current_sense_amp,
                'Package_TO_SOT_SMD:SOT-23-5',
                (pos[0] + 3, pos[1]), 0.0
            )

    def add_can_interface(self):
        """Add CAN transceiver and connector."""
        x, y = self.ctrl.can_position

        # CAN transceiver
        transceiver_footprint = (
            'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm' if not self.ctrl.can_isolated
            else 'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm'
        )

        self.add_component_footprint(
            'U8', self.ctrl.can_transceiver,
            transceiver_footprint,
            (x, y), 0.0
        )

        # CAN connector (4-pin: CANH, CANL, GND, +5V)
        self.add_component_footprint(
            'J2', 'CAN',
            'Connector_JST:JST_PH_B4B-PH-K_1x04_P2.00mm_Vertical',
            (x, y - 5.0), 90.0
        )

        # CAN termination resistor (optional, jumper selectable)
        self.add_component_footprint(
            'R10', '120Ω',
            'Resistor_SMD:R_0805_2012Metric',
            (x + 3, y - 2.5), 0.0
        )

    def add_power_connectors(self):
        """Add power input connector (48V)."""
        x, y = self.ctrl.power_position

        # Main power connector (48V input)
        self.add_component_footprint(
            'J1', 'POWER_48V',
            'TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2_1x02_P5.00mm_Horizontal',
            (x, y), 90.0
        )

    def add_encoder_connector(self):
        """Add encoder connector (ABI quadrature or SPI)."""
        # Position on opposite side from power
        x = -self.ctrl.power_position[0]
        y = -self.ctrl.power_position[1]

        connector_pins = 6 if self.ctrl.encoder_type in ['ABI', 'SPI'] else 8

        self.add_component_footprint(
            'J3', 'ENCODER',
            f'Connector_JST:JST_SH_BM{connector_pins}B-SHRS-TF_1x0{connector_pins}_P1.00mm_Vertical',
            (x, y), 90.0
        )

    def add_phase_connections(self):
        """Add connections from MOSFET bridge to stator phases."""
        # Large terminal pads for phases U, V, W at stator perimeter
        phase_angles = [0, 120, 240]  # degrees
        terminal_radius = self.params.outer_diameter / 2 - 3.0

        for i, (phase, angle) in enumerate(zip(['U', 'V', 'W'], phase_angles)):
            angle_rad = angle * math.pi / 180
            x = terminal_radius * math.cos(angle_rad)
            y = terminal_radius * math.sin(angle_rad)

            self.add_phase_terminal(phase, (x, y), pad_size=4.0)

            # Add vias to connect layers
            # Connect top layer coils to phase terminal
            self.add_via(x * 0.9, y * 0.9, 1.0, 0.5)

    def add_mounting_holes_array(self):
        """Add mounting holes at specified positions."""
        for pos in self.ctrl.mounting_hole_positions:
            self.add_mounting_hole(pos, self.ctrl.mounting_hole_diameter)

    def add_ground_plane(self):
        """Add ground pour on bottom layer."""
        # Large ground zone on B.Cu
        radius = self.params.outer_diameter / 2
        self.zones.append({
            'layer': 'B.Cu',
            'net': 'GND',
            'shape': 'circle',
            'center': (0.0, 0.0),
            'radius': radius - 1.0  # Leave 1mm clearance from edge
        })

    def generate_integrated_board(self) -> str:
        """Generate complete integrated motor controller + stator board."""
        print("Generating integrated motor controller board...")

        # 1. Generate base stator coils
        print("  - Generating stator coils...")
        super().generate_phase_winding(0, "F.Cu", "F.Cu")     # Phase A
        super().generate_phase_winding(1, "In1.Cu", "In1.Cu") # Phase B
        super().generate_phase_winding(2, "In2.Cu", "In2.Cu") # Phase C

        # 2. Add phase connections
        print("  - Adding phase terminal connections...")
        self.add_phase_connections()

        # 3. Add power supply section
        print("  - Adding power supply circuitry...")
        self.add_power_supply_section()

        # 4. Add MCU
        print("  - Adding microcontroller...")
        self.add_mcu()

        # 5. Add MOSFETs and gate driver
        print("  - Adding 3-phase MOSFET bridge...")
        self.add_mosfet_bridge()
        self.add_gate_driver()

        # 6. Add current sensing
        print("  - Adding current sense amplifiers...")
        self.add_current_sensing()

        # 7. Add CAN interface
        print("  - Adding CAN transceiver...")
        self.add_can_interface()

        # 8. Add connectors
        print("  - Adding power and encoder connectors...")
        self.add_power_connectors()
        self.add_encoder_connector()

        # 9. Add sensors (Hall, temperature)
        print("  - Adding Hall sensors and NTC...")
        self.add_hall_sensors()
        self.add_temperature_sensor()

        # 10. Add mounting holes
        print("  - Adding mounting holes...")
        self.add_mounting_holes_array()

        # 11. Add ground plane
        print("  - Adding ground plane...")
        self.add_ground_plane()

        # 12. Write output file
        output_path = os.getenv("KICAD_PCB_OUTPUT_PATH")
        if not output_path:
            raise ValueError("KICAD_PCB_OUTPUT_PATH environment variable not set")

        self.write_kicad_pcb(output_path)

        return output_path

