"""
FROG Arm Assembly Model based on notes/arm.md using build123d
"""
import os
from build123d import *

# --- Parameters from arm.md ---

# Link Dimensions
column_od = 100.0
column_thickness = 6.0
column_height = 500.0 # Or maybe less for just the base? Spec says 500mm housing. Let's use 100 for the bearing/J1 part.
column_render_height = 100.0 # Height of the modeled part

upper_arm_od = 80.0
upper_arm_thickness = 4.0
upper_arm_length = 300.0

forearm_od = 60.0
forearm_thickness = 4.0
forearm_length = 250.0

# Joint Info (Placeholder - more detail needed for yokes/mounts)
j1_axis = Axis.Z
j2_axis = Axis.Y # Assuming initial horizontal pose
j3_axis = Axis.Y # Assuming initial horizontal pose
j4_axis = Axis.X # Along forearm
j5_axis = Axis.Y # Perpendicular to forearm
j6_axis = Axis.X # Along tool flange

# Derived radii
column_ir = (column_od / 2.0) - column_thickness
column_or = column_od / 2.0
upper_arm_ir = (upper_arm_od / 2.0) - upper_arm_thickness
upper_arm_or = upper_arm_od / 2.0
forearm_ir = (forearm_od / 2.0) - forearm_thickness
forearm_or = forearm_od / 2.0

# Actuator Dimensions (NEMA 23 Motor + Gearbox)
nema23_face_size = 57.0 # Approx square face width/height (mm)
nema23_length = 76.0 # Typical length for 3Nm closed loop motor
nema23_shaft_diam = 8.0 # NEMA 23 shaft standard
nema23_shaft_length = 20.0
nema23_hole_spacing = 47.14
nema23_mount_hole_radius = 5.5 / 2.0 # M5 clearance
nema23_center_bore_radius = 38.0 / 2.0 # Add the missing parameter

gearbox_face_diam = nema23_face_size # Assuming gearbox matches motor face
gearbox_length = 80.0 # Estimated length for 20:1 planetary
gearbox_output_flange_diam = 40.0 # Estimated output flange diam
gearbox_output_flange_thickness = 5.0 # Estimated output flange thickness

# Tool Flange Dimensions (ISO 9409-1-50-4-M6)
tool_flange_diam = 50.0
tool_flange_thickness = 8.0 # Common thickness
tool_flange_pcd = 31.5 # Bolt Pitch Circle Diameter for size 50
tool_flange_hole_radius = 6.5 / 2.0 # M6 clearance
tool_flange_pin_diam = 6.0 # H7 Dowel pin diameter

# J2 Yoke Dimensions (connecting column to upper arm)
j2_yoke_plate_thickness = 6.0 # mm
j2_yoke_width = upper_arm_od # Yoke fits around the upper arm tube
j2_yoke_height = 100.0 # Estimated height
j2_yoke_depth = 80.0 # Estimated depth
j2_yoke_fillet = 5.0
j2_fastener_hole_radius = 5.5 / 2.0 # M5 clearance
j2_fastener_offset = 10.0

# --- Build Parts ---

# --- Component Builders ---

def build_nema23_actuator() -> Part:
    """Builds a simplified NEMA23 motor + gearbox assembly."""
    with BuildPart() as actuator:
        # Gearbox Body
        with BuildSketch(Plane.YZ) as gb_sk:
            Circle(gearbox_face_diam / 2.0)
        extrude(amount=gearbox_length)
        gearbox_body = actuator.part

        # Gearbox Output Flange
        with BuildSketch(Plane.YZ.offset(gearbox_length)) as gb_flange_sk:
            Circle(gearbox_output_flange_diam / 2.0)
        extrude(amount=gearbox_output_flange_thickness)

        # Motor Body (aligned behind gearbox)
        motor_offset = -nema23_length
        with BuildSketch(Plane.YZ.offset(0)) as motor_sk: # Start motor sketch at gearbox back face
             Rectangle(nema23_face_size, nema23_face_size)
        extrude(amount=motor_offset) # Extrude backwards

    actuator.part.label = "NEMA23_Actuator"
    return actuator.part

def build_tool_flange() -> Part:
    """Builds a simplified ISO 9409-1-50-4-M6 tool flange."""
    with BuildPart() as flange:
        # Flange Disc
        with BuildSketch(Plane.XY) as flange_sk: # Sketch on XY plane, extrude Z
            Circle(tool_flange_diam / 2.0)
            # Add mounting holes
            with PolarLocations(radius=tool_flange_pcd / 2.0, count=4):
                Circle(tool_flange_hole_radius, mode=Mode.SUBTRACT)
            # Add dowel pin holes (approximate placement - often offset)
            # Let's place one on the PCD for simplicity here
            with Locations((tool_flange_pcd / 2.0, 0)):
                 Circle(tool_flange_pin_diam / 2.0, mode=Mode.SUBTRACT)
        extrude(amount=tool_flange_thickness)

    flange.part.label = "ISO_Tool_Flange"
    # Center the flange origin at its back face center
    flange.part.locate(Location((0, 0, -tool_flange_thickness / 2.0)))
    return flange.part

def build_j2_yoke_side_plate() -> Part:
    """Builds a side plate for the J2 Yoke."""
    with BuildPart() as plate:
        with BuildSketch() as sk:
            RectangleRounded(j2_yoke_depth, j2_yoke_height, j2_yoke_fillet)
        extrude(amount=j2_yoke_plate_thickness)

        # Upper Arm mount hole (center of plate)
        with BuildSketch(Plane.XY.offset(j2_yoke_plate_thickness / 2)) as arm_hole_sk:
            Circle(upper_arm_od / 2.0) # Hole sized for the arm tube itself
        extrude(amount=-j2_yoke_plate_thickness, mode=Mode.SUBTRACT)

        # Fastener Holes (corners)
        fc_x = j2_yoke_depth / 2.0 - j2_fastener_offset
        fc_y = j2_yoke_height / 2.0 - j2_fastener_offset
        with Locations(
            ( fc_x,  fc_y, 0), (-fc_x,  fc_y, 0),
            ( fc_x, -fc_y, 0), (-fc_x, -fc_y, 0)
        ):
            Hole(radius=j2_fastener_hole_radius, depth=j2_yoke_plate_thickness)
            # TODO: Add holes to mount to column base plate

    plate.part.label = "J2_Yoke_SidePlate"
    # Position origin at the center of the plate's thickness, in the XY plane
    plate.part.locate(Location((0, 0, -j2_yoke_plate_thickness / 2.0)))
    return plate.part

def build_j2_yoke_motor_plate() -> Part:
    """Builds the motor mounting plate for the J2 Yoke."""
    motor_mount_width = j2_yoke_depth # Plate oriented depth-wise
    motor_mount_height = j2_yoke_width # Plate fits between side plates

    with BuildPart() as plate:
        with BuildSketch() as sk:
            Rectangle(motor_mount_width, motor_mount_height)
        extrude(amount=j2_yoke_plate_thickness)

        # NEMA 23 Center Bore
        with BuildSketch(Plane.XY.offset(j2_yoke_plate_thickness / 2)) as nema_center_sk:
            Circle(nema23_center_bore_radius)
        extrude(amount=-j2_yoke_plate_thickness, mode=Mode.SUBTRACT)

        # NEMA 23 Mounting Holes
        nema_spacing = nema23_hole_spacing / 2.0
        with Locations(
            ( nema_spacing,  nema_spacing, 0), (-nema_spacing,  nema_spacing, 0),
            ( nema_spacing, -nema_spacing, 0), (-nema_spacing, -nema_spacing, 0)
        ):
            Hole(radius=nema23_mount_hole_radius, depth=j2_yoke_plate_thickness)

        # Assembly Fastener Holes (Edges)
        fa_x = motor_mount_width / 2.0 - j2_fastener_offset
        fa_y = motor_mount_height / 2.0 - j2_fastener_offset
        with Locations(
            ( fa_x,  fa_y, 0), (-fa_x,  fa_y, 0),
            ( fa_x, -fa_y, 0), (-fa_x, -fa_y, 0)
        ):
            Hole(radius=j2_fastener_hole_radius, depth=j2_yoke_plate_thickness)

    plate.part.label = "J2_Yoke_MotorPlate"
     # Position origin at the center of the plate's thickness, in the XY plane
    plate.part.locate(Location((0, 0, -j2_yoke_plate_thickness / 2.0)))
    return plate.part

# --- Link Builders ---

# Build Column Base (J1 housing)
with BuildPart() as column_builder:
    Cylinder(radius=column_or, height=column_render_height)
    # Subtract inner bore
    Cylinder(radius=column_ir, height=column_render_height, mode=Mode.SUBTRACT)
    # TODO: Add slewing bearing mount features? NEMA mount features?

column_base = column_builder.part
column_base.label = "ColumnBase_J1"

# Build Upper Arm (J2-J3 Link)
with BuildPart() as upper_arm_builder:
    with BuildSketch(Plane.YZ) as upper_arm_profile:
        Circle(radius=upper_arm_or)
        Circle(radius=upper_arm_ir, mode=Mode.SUBTRACT)
    extrude(amount=upper_arm_length)

upper_arm = upper_arm_builder.part
upper_arm.label = "UpperArm_J2_J3"


# Build Forearm (J4-J5-J6 Link)
with BuildPart() as forearm_builder:
    with BuildSketch(Plane.YZ) as forearm_profile:
        Circle(radius=forearm_or)
        Circle(radius=forearm_ir, mode=Mode.SUBTRACT)
    extrude(amount=forearm_length)

forearm = forearm_builder.part
forearm.label = "Forearm_J4_J5_J6"

# --- Create Component Instances ---
j1_actuator = build_nema23_actuator()
# j2_actuator = build_nema23_actuator() # Replace placeholder with real one below
j3_actuator = build_nema23_actuator()
tool_flange = build_tool_flange()

# J2 Yoke Components
j2_yoke_sp_left = build_j2_yoke_side_plate()
j2_yoke_sp_right = build_j2_yoke_side_plate()
j2_yoke_mp = build_j2_yoke_motor_plate()
j2_actuator_real = build_nema23_actuator() # The actual actuator for J2

# --- Assembly ---
# Define joint locations relative to the base origin (0, 0, 0)
# Assuming base of column is at Z=0

# J1 location is the origin
j1_loc = Location((0, 0, 0))

# J2 location is at the top of the column base
j2_pivot_z = column_render_height # Pivot point height
j2_loc = Location((0, 0, j2_pivot_z))

# J3 location is at the end of the upper arm (relative to J2)
j3_loc_rel_j2 = Location((upper_arm_length, 0, 0))
j3_loc = j2_loc * j3_loc_rel_j2

# J4 location is coincident with J3 (yaw axis)
j4_loc = j3_loc

# J5 location is at the end of the forearm (relative to J4)
j5_loc_rel_j4 = Location((forearm_length, 0, 0))
j5_loc = j4_loc * j5_loc_rel_j4

# J6 location is coincident with J5 (roll axis)
j6_loc = j5_loc

# Position base parts
# Lower the column slightly to sit under the yoke plate
positioned_column = column_base.located(Location((0, 0, column_render_height / 2.0 - j2_yoke_plate_thickness))) # Lower base slightly

# --- J2 Yoke Assembly --- START
# Assemble the yoke components relative to a local origin (center of motor plate face?)
# Orient so that the side plate bore axis aligns with World Y (J2 axis)

# Motor plate position (local origin) - Rotated 90 deg around Y, then centered at j2_loc
yoke_mp_loc = Rotation(0, 90, 0) # Rotate plate's XY plane to world XZ plane

# Side plate positions relative to motor plate center
# Side plates are built in XY plane, need rotation & positioning
side_plate_base_rot = Rotation(0, 90, 90) # Rotate side plate XY plane to world YZ plane
sp_offset_z = j2_yoke_width / 2.0 + j2_yoke_plate_thickness / 2.0 # Offset from center
yoke_sp_left_loc = Location((0, 0, -sp_offset_z)) * side_plate_base_rot
yoke_sp_right_loc = Location((0, 0, sp_offset_z)) * side_plate_base_rot

# Actuator position - gearbox output flange face aligns with motor plate front face
# Actuator built along X, needs rotation & positioning
actuator_align_rot = Rotation(0, 0, 90) # Rotate actuator X axis to align with Yoke's local Y axis
# Position back of motor relative to yoke center
actuator_pos_offset = Location((0, -(gearbox_length + nema23_length + j2_yoke_plate_thickness / 2.0) , 0))
j2_actuator_loc = actuator_align_rot * actuator_pos_offset

j2_yoke_assembly_compound = Compound(label="J2_Yoke_Assembly", children=[
    j2_yoke_mp.located(yoke_mp_loc),
    j2_yoke_sp_left.located(yoke_sp_left_loc),
    j2_yoke_sp_right.located(yoke_sp_right_loc),
    j2_actuator_real.located(j2_actuator_loc)
])

# Position the entire yoke assembly at the J2 pivot
positioned_j2_yoke = j2_yoke_assembly_compound.located(j2_loc)
# --- J2 Yoke Assembly --- END

# --- Reposition Upper Arm, Forearm, Flange based on J2 Yoke --- START
# Upper arm starts centered within the J2 yoke bore (which is centered at j2_loc)
# Arm built along X, position its start at j2_loc and extend along +X
upper_arm_start_loc = j2_loc
positioned_upper_arm = upper_arm.located(upper_arm_start_loc * Location((upper_arm_length / 2.0, 0, 0)))

# Recalculate J3 location based on positioned upper arm
j3_actual_loc = upper_arm_start_loc * Location((upper_arm_length, 0, 0)) # End of upper arm

# Forearm starts at J3 actual location
# Forearm built along X, position its start at j3_actual_loc and extend along +X
forearm_start_loc = j3_actual_loc
positioned_forearm = forearm.located(forearm_start_loc * Location((forearm_length / 2.0, 0, 0)))

# Recalculate J4, J5, J6 locations
j4_actual_loc = forearm_start_loc
j5_actual_loc = forearm_start_loc * Location((forearm_length, 0, 0))
j6_actual_loc = j5_actual_loc

# Tool Flange at J6 actual location
# Flange built along Z, rotate to align with arm X axis
positioned_tool_flange = tool_flange.located(j6_actual_loc * Rotation(0, -90, 0))
# --- Reposition Upper Arm, Forearm, Flange based on J2 Yoke --- END

# --- Position other Actuators (Approximate - need yokes) ---
# J1 - Below column base
positioned_j1_actuator = j1_actuator.located(
    Location((0, 0, -nema23_length)) * Rotation(0, 90, 0)
)

# J3 - Needs a yoke. Place near J3 actual location for now.
positioned_j3_actuator = j3_actuator.located(
     j3_actual_loc * Location((0, -(nema23_length + gearbox_length), 0)) * Rotation(0, 0, 90) # Approx pos
)

# Create the final assembly compound
arm_assembly = Compound(label="FROGArm_Assembly", children=[
    positioned_column,
    positioned_upper_arm,
    positioned_forearm,
    # positioned_j2_actuator, # Removed placeholder
    positioned_j2_yoke, # Add the whole yoke assembly
    positioned_j1_actuator, # Still placeholder position
    positioned_j3_actuator, # Still placeholder position
    positioned_tool_flange,
    # TODO: Add J1 mount, J3 Yoke, J4/5/6 mechanisms
])


# --- Export ---

# Read output paths from environment variables set by Makefile or use defaults
step_output_path = os.environ.get("STEP_OUTPUT_PATH", "arm_assembly.step")
stl_output_path = os.environ.get("STL_OUTPUT_PATH", "arm_assembly.stl")

print(f"Python script (build123d) running for Arm Assembly...")
print(f"STEP output path: {step_output_path}")
print(f"STL output path: {stl_output_path}")

# Ensure the output directory exists
os.makedirs(os.path.dirname(step_output_path), exist_ok=True)
os.makedirs(os.path.dirname(stl_output_path), exist_ok=True)

try:
    export_step(arm_assembly, step_output_path)
    print(f"Successfully exported STEP to {step_output_path}")
except Exception as e:
    print(f"Error exporting STEP: {e}")

try:
    # Exporting STL for large assemblies can be slow and memory intensive
    export_stl(arm_assembly, stl_output_path, tolerance=0.1, angular_tolerance=0.3)
    print(f"Successfully exported STL to {stl_output_path}")
except Exception as e:
    print(f"Error exporting STL: {e}")

print("Python script (build123d) finished for Arm Assembly.")

# --- Optional: Show in Viewer ---
# from ocp_vscode import show
# if "show" in locals():
#    show(arm_assembly)