"""J3 Yoke Sub-assembly (Upper-arm ↔︎ Forearm Coupler).

Origin is the J3 pitch axis (same as distal end of the upper-arm tube).
Local Y axis is the rotation axis.
This simplified implementation provides two side-plates that clamp the forearm
link and leave room for future bearing / fastener details.
"""
from build123d import *
from models.arm import common_params as cp  # Shared dimensions
from models.actuators.nema23 import build_nema23_actuator

# -----------------------------------------------------------------------------
# Parameters – tweak here or move to common_params later
# -----------------------------------------------------------------------------
plate_thickness = 6.0
side_fillet      = 4.0

# Bounding envelope of upper-arm & forearm tubes
upper_arm_od = cp.upper_arm_od
forearm_od   = cp.forearm_od

# Plate size: depth matches upper-arm OD, height a bit taller than forearm OD
plate_depth  = upper_arm_od
plate_height = forearm_od * 1.5  # generous clearance

# Fastener pattern
fastener_hole_radius = 5.5 / 2  # M5 clearance
fastener_offset      = 8.0       # distance from plate corner

# -----------------------------------------------------------------------------
# Builders
# -----------------------------------------------------------------------------

def _build_side_plate() -> Part:
    """Side plate with circular bore for the forearm tube and 4 mounting holes."""
    with BuildPart() as plate:
        with BuildSketch() as sk:
            RectangleRounded(plate_depth, plate_height, side_fillet)
        extrude(amount=plate_thickness)

        # Bore for forearm tube (center of plate)
        with BuildSketch(Plane.XY.offset(plate_thickness / 2)) as bore_sk:
            Circle(forearm_od / 2)
        extrude(amount=-plate_thickness, mode=Mode.SUBTRACT)

        # Corner fastener holes
        fc_x = plate_depth / 2 - fastener_offset
        fc_y = plate_height / 2 - fastener_offset
        with Locations(( fc_x,  fc_y, 0), (-fc_x,  fc_y, 0), ( fc_x, -fc_y, 0), (-fc_x, -fc_y, 0)):
            Hole(radius=fastener_hole_radius, depth=plate_thickness)

    plate.part.label = "J3_Yoke_SidePlate"
    # Move origin to bore centre (world 0,0,0) and rotate plate into YZ plane
    plate.part.locate(Rotation(0, 90, 90) * Location((0, 0, -plate_thickness / 2)))
    return plate.part

# -----------------------------------------------------------------------------
# Main assembly
# -----------------------------------------------------------------------------

def build_j3_yoke_assembly() -> Compound:
    """Returns Compound centred at J3 pivot (local origin)."""
    left_plate  = _build_side_plate()
    right_plate = _build_side_plate()

    # Offset plates symmetrically along Z
    plate_offset = forearm_od / 2 + plate_thickness / 2
    left_loc  = Location((0, 0, -plate_offset))
    right_loc = Location((0, 0,  plate_offset))

    # J3 actuator behind yoke, aligned with Y axis, flange meets Y=0
    j3_act = build_nema23_actuator().located(
        Rotation(0, 0, 90) *  # Rotate actuator X axis to local Y
        Location((0, -(cp.gearbox_length + cp.gearbox_output_flange_thickness), 0))
    )

    return Compound(
        label="J3_Yoke_Assembly",
        children=[
            left_plate.located(left_loc),
            right_plate.located(right_loc),
            j3_act,
        ],
    )


if __name__ == "__main__":
    from ocp_vscode import show
    show(build_j3_yoke_assembly())