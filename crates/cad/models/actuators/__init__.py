"""
Actuator components for 3D printing and CAD generation.

This module provides modular actuator components including:
- Shell/housing with mounting flanges and bearing pockets
- Stator core with flanged teeth for winding retention
- Rotor hub with magnet slots

All components are designed for 3D printing and use the ActuatorParams
dataclass for configuration.
"""

from .base import ActuatorParams
from .shell import build_shell
from .stator import build_stator_core
from .rotor import build_rotor_hub
from .back_plate import build_back_plate

__all__ = [
    "ActuatorParams",
    "build_shell",
    "build_stator_core",
    "build_rotor_hub",
    "build_back_plate",
]

__version__ = "0.1.0"