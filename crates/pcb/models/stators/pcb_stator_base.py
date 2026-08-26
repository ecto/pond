"""
Base classes and utilities for PCB stator generation.

This module provides the core functionality for generating PCB stators with
spiral coil patterns suitable for BLDC motors.
"""

import os
import math
from dataclasses import dataclass
from typing import List, Tuple, Optional


@dataclass
class StatorParams:
    """Parameters for PCB stator design.

    PCB Stator Architecture:
    - Multi-layer FR-4 board with copper spiral traces forming motor windings
    - Each phase distributed across multiple layers
    - Integrated sensors and connectors

    Design Considerations:
    - Slot count: Typically 12 slots for 14-pole rotor (RANA spec)
    - Layer stackup: 4-layer typical (L1=Phase A, L2=Phase B, L3=Phase C, L4=Ground/thermal)
    - Trace geometry: 0.25mm width / 0.25mm spacing (1 oz copper minimum)
    - Copper weight: 4-6 oz for power handling
    - Vias: Stitched at every 45° sector for phase connections

    Thermal Management:
    - Copper planes on bottom layer for heat dissipation
    - Thermal vias to housing
    - NTC temperature sensor near center

    Electrical:
    - Three-phase wye or delta configuration
    - Phase resistance typically 0.5-2 ohms depending on size
    - Inductance 50-200 µH per phase
    """

    name: str                      # Stator model name (e.g., "rana_s")
    outer_diameter: float          # Overall PCB diameter (mm)
    inner_diameter: float          # Central bore diameter (mm)
    num_slots: int                 # Number of stator slots (teeth)
    num_poles: int                 # Number of rotor magnet poles
    num_layers: int                # PCB layer count (typically 4)
    trace_width: float             # Copper trace width (mm)
    trace_spacing: float           # Spacing between traces (mm)
    copper_weight_oz: float        # Copper thickness (oz/ft²)

    # Phase winding parameters
    turns_per_coil: int           # Number of spiral turns per coil
    coil_inner_radius: float      # Starting radius for spiral (mm)
    coil_outer_radius: float      # Ending radius for spiral (mm)

    # Sensor and connector positions
    hall_sensor_radius: float     # Radius for Hall sensor array (mm)
    num_hall_sensors: int         # Typically 3 for BLDC
    ntc_position: Tuple[float, float]  # (x, y) position for temperature sensor (mm)

    # Manufacturing
    pcb_thickness: float          # Total board thickness (mm)
    min_via_size: float          # Minimum via drill size (mm)

    def __post_init__(self):
        """Validate parameters after initialization."""
        assert self.outer_diameter > self.inner_diameter, "Outer diameter must be larger than inner"
        assert self.num_slots > 0, "Must have at least one slot"
        assert self.num_poles > 0, "Must have at least one pole"
        assert self.num_layers >= 2, "Must have at least 2 layers"
        assert self.trace_width > 0, "Trace width must be positive"
        assert self.trace_spacing > 0, "Trace spacing must be positive"


class StatorGenerator:
    """Base class for generating PCB stator designs.

    This class provides utilities for creating spiral coil patterns,
    placing sensors, and generating KiCad PCB files programmatically.

    Note: This is a pure-Python generator that creates KiCad files directly
    without requiring pcbnew API. This avoids dependency issues.
    """

    def __init__(self, params: StatorParams):
        self.params = params
        self.tracks = []      # List of track segments
        self.vias = []        # List of vias
        self.footprints = []  # List of component footprints

    def generate_spiral_coil(
        self,
        phase: int,
        layer: str,
        start_angle: float,
        clockwise: bool = True
    ) -> List[Tuple[float, float]]:
        """Generate points for a spiral coil trace.

        Args:
            phase: Phase number (0=A, 1=B, 2=C)
            layer: PCB layer name (e.g., "F.Cu", "In1.Cu")
            start_angle: Starting angle in radians
            clockwise: Direction of spiral

        Returns:
            List of (x, y) coordinates for the spiral path
        """
        points = []
        p = self.params

        # Calculate angular span for this coil
        # Distribute coils evenly around the stator
        slots_per_phase = p.num_slots // 3  # Assuming 3-phase
        angular_span = (2 * math.pi) / p.num_slots

        # Generate spiral from inner to outer radius
        num_points = 100 * p.turns_per_coil  # Points per spiral

        for i in range(num_points):
            t = i / num_points  # Parameter from 0 to 1

            # Interpolate radius from inner to outer
            radius = p.coil_inner_radius + t * (p.coil_outer_radius - p.coil_inner_radius)

            # Calculate angle (multiple turns)
            angle = start_angle + (t * p.turns_per_coil * 2 * math.pi)
            if not clockwise:
                angle = start_angle - (t * p.turns_per_coil * 2 * math.pi)

            # Convert to Cartesian coordinates
            x = radius * math.cos(angle)
            y = radius * math.sin(angle)

            points.append((x, y))

        return points

    def add_track_segments(
        self,
        points: List[Tuple[float, float]],
        layer: str,
        width: float
    ):
        """Add track segments connecting a list of points.

        Args:
            points: List of (x, y) coordinates
            layer: PCB layer name
            width: Track width in mm
        """
        for i in range(len(points) - 1):
            self.tracks.append({
                'start': points[i],
                'end': points[i + 1],
                'layer': layer,
                'width': width
            })

    def add_via(self, x: float, y: float, size: float, drill: float):
        """Add a via at the specified position.

        Args:
            x, y: Position in mm
            size: Via pad diameter in mm
            drill: Via drill diameter in mm
        """
        self.vias.append({
            'position': (x, y),
            'size': size,
            'drill': drill
        })

    def generate_phase_winding(self, phase: int, layer_start: str, layer_end: str):
        """Generate complete winding for one phase.

        Args:
            phase: Phase number (0=A, 1=B, 2=C)
            layer_start: Starting layer name
            layer_end: Ending layer name (if different, adds vias)
        """
        p = self.params
        slots_per_phase = p.num_slots // 3

        for slot in range(slots_per_phase):
            # Calculate starting angle for this slot
            slot_angle = (phase + slot * 3) * (2 * math.pi / p.num_slots)

            # Generate spiral coil for this slot
            points = self.generate_spiral_coil(
                phase=phase,
                layer=layer_start,
                start_angle=slot_angle,
                clockwise=(slot % 2 == 0)  # Alternate direction
            )

            # Add track segments
            self.add_track_segments(points, layer_start, p.trace_width)

            # Add via at the end if switching layers
            if layer_start != layer_end:
                end_x, end_y = points[-1]
                self.add_via(end_x, end_y, p.min_via_size * 2, p.min_via_size)

    def add_hall_sensors(self):
        """Add Hall sensor footprints for rotor position sensing."""
        p = self.params

        for i in range(p.num_hall_sensors):
            angle = (i * 2 * math.pi) / p.num_hall_sensors
            x = p.hall_sensor_radius * math.cos(angle)
            y = p.hall_sensor_radius * math.sin(angle)

            self.footprints.append({
                'type': 'hall_sensor',
                'position': (x, y),
                'rotation': math.degrees(angle)
            })

    def add_temperature_sensor(self):
        """Add NTC temperature sensor footprint."""
        x, y = self.params.ntc_position
        self.footprints.append({
            'type': 'ntc_sensor',
            'position': (x, y),
            'rotation': 0
        })

    def generate(self) -> str:
        """Generate complete PCB stator design.

        Returns:
            Path to generated KiCad PCB file
        """
        # Generate windings for all three phases
        # Layer mapping: L1=F.Cu, L2=In1.Cu, L3=In2.Cu, L4=B.Cu
        layer_map = {
            0: "F.Cu",      # Phase A (top)
            1: "In1.Cu",    # Phase B (inner 1)
            2: "In2.Cu",    # Phase C (inner 2)
            3: "B.Cu"       # Ground/thermal plane (bottom)
        }

        # Generate phase A on top layer
        self.generate_phase_winding(0, layer_map[0], layer_map[0])

        # Generate phase B on inner layer 1
        self.generate_phase_winding(1, layer_map[1], layer_map[1])

        # Generate phase C on inner layer 2
        self.generate_phase_winding(2, layer_map[2], layer_map[2])

        # Add sensors
        self.add_hall_sensors()
        self.add_temperature_sensor()

        # Write KiCad PCB file
        output_path = os.getenv("KICAD_PCB_OUTPUT_PATH")
        if not output_path:
            raise ValueError("KICAD_PCB_OUTPUT_PATH environment variable not set")

        self.write_kicad_pcb(output_path)

        return output_path

    def write_kicad_pcb(self, filepath: str):
        """Write KiCad PCB file in S-expression format.

        This generates a minimal but valid KiCad 7.0 PCB file.
        """
        with open(filepath, 'w') as f:
            # Write header
            f.write('(kicad_pcb (version 20221018) (generator pcbnew)\n\n')

            # General section
            f.write('  (general\n')
            f.write(f'    (thickness {self.params.pcb_thickness})\n')
            f.write('  )\n\n')

            # Paper size
            f.write('  (paper "A4")\n\n')

            # Layers
            f.write('  (layers\n')
            f.write('    (0 "F.Cu" signal)\n')
            f.write('    (1 "In1.Cu" signal)\n')
            f.write('    (2 "In2.Cu" signal)\n')
            f.write('    (31 "B.Cu" signal)\n')
            f.write('    (32 "B.Adhes" user "B.Adhesive")\n')
            f.write('    (33 "F.Adhes" user "F.Adhesive")\n')
            f.write('    (34 "B.Paste" user)\n')
            f.write('    (35 "F.Paste" user)\n')
            f.write('    (36 "B.SilkS" user "B.Silkscreen")\n')
            f.write('    (37 "F.SilkS" user "F.Silkscreen")\n')
            f.write('    (38 "B.Mask" user)\n')
            f.write('    (39 "F.Mask" user)\n')
            f.write('    (40 "Dwgs.User" user "User.Drawings")\n')
            f.write('    (41 "Cmts.User" user "User.Comments")\n')
            f.write('    (42 "Eco1.User" user "User.Eco1")\n')
            f.write('    (43 "Eco2.User" user "User.Eco2")\n')
            f.write('    (44 "Edge.Cuts" user)\n')
            f.write('    (45 "Margin" user)\n')
            f.write('    (46 "B.CrtYd" user "B.Courtyard")\n')
            f.write('    (47 "F.CrtYd" user "F.Courtyard")\n')
            f.write('    (48 "B.Fab" user)\n')
            f.write('    (49 "F.Fab" user)\n')
            f.write('  )\n\n')

            # Setup section
            f.write('  (setup\n')
            f.write('    (pad_to_mask_clearance 0)\n')
            f.write('    (pcbplotparams\n')
            f.write('      (layerselection 0x00010fc_ffffffff)\n')
            f.write('      (plot_on_all_layers_selection 0x0000000_00000000)\n')
            f.write('      (disableapertmacros false)\n')
            f.write('      (usegerberextensions false)\n')
            f.write('      (usegerberattributes true)\n')
            f.write('      (usegerberadvancedattributes true)\n')
            f.write('      (creategerberjobfile true)\n')
            f.write('      (dashed_line_dash_ratio 12.000000)\n')
            f.write('      (dashed_line_gap_ratio 3.000000)\n')
            f.write('      (svgprecision 4)\n')
            f.write('      (plotframeref false)\n')
            f.write('      (viasonmask false)\n')
            f.write('      (mode 1)\n')
            f.write('      (useauxorigin false)\n')
            f.write('      (hpglpennumber 1)\n')
            f.write('      (hpglpenspeed 20)\n')
            f.write('      (hpglpendiameter 15.000000)\n')
            f.write('      (dxfpolygonmode true)\n')
            f.write('      (dxfimperialunits true)\n')
            f.write('      (dxfusepcbnewfont true)\n')
            f.write('      (psnegative false)\n')
            f.write('      (psa4output false)\n')
            f.write('      (plotreference true)\n')
            f.write('      (plotvalue true)\n')
            f.write('      (plotinvisibletext false)\n')
            f.write('      (sketchpadsonfab false)\n')
            f.write('      (subtractmaskfromsilk false)\n')
            f.write('      (outputformat 1)\n')
            f.write('      (mirror false)\n')
            f.write('      (drillshape 1)\n')
            f.write('      (scaleselection 1)\n')
            f.write('      (outputdirectory "")\n')
            f.write('    )\n')
            f.write('  )\n\n')

            # Board outline (circular)
            self._write_board_outline(f)

            # Write tracks
            for track in self.tracks:
                x1, y1 = track['start']
                x2, y2 = track['end']
                f.write(f'  (segment (start {x1} {y1}) (end {x2} {y2}) ')
                f.write(f'(width {track["width"]}) (layer "{track["layer"]}") (net 0))\n')

            # Write vias
            for via in self.vias:
                x, y = via['position']
                f.write(f'  (via (at {x} {y}) (size {via["size"]}) ')
                f.write(f'(drill {via["drill"]}) (layers "F.Cu" "B.Cu") (net 0))\n')

            # Close file
            f.write(')\n')

    def _write_board_outline(self, f):
        """Write circular board outline to Edge.Cuts layer."""
        # Draw circle using arc segments (KiCad circle representation)
        radius = self.params.outer_diameter / 2

        # Simple approximation: draw as 4 arcs (quadrants)
        f.write(f'  (gr_circle (center 0 0) (end {radius} 0) ')
        f.write('(stroke (width 0.15) (type solid)) (layer "Edge.Cuts") (tstamp 00000000-0000-0000-0000-000000000000))\n\n')

        # Inner bore
        inner_radius = self.params.inner_diameter / 2
        f.write(f'  (gr_circle (center 0 0) (end {inner_radius} 0) ')
        f.write('(stroke (width 0.15) (type solid)) (layer "Edge.Cuts") (tstamp 00000000-0000-0000-0000-000000000001))\n\n')


def polar_to_cartesian(radius: float, angle: float) -> Tuple[float, float]:
    """Convert polar coordinates to Cartesian.

    Args:
        radius: Distance from origin (mm)
        angle: Angle in radians

    Returns:
        (x, y) coordinates in mm
    """
    x = radius * math.cos(angle)
    y = radius * math.sin(angle)
    return (x, y)


def calculate_slot_angle(slot_index: int, num_slots: int) -> float:
    """Calculate the angular position of a stator slot.

    Args:
        slot_index: Index of the slot (0 to num_slots-1)
        num_slots: Total number of slots

    Returns:
        Angle in radians
    """
    return (slot_index * 2 * math.pi) / num_slots

