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
        pocket_depth = p.bearing_thickness + 1  # 1 mm extra
        for z in (0, p.housing_height - pocket_depth):
            with BuildSketch(Plane.XY.offset(z)) as s:
                Circle(p.bearing_od / 2)
            extrude(amount=pocket_depth, mode=Mode.SUBTRACT)

        # Shaft through-hole
        with BuildSketch(Plane.XY) as s:
            Circle(p.bearing_id / 2)
        extrude(amount=p.housing_height + p.shaft_housing_height, mode=Mode.SUBTRACT)

        # Shaft boss (top) – hollow ring so the 40 mm bore stays open for the output flange
        with BuildSketch(Plane.XY.offset(p.housing_height)) as s:
            # Outer land that supports the bearing outer race
            Circle((p.bearing_od + 10) / 2)
            # Inner clearance equal to bearing ID (matches through-hole)
            Circle(p.bearing_id / 2, mode=Mode.SUBTRACT)
        extrude(amount=5)  # reduced boss height

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