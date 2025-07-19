from models.actuators.base import ActuatorParams, _polar_point
from build123d import *

__all__ = ["build_shell"]


def build_shell(p: ActuatorParams) -> Part:
    """Return the printable outer housing (shell)."""
    with BuildPart() as bp:
        # Basic outer cylinder
        with BuildSketch(Plane.XY) as s:
            Circle(p.outer_diameter / 2)
        extrude(amount=p.housing_height)

        # Hollow interior
        with BuildSketch(Plane.XY) as s:
            Circle(p.outer_diameter / 2 - p.wall_thickness)
        extrude(amount=p.housing_height - p.wall_thickness, mode=Mode.SUBTRACT)

        # Bearing pockets (top & bottom)
        # Single top bearing pocket with a little extra depth and diameter clearance
        pocket_depth = p.bearing_thickness + 2  # 2 mm extra to ease assembly
        bearing_clearance = 0.3                # 0.3 mm diametral clearance (0.15 mm radial)

        top_pocket_z = p.housing_height - pocket_depth  # start of pocket measured from XY plane

        with BuildSketch(Plane.XY.offset(top_pocket_z)) as s:
            Circle(p.bearing_od / 2 + bearing_clearance / 2)
        extrude(amount=pocket_depth, mode=Mode.SUBTRACT)

        # Shaft through-hole
        with BuildSketch(Plane.XY) as s:
            Circle(p.bearing_id / 2)
        extrude(amount=p.housing_height + p.shaft_housing_height, mode=Mode.SUBTRACT)

        # Shaft boss (top) – hollow ring so the 40 mm bore stays open for the output flange
        # Previously there was an external ring boss on top of the housing to
        # support the bearing inner race/output flange.  The new single-bearing
        # layout uses mounting holes in the eccentric sleeve instead, so this
        # external feature is now reinstated as a *flat* boss whose outer diameter
        # matches the main shell.  This keeps the print simple (no overhangs)
        # while providing a solid land that can be machined or tapped if needed.

        boss_height = 5  # mm – same as original design but now full-width

        with BuildSketch(Plane.XY.offset(p.housing_height)) as s:
            # Full shell diameter so the boss wall is co-linear with the shell wall.
            Circle(p.outer_diameter / 2)
            # Maintain the central Ø40 mm (bearing ID) clearance.
            Circle(p.bearing_id / 2, mode=Mode.SUBTRACT)
        extrude(amount=boss_height)

        # Mounting flanges around perimeter
        for i in range(8):
            angle = i * 45
            x, y = _polar_point(p.outer_diameter / 2 + p.flange_offset, angle)
            # Tab flange
            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    Circle(p.flange_radius)
            extrude(amount=5)  # 5mm thick tab
            # Through-hole
            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    Circle(p.mount_hole_radius)
            extrude(amount=5, mode=Mode.SUBTRACT)  # Hole through the tab

        # Radial wire exit hole Ø8 mm
        hole_radius = 4
        hole_len = p.wall_thickness + 4  # ensure full cut
        with BuildSketch(Plane.YZ.offset(p.outer_diameter/2 - hole_radius)) as s:
            with Locations((0, p.housing_height/2)):
                Circle(hole_radius)
        extrude(amount=hole_len, mode=Mode.SUBTRACT, both=True)

        # ------------------------------------------------------------------
        # Integrated cycloidal pin ring – 29 downward pins
        # ------------------------------------------------------------------
        pin_count = 29
        pin_diameter = 6.1
        pin_circle_dia = 72.0
        pin_length = 15.0  # downward into cavity to engage both cycloid discs

        # Start pins at inner ceiling (underside of shell top wall)
        pin_top_z = p.housing_height - p.wall_thickness  # interior top surface

        for i in range(pin_count):
            ang = i * 360 / pin_count
            # Convert polar to XY
            r = pin_circle_dia / 2
            x, y = _polar_point(r, ang)

            with BuildSketch(Plane.XY.offset(pin_top_z)) as s:
                with Locations((x, y)):
                    Circle((pin_diameter - 0.1) / 2)  # slight interference
            extrude(amount=-pin_length, mode=Mode.ADD)

    bp.part.label = f"{p.name}_Shell"
    return bp.part