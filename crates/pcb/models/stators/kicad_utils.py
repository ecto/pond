"""
Utility functions for KiCad file generation.

Provides UUID generation, net management, and other helper functions.
"""

import uuid
from typing import Dict, List, Optional


class UUIDGenerator:
    """Generate and track unique UUIDs for KiCad elements."""

    def __init__(self):
        self.generated = set()

    def generate(self) -> str:
        """Generate a unique UUID in KiCad format."""
        while True:
            new_uuid = str(uuid.uuid4())
            if new_uuid not in self.generated:
                self.generated.add(new_uuid)
                return new_uuid

    def generate_tstamp(self) -> str:
        """Generate timestamp UUID (8 hex digits)."""
        # KiCad also uses shorter 8-character hex timestamps
        return uuid.uuid4().hex[:8]


class NetManager:
    """Manage net definitions and assignments."""

    def __init__(self):
        self.nets = {}  # name -> number
        self.net_counter = 0

        # Always reserve net 0 for unconnected
        self.nets[""] = 0
        self.net_counter = 1

    def add_net(self, name: str) -> int:
        """Add a net and return its number."""
        if name in self.nets:
            return self.nets[name]

        net_num = self.net_counter
        self.nets[name] = net_num
        self.net_counter += 1
        return net_num

    def get_net(self, name: str) -> int:
        """Get net number by name."""
        return self.nets.get(name, 0)

    def get_all_nets(self) -> Dict[str, int]:
        """Get all nets as dict."""
        return self.nets.copy()

    def write_net_definitions(self, f):
        """Write net definitions to file."""
        for name, number in sorted(self.nets.items(), key=lambda x: x[1]):
            f.write(f'  (net {number} "{name}")\n')
        f.write('\n')


class NetClassManager:
    """Manage net class assignments."""

    def __init__(self):
        self.assignments = {}  # net_name -> netclass_name

    def assign(self, net_name: str, netclass: str):
        """Assign a net to a netclass."""
        self.assignments[net_name] = netclass

    def assign_power_nets(self, voltage: float):
        """Automatically assign power nets based on voltage."""
        power_nets = []

        if voltage >= 48:
            power_nets = ["+48V", "+24V", "+12V", "+5V", "+3V3", "GND"]
        elif voltage >= 24:
            power_nets = ["+24V", "+12V", "+5V", "+3V3", "GND"]
        else:
            power_nets = ["+12V", "+5V", "+3V3", "GND"]

        for net in power_nets:
            self.assignments[net] = "Power"

    def assign_phase_nets(self):
        """Assign motor phase nets to high-current class."""
        phase_nets = ["PHASE_U", "PHASE_V", "PHASE_W"]
        for net in phase_nets:
            self.assignments[net] = "HighCurrent"

    def assign_signal_nets(self, signal_names: List[str]):
        """Assign signal nets to signal class."""
        for net in signal_names:
            self.assignments[net] = "Signal"

    def get_netclass(self, net_name: str) -> str:
        """Get netclass for a net."""
        return self.assignments.get(net_name, "Default")


def create_common_nets() -> List[str]:
    """Create list of common net names for integrated controller."""
    return [
        # Power nets
        "",  # Unconnected (net 0)
        "GND",
        "+48V",
        "+24V",
        "+12V",
        "+5V",
        "+3V3",

        # Phase outputs
        "PHASE_U",
        "PHASE_V",
        "PHASE_W",

        # Motor phases (internal)
        "PHASE_U_HIGH",
        "PHASE_U_LOW",
        "PHASE_V_HIGH",
        "PHASE_V_LOW",
        "PHASE_W_HIGH",
        "PHASE_W_LOW",

        # Gate drive signals
        "PWM_UH",
        "PWM_UL",
        "PWM_VH",
        "PWM_VL",
        "PWM_WH",
        "PWM_WL",

        # Current sensing
        "ADC_IU",
        "ADC_IV",
        "ADC_IW",
        "SHUNT_U+",
        "SHUNT_U-",
        "SHUNT_V+",
        "SHUNT_V-",
        "SHUNT_W+",
        "SHUNT_W-",

        # CAN bus
        "CAN_TX",
        "CAN_RX",
        "CANH",
        "CANL",

        # Hall sensors
        "HALL_U",
        "HALL_V",
        "HALL_W",

        # Encoder
        "ENC_A",
        "ENC_B",
        "ENC_Z",
        "ENC_CS",
        "ENC_CLK",
        "ENC_MISO",
        "ENC_MOSI",

        # Temperature
        "NTC",
        "TEMP_SENSE",

        # MCU specific
        "NRST",
        "BOOT0",
        "SWDIO",
        "SWCLK",
        "SWO",

        # Crystal
        "OSC_IN",
        "OSC_OUT",

        # USB (if present)
        "USB_DP",
        "USB_DM",

        # SPI
        "SPI_SCK",
        "SPI_MISO",
        "SPI_MOSI",
        "SPI_CS",

        # I2C
        "I2C_SCL",
        "I2C_SDA",
    ]


def assign_net_classes_auto(net_manager: NetManager, netclass_manager: NetClassManager, bus_voltage: float):
    """Automatically assign nets to appropriate classes."""

    # Power nets
    netclass_manager.assign_power_nets(bus_voltage)

    # Phase outputs (high current)
    netclass_manager.assign_phase_nets()

    # Internal phase nets
    for phase in ["U", "V", "W"]:
        netclass_manager.assign(f"PHASE_{phase}_HIGH", "Power")
        netclass_manager.assign(f"PHASE_{phase}_LOW", "Power")

    # Signal nets
    signal_nets = [
        "PWM_UH", "PWM_UL", "PWM_VH", "PWM_VL", "PWM_WH", "PWM_WL",
        "ADC_IU", "ADC_IV", "ADC_IW",
        "CAN_TX", "CAN_RX", "CANH", "CANL",
        "HALL_U", "HALL_V", "HALL_W",
        "ENC_A", "ENC_B", "ENC_Z", "ENC_CS", "ENC_CLK", "ENC_MISO", "ENC_MOSI",
        "NTC", "TEMP_SENSE",
        "NRST", "BOOT0", "SWDIO", "SWCLK", "SWO",
        "OSC_IN", "OSC_OUT",
        "USB_DP", "USB_DM",
        "SPI_SCK", "SPI_MISO", "SPI_MOSI", "SPI_CS",
        "I2C_SCL", "I2C_SDA",
    ]
    netclass_manager.assign_signal_nets(signal_nets)


def format_coordinate(value: float) -> str:
    """Format coordinate for KiCad (no trailing zeros)."""
    # KiCad uses millimeters with up to 6 decimal places
    formatted = f"{value:.6f}".rstrip('0').rstrip('.')
    return formatted


def format_uuid(uuid_str: str) -> str:
    """Format UUID for KiCad files."""
    # KiCad uses standard UUID format
    return uuid_str


def escape_string(s: str) -> str:
    """Escape string for KiCad S-expression."""
    # Escape quotes and backslashes
    return s.replace('\\', '\\\\').replace('"', '\\"')


def write_property(f, name: str, value: str, x: float, y: float, effects: Optional[Dict] = None):
    """Write a property definition."""
    f.write(f'    (property "{name}" "{escape_string(value)}"\n')
    f.write(f'      (at {format_coordinate(x)} {format_coordinate(y)} 0)\n')

    if effects is None:
        effects = {"font": {"size": (1.27, 1.27)}, "justify": "left"}

    f.write('      (effects')
    if "font" in effects:
        font = effects["font"]
        size = font.get("size", (1.27, 1.27))
        f.write(f' (font (size {size[0]} {size[1]}))')
    if effects.get("hide", False):
        f.write(' hide')
    f.write(')\n')
    f.write('    )\n')

