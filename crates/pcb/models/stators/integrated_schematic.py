"""
Schematic generator for integrated RANA motor controller.

This module generates KiCad schematic files (.kicad_sch) for the integrated
motor controller + PCB stator boards.

Architecture:
- Hierarchical design with multiple sheets
- Power supply sheet (48V → 5V → 3.3V)
- MCU sheet (STM32G4 + peripherals)
- Motor drive sheet (MOSFETs + gate driver)
- CAN communication sheet
- Sensor interface sheet
- Root sheet (top-level connections)

Output:
- .kicad_sch files (S-expression format)
- Netlist matches PCB component positions
- Ready for import into KiCad PCB editor
"""

import os
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class SchematicSymbol:
    """Represents a component symbol in the schematic."""
    reference: str          # e.g., "U1"
    value: str             # e.g., "STM32G473CBT6"
    footprint: str         # e.g., "Package_QFP:LQFP-48_7x7mm_P0.5mm"
    library: str           # e.g., "MCU_ST_STM32G4"
    symbol_name: str       # e.g., "STM32G473CBTx"
    position: Tuple[float, float]  # (x, y) in schematic units
    unit: int = 1          # For multi-unit symbols
    properties: dict = None  # Additional properties


@dataclass
class SchematicWire:
    """Represents a wire connection in the schematic."""
    start: Tuple[float, float]
    end: Tuple[float, float]


@dataclass
class SchematicLabel:
    """Represents a net label in the schematic."""
    text: str
    position: Tuple[float, float]
    angle: float = 0.0


class KiCadSchematicGenerator:
    """Generate KiCad 7.0 schematic files in S-expression format."""

    def __init__(self, name: str):
        self.name = name
        self.symbols = []
        self.wires = []
        self.labels = []
        self.power_flags = []

    def add_symbol(
        self,
        reference: str,
        value: str,
        footprint: str,
        library: str,
        symbol_name: str,
        x: float,
        y: float,
        unit: int = 1,
        properties: dict = None
    ):
        """Add a component symbol to the schematic."""
        self.symbols.append(SchematicSymbol(
            reference=reference,
            value=value,
            footprint=footprint,
            library=library,
            symbol_name=symbol_name,
            position=(x, y),
            unit=unit,
            properties=properties or {}
        ))

    def add_wire(self, x1: float, y1: float, x2: float, y2: float):
        """Add a wire connection."""
        self.wires.append(SchematicWire((x1, y1), (x2, y2)))

    def add_label(self, text: str, x: float, y: float, angle: float = 0.0):
        """Add a net label."""
        self.labels.append(SchematicLabel(text, (x, y), angle))

    def add_power_flag(self, net: str, x: float, y: float):
        """Add a power flag for power/ground nets."""
        self.power_flags.append({
            'net': net,
            'position': (x, y)
        })

    def write_schematic(self, filepath: str):
        """Write complete schematic file in KiCad 7.0 S-expression format."""
        with open(filepath, 'w') as f:
            # Header
            f.write('(kicad_sch (version 20230121) (generator pcbnew)\n\n')

            # UUID
            f.write('  (uuid "00000000-0000-0000-0000-000000000000")\n\n')

            # Paper size
            f.write('  (paper "A4")\n\n')

            # Title block
            f.write('  (title_block\n')
            f.write(f'    (title "{self.name}")\n')
            f.write('    (rev "1.0")\n')
            f.write('    (company "Pond Robotics")\n')
            f.write('  )\n\n')

            # Library symbols (declarations)
            f.write('  (lib_symbols\n')

            # Write symbol declarations
            seen_symbols = set()
            for sym in self.symbols:
                lib_id = f"{sym.library}:{sym.symbol_name}"
                if lib_id not in seen_symbols:
                    seen_symbols.add(lib_id)
                    self._write_symbol_declaration(f, sym)

            f.write('  )\n\n')

            # Write symbol instances
            for sym in self.symbols:
                self._write_symbol_instance(f, sym)

            # Write wires
            for wire in self.wires:
                x1, y1 = wire.start
                x2, y2 = wire.end
                f.write(f'  (wire (pts (xy {x1} {y1}) (xy {x2} {y2}))\n')
                f.write('    (stroke (width 0) (type default))\n')
                f.write('    (uuid "00000000-0000-0000-0000-000000000000")\n')
                f.write('  )\n\n')

            # Write labels
            for label in self.labels:
                x, y = label.position
                f.write(f'  (label "{label.text}" (at {x} {y} {int(label.angle)})\n')
                f.write('    (effects (font (size 1.27 1.27)) (justify left bottom))\n')
                f.write('    (uuid "00000000-0000-0000-0000-000000000000")\n')
                f.write('  )\n\n')

            # Write power flags
            for flag in self.power_flags:
                x, y = flag['position']
                f.write(f'  (symbol (lib_id "power:PWR_FLAG") (at {x} {y} 0) (unit 1)\n')
                f.write('    (in_bom yes) (on_board yes)\n')
                f.write('    (uuid "00000000-0000-0000-0000-000000000000")\n')
                f.write('  )\n\n')

            # Close schematic
            f.write(')\n')

    def _write_symbol_declaration(self, f, sym: SchematicSymbol):
        """Write symbol library declaration."""
        lib_id = f"{sym.library}:{sym.symbol_name}"
        f.write(f'    (symbol "{lib_id}" (power)\n')
        f.write('      (pin_names (offset 0.254))\n')
        f.write('      (in_bom yes) (on_board yes)\n')
        f.write('      (property "Reference" "U"\n')
        f.write('        (at 0 0 0)\n')
        f.write('        (effects (font (size 1.27 1.27)))\n')
        f.write('      )\n')
        f.write('      (property "Value" "VALUE"\n')
        f.write('        (at 0 -2.54 0)\n')
        f.write('        (effects (font (size 1.27 1.27)))\n')
        f.write('      )\n')
        f.write('    )\n')

    def _write_symbol_instance(self, f, sym: SchematicSymbol):
        """Write symbol instance."""
        lib_id = f"{sym.library}:{sym.symbol_name}"
        x, y = sym.position

        f.write(f'  (symbol (lib_id "{lib_id}") (at {x} {y} 0) (unit {sym.unit})\n')
        f.write('    (in_bom yes) (on_board yes)\n')
        f.write('    (uuid "00000000-0000-0000-0000-000000000000")\n')

        # Properties
        f.write(f'    (property "Reference" "{sym.reference}"\n')
        f.write(f'      (at {x} {y+3} 0)\n')
        f.write('      (effects (font (size 1.27 1.27)))\n')
        f.write('    )\n')

        f.write(f'    (property "Value" "{sym.value}"\n')
        f.write(f'      (at {x} {y-3} 0)\n')
        f.write('      (effects (font (size 1.27 1.27)))\n')
        f.write('    )\n')

        f.write(f'    (property "Footprint" "{sym.footprint}"\n')
        f.write(f'      (at {x} {y-5} 0)\n')
        f.write('      (effects (font (size 1.27 1.27)) hide)\n')
        f.write('    )\n')

        f.write('  )\n\n')


class IntegratedControllerSchematic:
    """Generate complete hierarchical schematic for integrated controller."""

    def __init__(self, controller_name: str, bus_voltage: float, phase_current: float):
        self.name = controller_name
        self.bus_voltage = bus_voltage
        self.phase_current = phase_current

        # Create generators for each sheet
        self.root_sheet = KiCadSchematicGenerator(f"{controller_name} - Root")
        self.power_sheet = KiCadSchematicGenerator(f"{controller_name} - Power")
        self.mcu_sheet = KiCadSchematicGenerator(f"{controller_name} - MCU")
        self.motor_sheet = KiCadSchematicGenerator(f"{controller_name} - Motor Drive")
        self.can_sheet = KiCadSchematicGenerator(f"{controller_name} - CAN")
        self.sensor_sheet = KiCadSchematicGenerator(f"{controller_name} - Sensors")

    def generate_power_sheet(self):
        """Generate power supply schematic (48V → 5V → 3.3V)."""
        print("  - Generating power supply sheet...")

        # Input connector
        self.power_sheet.add_symbol(
            "J1", "POWER_48V",
            "TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2_1x02_P5.00mm_Horizontal",
            "Connector", "Conn_01x02",
            50, 50
        )

        # TVS protection
        self.power_sheet.add_symbol(
            "D1", "SMBJ58A",
            "Diode_SMD:D_SMB",
            "Device", "D_TVS",
            75, 50
        )

        # Buck converter (48V → 5V)
        self.power_sheet.add_symbol(
            "U2", "TPS54560",
            "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
            "Regulator_Switching", "TPS54560",
            125, 50
        )

        # Input caps
        self.power_sheet.add_symbol(
            "C1", "100uF",
            "Capacitor_SMD:C_1210_3225Metric",
            "Device", "C",
            100, 60
        )

        # LDO (5V → 3.3V)
        self.power_sheet.add_symbol(
            "U3", "AMS1117-3.3",
            "Package_TO_SOT_SMD:SOT-223-3_TabPin2",
            "Regulator_Linear", "AMS1117-3.3",
            175, 50
        )

        # Add power labels
        self.power_sheet.add_label("+48V", 60, 45)
        self.power_sheet.add_label("+5V", 150, 45)
        self.power_sheet.add_label("+3V3", 200, 45)
        self.power_sheet.add_label("GND", 60, 65)

        # Add power flags
        self.power_sheet.add_power_flag("+48V", 60, 40)
        self.power_sheet.add_power_flag("GND", 60, 70)

    def generate_mcu_sheet(self):
        """Generate MCU schematic (STM32G4 + support)."""
        print("  - Generating MCU sheet...")

        # STM32G4 MCU
        self.mcu_sheet.add_symbol(
            "U1", "STM32G473CBT6",
            "Package_QFP:LQFP-48_7x7mm_P0.5mm",
            "MCU_ST_STM32G4", "STM32G473CBTx",
            125, 100
        )

        # Crystal
        self.mcu_sheet.add_symbol(
            "Y1", "8MHz",
            "Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm",
            "Device", "Crystal_GND24",
            75, 100
        )

        # Decoupling caps (4x)
        for i in range(4):
            self.mcu_sheet.add_symbol(
                f"C{10+i}", "100nF",
                "Capacitor_SMD:C_0603_1608Metric",
                "Device", "C",
                175 + i*10, 80
            )

        # Add power labels
        self.mcu_sheet.add_label("+3V3", 175, 75)
        self.mcu_sheet.add_label("GND", 175, 105)

        # Add signal labels for connections
        signals = ["CAN_TX", "CAN_RX", "PWM_UH", "PWM_UL", "PWM_VH", "PWM_VL",
                   "PWM_WH", "PWM_WL", "ADC_IU", "ADC_IV", "ADC_IW"]
        for i, sig in enumerate(signals):
            self.mcu_sheet.add_label(sig, 160, 95 + i*2.54)

    def generate_motor_drive_sheet(self):
        """Generate motor drive schematic (MOSFETs + gate driver)."""
        print("  - Generating motor drive sheet...")

        # Gate driver
        self.motor_sheet.add_symbol(
            "U4", "DRV8353",
            "Package_SO:VQFN-48-1EP_7x7mm_P0.5mm_EP5.15x5.15mm",
            "Driver_Motor", "DRV8353",
            125, 100
        )

        # MOSFETs (6 total: UH, UL, VH, VL, WH, WL)
        phases = ['U', 'V', 'W']
        for i, phase in enumerate(phases):
            # High-side
            self.motor_sheet.add_symbol(
                f"Q{i*2+1}", f"{phase}_HIGH",
                "Package_TO_SOT_SMD:TO-252-2",
                "Device", "Q_NMOS_GDS",
                75 + i*30, 75
            )

            # Low-side
            self.motor_sheet.add_symbol(
                f"Q{i*2+2}", f"{phase}_LOW",
                "Package_TO_SOT_SMD:TO-252-2",
                "Device", "Q_NMOS_GDS",
                75 + i*30, 125
            )

        # Current sense amplifiers
        for i in range(3):
            self.motor_sheet.add_symbol(
                f"U{5+i}", "INA240",
                "Package_TO_SOT_SMD:SOT-23-5",
                "Amplifier_Current", "INA240",
                200, 80 + i*20
            )

            # Shunt resistors
            self.motor_sheet.add_symbol(
                f"R{i+1}", "2mΩ",
                "Resistor_SMD:R_2512_6332Metric",
                "Device", "R",
                175, 85 + i*20
            )

        # Add power labels
        self.motor_sheet.add_label("+48V", 50, 60)
        self.motor_sheet.add_label("GND", 50, 140)

        # Phase outputs
        for i, phase in enumerate(phases):
            self.motor_sheet.add_label(f"PHASE_{phase}", 75 + i*30, 100)

    def generate_can_sheet(self):
        """Generate CAN communication schematic."""
        print("  - Generating CAN interface sheet...")

        # CAN transceiver
        self.can_sheet.add_symbol(
            "U8", "TCAN1044",
            "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm",
            "Interface_CAN_LIN", "TCAN1044A",
            125, 100
        )

        # CAN connector
        self.can_sheet.add_symbol(
            "J2", "CAN",
            "Connector_JST:JST_PH_B4B-PH-K_1x04_P2.00mm_Vertical",
            "Connector", "Conn_01x04",
            200, 100
        )

        # Termination resistor
        self.can_sheet.add_symbol(
            "R10", "120Ω",
            "Resistor_SMD:R_0805_2012Metric",
            "Device", "R",
            175, 110
        )

        # Add labels
        self.can_sheet.add_label("CAN_TX", 100, 95)
        self.can_sheet.add_label("CAN_RX", 100, 100)
        self.can_sheet.add_label("CANH", 185, 95)
        self.can_sheet.add_label("CANL", 185, 105)
        self.can_sheet.add_label("+5V", 175, 90)
        self.can_sheet.add_label("GND", 175, 115)

    def generate_sensor_sheet(self):
        """Generate sensor interface schematic (Hall, encoder, NTC)."""
        print("  - Generating sensor interface sheet...")

        # Hall sensors (3x)
        for i in range(3):
            self.sensor_sheet.add_symbol(
                f"U{9+i}", "AH49E",
                "Package_TO_SOT_THT:TO-92_Inline",
                "Sensor_Magnetic", "Hall_Effect",
                75 + i*30, 75
            )

        # NTC thermistor
        self.sensor_sheet.add_symbol(
            "RT1", "100kΩ",
            "Resistor_SMD:R_0805_2012Metric",
            "Device", "Thermistor_NTC",
            175, 75
        )

        # Encoder connector
        self.sensor_sheet.add_symbol(
            "J3", "ENCODER",
            "Connector_JST:JST_SH_BM06B-SHRS-TF_1x06_P1.00mm_Vertical",
            "Connector", "Conn_01x06",
            125, 125
        )

        # Add labels
        self.sensor_sheet.add_label("HALL_U", 75, 70)
        self.sensor_sheet.add_label("HALL_V", 105, 70)
        self.sensor_sheet.add_label("HALL_W", 135, 70)
        self.sensor_sheet.add_label("NTC", 175, 70)
        self.sensor_sheet.add_label("ENC_A", 110, 120)
        self.sensor_sheet.add_label("ENC_B", 110, 125)
        self.sensor_sheet.add_label("ENC_Z", 110, 130)

    def generate_root_sheet(self):
        """Generate root/top-level schematic sheet."""
        print("  - Generating root sheet...")

        # Add hierarchical sheet symbols for sub-sheets
        sheets = [
            ("Power Supply", 50, 50),
            ("MCU", 150, 50),
            ("Motor Drive", 50, 100),
            ("CAN Interface", 150, 100),
            ("Sensors", 100, 150)
        ]

        for sheet_name, x, y in sheets:
            # Hierarchical sheet blocks are represented as rectangles with labels
            self.root_sheet.add_label(f"[{sheet_name}]", x, y)

    def generate_all(self, output_dir: str):
        """Generate all schematic sheets."""
        print("Generating complete hierarchical schematic...")

        # Generate each sheet
        self.generate_power_sheet()
        self.generate_mcu_sheet()
        self.generate_motor_drive_sheet()
        self.generate_can_sheet()
        self.generate_sensor_sheet()
        self.generate_root_sheet()

        # Write output files
        print("  - Writing schematic files...")

        base_name = self.name.replace(" ", "_").lower()

        self.root_sheet.write_schematic(os.path.join(output_dir, f"{base_name}.kicad_sch"))
        self.power_sheet.write_schematic(os.path.join(output_dir, f"{base_name}_power.kicad_sch"))
        self.mcu_sheet.write_schematic(os.path.join(output_dir, f"{base_name}_mcu.kicad_sch"))
        self.motor_sheet.write_schematic(os.path.join(output_dir, f"{base_name}_motor.kicad_sch"))
        self.can_sheet.write_schematic(os.path.join(output_dir, f"{base_name}_can.kicad_sch"))
        self.sensor_sheet.write_schematic(os.path.join(output_dir, f"{base_name}_sensors.kicad_sch"))

        print(f"  ✓ Generated {6} schematic sheets")

        return os.path.join(output_dir, f"{base_name}.kicad_sch")

