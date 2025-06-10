from models.actuators.base import ActuatorParams, _polar_point
from build123d import *
from math import radians, cos, sin, tan, atan2, sqrt

__all__ = ["build_stator_core"]


def build_stator_core(p: ActuatorParams) -> Part:
    """Return separate printable stator core with teeth."""
    inner_radius = p.bearing_od / 2 + 2  # clearance from bearing OD
    outer_radius = p.outer_diameter / 2 - p.wall_thickness - 0.5  # 0.5mm clearance for press-fit
    ring_height = p.housing_height - 2 * (p.bearing_thickness + 1)

    with BuildPart() as bp:
        # Create back-iron ring (yoke)
        yoke_thickness = 4.5  # mm - as specified in magnetic analysis
        yoke_inner_radius = outer_radius - yoke_thickness

        with BuildSketch(Plane.XY) as s:
            Circle(outer_radius)
            Circle(yoke_inner_radius, mode=Mode.SUBTRACT)
        extrude(amount=ring_height)

        # Add individual teeth with proper slot openings
        pitch_angle = 360 / p.stator_teeth
        slot_opening = p.slot_opening  # Width of slot opening at inner radius

        # Calculate tooth shoe arc to leave slot openings
        tooth_tip_radius = yoke_inner_radius - p.tooth_length
        slot_opening_angle = 2 * atan2(slot_opening / 2, tooth_tip_radius)  # radians

        for i in range(p.stator_teeth):
            tooth_angle = i * pitch_angle
            angle_rad = radians(tooth_angle)

            # Create tooth profile with proper shoe
            # The tooth has parallel sides and a curved shoe at the tip
            tooth_base_radius = yoke_inner_radius

            # Calculate tooth angular width at base and tip
            half_tooth_width_base = p.tooth_width / 2
            base_angle_offset = half_tooth_width_base / tooth_base_radius

            # Tooth sides are parallel (same angular width throughout)
            # But the shoe extends beyond the tooth body
            tooth_body_angle_offset = base_angle_offset

            # Create points for the tooth profile
            points = []

            # Base left point
            angle_left_base = angle_rad - base_angle_offset
            points.append((tooth_base_radius * cos(angle_left_base),
                          tooth_base_radius * sin(angle_left_base)))

            # Base right point
            angle_right_base = angle_rad + base_angle_offset
            points.append((tooth_base_radius * cos(angle_right_base),
                          tooth_base_radius * sin(angle_right_base)))

            # Tooth body extends with parallel sides
            body_end_radius = tooth_tip_radius + 2.0  # Leave 2mm for shoe

            # Right side of tooth body
            angle_right_body = angle_rad + tooth_body_angle_offset
            points.append((body_end_radius * cos(angle_right_body),
                          body_end_radius * sin(angle_right_body)))

            # Now create the shoe arc
            # The shoe spans from one slot opening to the next
            available_angle = radians(pitch_angle) - slot_opening_angle
            shoe_half_angle = available_angle / 2

            # Add points along the shoe arc
            num_arc_points = 5
            for j in range(num_arc_points):
                arc_angle = angle_rad + shoe_half_angle - (2 * shoe_half_angle * j / (num_arc_points - 1))
                points.append((tooth_tip_radius * cos(arc_angle),
                              tooth_tip_radius * sin(arc_angle)))

            # Left side of tooth body
            angle_left_body = angle_rad - tooth_body_angle_offset
            points.append((body_end_radius * cos(angle_left_body),
                          body_end_radius * sin(angle_left_body)))

            # Create the tooth shape
            with BuildSketch(Plane.XY) as s:
                with BuildLine() as l:
                    Polyline(*points, close=True)
                make_face()
            extrude(amount=ring_height, mode=Mode.ADD)

    bp.part.label = f"{p.name}_Stator"
    return bp.part