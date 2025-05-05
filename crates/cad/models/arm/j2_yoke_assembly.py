"""
J2 Yoke Sub-assembly for the FROG Arm
Connects the Column Base (J1) to the Upper Arm (J2->J3 Link)
Includes the J2 Actuator mount.
"""
from build123d import *
from models.arm import common_params as cp # Absolute import for common params
from models.actuators.nema23 import build_nema23_actuator # Absolute import for actuator

# --- Parameters (imported from common) ---
j2_yoke_plate_thickness = 6.0
upper_arm_od = cp.upper_arm_od
j2_yoke_width = upper_arm_od
j2_yoke_height = 100.0
j2_yoke_depth = 80.0
j2_yoke_fillet = 5.0
j2_fastener_hole_radius = 5.5 / 2
j2_fastener_offset = 10.0

# Actuator dims from cp
nema23_face_size = cp.nema23_face_size
nema23_length = cp.nema23_length
nema23_hole_spacing = cp.nema23_hole_spacing
nema23_mount_hole_radius = cp.nema23_mount_hole_radius
nema23_center_bore_radius = cp.nema23_center_bore_radius
gearbox_face_diam = cp.gearbox_face_diam
gearbox_length = cp.gearbox_length
gearbox_output_flange_diam = cp.gearbox_output_flange_diam
gearbox_output_flange_thickness = cp.gearbox_output_flange_thickness

# --- Component Builder Functions (Copied for self-containment, could be imported) ---

def build_j2_yoke_side_plate() -> Part:
    """Builds a side plate for the J2 Yoke."""
    with BuildPart() as plate:
        with BuildSketch() as sk: RectangleRounded(j2_yoke_depth, j2_yoke_height, j2_yoke_fillet)
        extrude(amount=j2_yoke_plate_thickness)
        with BuildSketch(Plane.XY.offset(j2_yoke_plate_thickness / 2)) as arm_hole_sk: Circle(upper_arm_od / 2.0)
        extrude(amount=-j2_yoke_plate_thickness, mode=Mode.SUBTRACT)
        fc_x = j2_yoke_depth / 2.0 - j2_fastener_offset
        fc_y = j2_yoke_height / 2.0 - j2_fastener_offset
        with Locations( ( fc_x,  fc_y, 0), (-fc_x,  fc_y, 0), ( fc_x, -fc_y, 0), (-fc_x, -fc_y, 0) ):
            Hole(radius=j2_fastener_hole_radius, depth=j2_yoke_plate_thickness)
    plate.part.label = "J2_Yoke_SidePlate"
    plate.part.locate(Location((0, 0, -j2_yoke_plate_thickness / 2.0)))
    return plate.part

def build_j2_yoke_motor_plate() -> Part:
    """Builds the motor mounting plate for the J2 Yoke."""
    motor_mount_width = j2_yoke_depth
    motor_mount_height = j2_yoke_width
    with BuildPart() as plate:
        with BuildSketch() as sk: Rectangle(motor_mount_width, motor_mount_height)
        extrude(amount=j2_yoke_plate_thickness)
        with BuildSketch(Plane.XY.offset(j2_yoke_plate_thickness / 2)) as nema_center_sk: Circle(nema23_center_bore_radius)
        extrude(amount=-j2_yoke_plate_thickness, mode=Mode.SUBTRACT)
        nema_spacing = nema23_hole_spacing / 2.0
        with Locations( ( nema_spacing,  nema_spacing, 0), (-nema_spacing,  nema_spacing, 0), ( nema_spacing, -nema_spacing, 0), (-nema_spacing, -nema_spacing, 0) ):
            Hole(radius=nema23_mount_hole_radius, depth=j2_yoke_plate_thickness)
        fa_x = motor_mount_width / 2.0 - j2_fastener_offset
        fa_y = motor_mount_height / 2.0 - j2_fastener_offset
        with Locations( ( fa_x,  fa_y, 0), (-fa_x,  fa_y, 0), ( fa_x, -fa_y, 0), (-fa_x, -fa_y, 0) ):
            Hole(radius=j2_fastener_hole_radius, depth=j2_yoke_plate_thickness)
    plate.part.label = "J2_Yoke_MotorPlate"
    plate.part.locate(Location((0, 0, -j2_yoke_plate_thickness / 2.0)))
    return plate.part

# --- Main Assembly Function ---

def build_j2_yoke_assembly() -> Compound:
    """Builds and assembles the J2 Yoke components relative to a local origin."""
    # Instantiate components
    j2_yoke_sp_left = build_j2_yoke_side_plate()
    j2_yoke_sp_right = build_j2_yoke_side_plate()
    j2_yoke_mp = build_j2_yoke_motor_plate()
    j2_actuator_real = build_nema23_actuator()

    # Define local locations for assembly
    # Local Y axis will be the pivot axis
    # Origin is center of motor plate front face? Let's redefine to be center of bore axis.

    # Motor plate rotation and position
    # Rotate plate's XY plane to world XZ plane, center along Z
    yoke_mp_loc = Rotation(0, 90, 0) * Location((0, j2_yoke_depth/2.0 - j2_yoke_height/2.0, 0)) # Adjust position?

    # Side plate rotation and position relative to origin (0,0,0) which is the bore center
    side_plate_base_rot = Rotation(0, 90, 90) # Rotate side plate XY plane to world YZ plane
    sp_offset_z = j2_yoke_width / 2.0 + j2_yoke_plate_thickness / 2.0 # Offset from center along Z
    yoke_sp_left_loc = Location((0, 0, -sp_offset_z)) * side_plate_base_rot
    yoke_sp_right_loc = Location((0, 0, sp_offset_z)) * side_plate_base_rot

    # Place J2 actuator: rotate X->Y, offset so flange meets plate back (Y=0)
    j2_actuator_placed = j2_actuator_real.located(
        Rotation(0, 0, 90) *  # Rotate actuator's X axis to align with yoke's Y axis
        Location((0, -(gearbox_length + gearbox_output_flange_thickness), 0))
    )

    # Assemble the compound
    j2_yoke_assembly = Compound(label="J2_Yoke_Assembly", children=[
        j2_yoke_mp.located(yoke_mp_loc),
        j2_yoke_sp_left.located(yoke_sp_left_loc),
        j2_yoke_sp_right.located(yoke_sp_right_loc),
        j2_actuator_placed
    ])

    # The returned compound is centered at the intended J2 pivot point (0,0,0 locally)
    # Its Y-axis aligns with the intended J2 rotation axis.
    return j2_yoke_assembly

# --- Optional: Show standalone assembly ---
if __name__ == "__main__":
    from ocp_vscode import show
    yoke = build_j2_yoke_assembly()
    show(yoke)