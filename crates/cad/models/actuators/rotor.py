from models.actuators.base import ActuatorParams, _polar_point
from build123d import *
from math import cos, sin, radians

__all__ = ["build_rotor_hub"]


def build_rotor_hub(p: ActuatorParams) -> Part:
    """Return rotor for inrunner motor with integrated wave generator.

    The rotor is a cylindrical core that spins inside the stator.
    Features:
    - Magnets mounted on outer surface facing stator teeth
    - Integrated elliptical wave generator on top
    - Bore for 6908-2RS bearing (40mm ID)
    """
    # Match stator height for magnetic section
    rotor_magnetic_height = p.housing_height - 2 * (p.bearing_thickness + 1)

    # Rotor dimensions
    rotor_outer_radius = p.magnet_radius + p.magnet_thickness / 2
    bearing_fit_radius = p.bearing_id / 2  # 20mm for 40mm bearing ID
    rotor_inner_radius = rotor_outer_radius - 3.0  # 3mm wall in magnet region
    min_wall_thickness = 1.5  # mm, minimum wall behind magnets

    # Wave generator dimensions from integrated parameters
    wave_gen_height = 12  # Height of elliptical section
    wave_gen_major_radius = p.wave_generator_major_diameter / 2
    wave_gen_minor_radius = p.wave_generator_minor_diameter / 2

    with BuildPart() as bp:
        # Base section for bearing fit (thicker)
        with BuildSketch(Plane.XY) as s:
            Circle(rotor_outer_radius)
            Circle(bearing_fit_radius, mode=Mode.SUBTRACT)
        extrude(amount=8)  # 8mm tall bearing seat

        # Main rotor cylinder (thin wall)
        with BuildSketch(Plane.XY.offset(8)) as s:
            Circle(rotor_outer_radius)
            Circle(rotor_inner_radius, mode=Mode.SUBTRACT)
        extrude(amount=rotor_magnetic_height - 8)

        # Magnet pockets on outer surface
        for i in range(p.magnets_count):
            angle = i * 360 / p.magnets_count
            angle_rad = radians(angle)

            # Limit pocket depth to preserve minimum wall thickness
            max_pocket_depth = rotor_outer_radius - rotor_inner_radius - min_wall_thickness
            desired_pocket_depth = p.magnet_thickness * 0.75  # 75% depth for retention
            pocket_depth = min(desired_pocket_depth, max_pocket_depth)
            pocket_center_radius = rotor_outer_radius - pocket_depth / 2

            with BuildSketch(Plane.XY.offset(8 + (rotor_magnetic_height - 8) / 2 - p.magnet_length / 2)) as s:
                cx = pocket_center_radius * cos(angle_rad)
                cy = pocket_center_radius * sin(angle_rad)
                with Locations((cx, cy)):
                    Rectangle(
                        pocket_depth,
                        p.magnet_width - 0.2,
                        rotation=angle
                    )
            extrude(amount=p.magnet_length - 0.2, mode=Mode.SUBTRACT)

        # Create smooth transition section
        transition_height = 5
        with BuildSketch(Plane.XY.offset(rotor_magnetic_height)) as s:
            Circle(rotor_outer_radius)
            Circle(rotor_inner_radius, mode=Mode.SUBTRACT)
        transition_part = extrude(amount=transition_height)

        # Add wave generator with smooth profile
        with BuildSketch(Plane.XY.offset(rotor_magnetic_height + transition_height)) as s:
            # Use Ellipse primitive for a guaranteed valid face
            Ellipse(wave_gen_major_radius, wave_gen_minor_radius)
        extrude(amount=wave_gen_height)
        # Subtract center bore after extrusion
        with BuildSketch(Plane.XY.offset(rotor_magnetic_height + transition_height)) as s:
            Circle(rotor_inner_radius)
        extrude(amount=wave_gen_height, mode=Mode.SUBTRACT)

        # Add keyway for shaft coupling (in bearing seat only)
        with BuildSketch(Plane.XY) as s:
            with Locations((0, bearing_fit_radius - 1.5)):
                Rectangle(5, 3)
        extrude(amount=8, mode=Mode.SUBTRACT)

        # Add balancing/weight reduction holes in lower section, centered between magnet pockets
        for i in range(p.magnets_count):
            angle = (i + 0.5) * 360 / p.magnets_count
            hole_radius = (rotor_inner_radius + rotor_outer_radius) / 2
            hx, hy = _polar_point(hole_radius, angle)
            with BuildSketch(Plane.XY.offset(2)) as s:
                with Locations((hx, hy)):
                    Circle(2.5)
            extrude(amount=rotor_magnetic_height - 4, mode=Mode.SUBTRACT)

        # Add simple timing mark on top
        with BuildSketch(Plane.XY.offset(rotor_magnetic_height + transition_height + wave_gen_height - 0.5)) as s:
            with Locations((wave_gen_major_radius - 5, 0)):
                Circle(1.5)
        extrude(amount=0.5, mode=Mode.SUBTRACT)

    bp.part.label = f"{p.name}_Rotor"
    return bp.part