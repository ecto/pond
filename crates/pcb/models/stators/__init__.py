"""
PCB Stator designs for RANA actuator family.

This module provides parametric PCB stator generators for brushless DC motors.
The PCB stators use multi-layer FR-4 boards with spiral copper traces to form
motor windings, enabling automated manufacturing and integrated sensors.

Key features:
- Multi-layer spiral coil patterns (typically 4-layer)
- Configurable slot count and pole pairs
- Integrated Hall sensor arrays
- Temperature sensor footprints (NTC)
- Current sense shunt mounting
- Optimized for high torque density

All designs are generated programmatically using KiCad's pcbnew API.
"""

from .pcb_stator_base import StatorParams, StatorGenerator

__all__ = [
    "StatorParams",
    "StatorGenerator",
]

__version__ = "0.1.0"

