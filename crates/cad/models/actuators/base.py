from dataclasses import dataclass
from math import cos, sin, radians
from build123d import *
from typing import Optional

__all__ = [
    "ActuatorParams",
    "_polar_point",
]

@dataclass
class ActuatorParams:
    """Parameters for 3D-printed BLDC motor actuator with integrated strain wave gearing.

    Motor Architecture:
    - Type: INRUNNER brushless DC motor
    - Configuration: Internal rotor with external stator
    - Manufacturing: 3D printed (except magnets, bearings, windings, bolts)
    - Gearing: Integrated strain wave (harmonic drive) reduction

    Component Stack (from center outward):
    1. Shaft (40mm bore for 6908-2RS bearing ID)
    2. Rotor core with integrated wave generator
       - Cylindrical core with magnets on outer surface
       - Elliptical cam profile for wave generator
       - Magnets face outward toward stator teeth
    3. Air gap (typically 1mm)
    4. Stator core (3D printed)
       - Back iron (yoke) ring
       - Teeth pointing radially INWARD
       - Slots for hand-wound copper coils
       - Integrated into housing for thermal management
    5. Housing shell (3D printed)
       - Bearing pockets for 6908-2RS (40x62x12mm)
       - Integrated circular spline for strain wave
       - Mounting flanges with 6mm shoulder bolt holes

    Strain Wave Gearing Integration:
    - Wave Generator: Integrated with rotor (elliptical cam)
    - Flexspline: Separate 3D printed component (TPU/flexible PETG)
    - Circular Spline: Integrated into housing
    - Reduction Ratio: 100:1 typical

    Materials:
    - Housing/Stator: PETG or ASA (heat resistant)
    - Rotor Core: PETG or Nylon
    - Flexspline: TPU 95A or semi-flexible PETG
    - Magnets: Neodymium N42 or stronger
    - Bearings: 6908-2RS (40x62x12mm)
    - Fasteners: M6x16mm 304 stainless shoulder bolts

    Key Design Principles:
    - Optimize for 3D printing: minimize supports, consider layer adhesion
    - Thermal management: plastic has poor thermal conductivity
    - Tolerances: Account for 3D printing accuracy (~0.2mm)
    - Assembly: Design for easy magnet insertion and winding
    """
    name: str
    outer_diameter: float  # Overall OD of housing (mm)
    housing_height: float  # Overall height of housing (mm)
    wall_thickness: float  # Housing wall thickness (mm)

    bearing_id: float      # Bearing inner diameter (shaft) (mm) - 40mm for 6908-2RS
    bearing_od: float      # Bearing outer diameter (mm) - 62mm for 6908-2RS
    bearing_thickness: float  # Bearing thickness (mm) - 12mm for 6908-2RS

    shaft_housing_height: float  # Height of raised shaft boss (mm)

    # Stator parameters
    stator_teeth: int      # Number of stator teeth (typically 12)
    tooth_length: float    # Radial tooth length (mm) - how far teeth extend inward
    tooth_width: float     # Tangential tooth width at root (mm)

    # Rotor/magnet parameters
    magnets_count: int     # Number of magnets (poles)
    magnet_length: float   # Magnet dimension along motor axis (mm) - typically 40mm
    magnet_width: float    # Magnet tangential width (mm) - typically 10mm
    magnet_thickness: float  # Magnet radial thickness (mm) - typically 5mm
    magnet_radius: float     # Radial position of magnet CENTER from motor axis (mm)

    tooth_tip_width: float | None = None  # Tip width after taper (optional)

    flange_offset: float = 3.0  # How far flanges stick out
    flange_radius: float = 6.0  # Flange post radius (for M6 shoulder bolts)
    mount_hole_radius: float = 1.5  # Through-hole radius (M3)

    slot_opening: float = 2.0  # Width of slot mouth at inner radius (mm)

    # Strain wave gearbox parameters
    flexspline_teeth: int = 200  # Number of teeth on flexspline
    circular_spline_teeth: int = 202  # Number of teeth on circular spline (housing)
    gear_module: float = 0.3  # Gear module (mm) - small for 3D printing
    flexspline_thickness: float = 1.2  # Flexspline wall thickness (mm)
    flexspline_length: float = 25.0  # Flexspline cup depth (mm)
    flexspline_rim_width: float = 8.0  # Width of toothed rim (mm)
    wave_amplitude: float = 0.5  # Radial deformation of flexspline (mm)
    wave_generator_ellipse_ratio: float = 1.02  # Major/minor axis ratio
    flexspline_material: str = "TPU 95A"  # Flexible material for flexspline

    @property
    def reduction_ratio(self) -> float:
        """Calculate the gear reduction ratio."""
        return self.flexspline_teeth / (self.circular_spline_teeth - self.flexspline_teeth)

    @property
    def flexspline_pitch_diameter(self) -> float:
        """Pitch diameter of the flexspline (mm)."""
        return self.gear_module * self.flexspline_teeth

    @property
    def circular_spline_pitch_diameter(self) -> float:
        """Pitch diameter of circular spline (mm)."""
        return self.gear_module * self.circular_spline_teeth

    @property
    def wave_generator_major_diameter(self) -> float:
        """Major diameter of elliptical wave generator (mm)."""
        # Must fit inside flexspline with clearance for deformation
        return self.flexspline_pitch_diameter - 2 * self.flexspline_thickness - 1.0

    @property
    def wave_generator_minor_diameter(self) -> float:
        """Minor diameter of elliptical wave generator (mm)."""
        return self.wave_generator_major_diameter / self.wave_generator_ellipse_ratio

# ------------------------------------------------------------
# Helper geometry utilities
# ------------------------------------------------------------

def _polar_point(r: float, angle_deg: float) -> tuple[float, float]:
    a = radians(angle_deg)
    return r * cos(a), r * sin(a)