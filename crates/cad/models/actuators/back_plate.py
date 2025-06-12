from models.actuators.base import ActuatorParams, _polar_point
from build123d import *

__all__ = ["build_back_plate"]


def build_back_plate(p: ActuatorParams) -> Part:
    """Return a removable back-plate that closes the open end of the shell.

    Key characteristics:
    • Same bolt-circle as the eight shell flanges so it can be screwed on/off.
    • Central through-hole sized to the bearing ID (+ clearance) so the shaft
      can pass through.
    • Optional 1 mm locating lip that sits just inside the inner wall of the
      shell to self-align the plate during assembly.
    """

    plate_thickness = 3.0  # mm – sturdy yet printable
    lip_height = 1.0       # mm – shallow alignment rabbet
    lip_wall = 1.0         # mm – radial thickness of the lip ring

    with BuildPart() as bp:
        # ------------------------------------------------------------------
        # Base circular plate
        # ------------------------------------------------------------------
        with BuildSketch(Plane.XY) as s:
            Circle(p.outer_diameter / 2)
        # Extrude downward so the XY plane remains the mating face
        extrude(amount=-plate_thickness)

        # ------------------------------------------------------------------
        # Central clearance for shaft / bearing inner race
        # ------------------------------------------------------------------
        with BuildSketch(Plane.XY) as s:
            # +0.3 mm radial clearance for easy assembly
            Circle(p.bearing_id / 2 + 0.3)
        extrude(amount=-plate_thickness, mode=Mode.SUBTRACT)

        # ------------------------------------------------------------------
        # Hex clearance for stator winding stems (6 × ¼" hex)
        # ------------------------------------------------------------------
        coil_count = 6
        across_flats_actual = 6.35 # 1/4" hex driver
        across_flats = across_flats_actual + 0.3  # add 0.3 mm radial clearance
        hex_in_radius = across_flats / 2
        from math import cos, sin, pi, radians
        hex_out_radius = hex_in_radius / cos(pi / 6)

        # coil window radius mirrors stator.py calculation: outer_r - coil_od/2 - 3
        # where outer_r = p.outer_diameter/2 and coil_od = 26
        coil_radius = p.outer_diameter / 2 - 26 / 2 - 3 - 7 # 7 mm clearance for hex driver

        for i in range(coil_count):
            ang = i * 360 / coil_count
            x, y = _polar_point(coil_radius, ang)

            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    pts = [
                        (hex_out_radius * cos(radians(60 * k + 30)),
                         hex_out_radius * sin(radians(60 * k + 30)))
                        for k in range(6)
                    ]
                    Polygon(*pts)
            extrude(amount=-plate_thickness, mode=Mode.SUBTRACT)

        # ------------------------------------------------------------------
        # Mounting holes matching the eight shell tabs
        # ------------------------------------------------------------------
        for i in range(8):
            angle = i * 45  # 360/8
            x, y = _polar_point(p.outer_diameter / 2 + p.flange_offset, angle)
            # Add small boss/tab on plate to mate with shell tab
            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    Circle(p.flange_radius)
            extrude(amount=-plate_thickness, mode=Mode.ADD)
            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    # +0.2 mm clearance so screws slide freely
                    Circle(p.mount_hole_radius + 0.2)
            extrude(amount=-plate_thickness, mode=Mode.SUBTRACT)

        # ------------------------------------------------------------------
        # Optional locating lip (faces towards the shell interior)
        # ------------------------------------------------------------------
        inner_clear_dia = p.outer_diameter - 2 * p.wall_thickness
        lip_outer_r = inner_clear_dia / 2
        lip_inner_r = lip_outer_r - lip_wall

        # Add locating lip that protrudes INTO the shell (positive Z)
        with BuildSketch(Plane.XY) as s:
            Circle(lip_outer_r)
            Circle(lip_inner_r, mode=Mode.SUBTRACT)
        # Extrude upward into the shell cavity (above the mating face)
        extrude(amount=lip_height)

    bp.part.label = f"{p.name}_BackPlate"
    return bp.part