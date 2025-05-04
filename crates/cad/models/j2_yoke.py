"""
FROG J2 Yoke Assembly using build123d
"""
import os
from build123d import *

# --- Parameters ---

# Material
plate_thickness = 6.0 # Thickness of the yoke plates (mm)

# Yoke Dimensions
yoke_width = 100.0 # Internal width between side plates
yoke_height = 120.0 # Overall height of the side plates
yoke_depth = 80.0  # Overall depth (front-to-back) of the side plates
side_plate_fillet = 5.0 # Fillet radius for corners

# Upper Arm Tube Connection (J3 Axis)
upper_arm_tube_od = 80.0 # Outer diameter of the upper arm tube
upper_arm_bearing_bore = 40.0 / 2.0 # Bearing bore radius in side plates
upper_arm_bearing_od = 62.0 # Assumed bearing outer diameter
upper_arm_bearing_width = 16.0 # Assumed bearing width

# J1 Output Connection (Bottom)
j1_mount_hole_radius = 6.5 / 2.0 # M6 clearance radius
j1_mount_hole_pattern_radius = 70.0 / 2.0
j1_mount_hole_center_y = -yoke_height / 2.0 + 15.0

# J2 Motor (NEMA 23)
nema23_hole_spacing = 47.14
nema23_mount_hole_radius = 5.5 / 2.0 # M5 clearance radius
nema23_center_bore_radius = 38.0 / 2.0

# Fasteners (simplified representation)
fastener_hole_radius = 5.5 / 2.0 # M5 clearance radius
fastener_offset = 10.0 # Offset from corners

# --- Build Parts ---

# Build Side Plate
with BuildPart() as side_plate_builder:
    # Base shape with fillets
    with BuildSketch() as side_plate_sk:
        RectangleRounded(yoke_depth, yoke_height, side_plate_fillet)
    extrude(amount=plate_thickness)

    # Holes need to be positioned relative to the extruded part's center
    # Get the center of the top face for reference
    top_face_center = side_plate_builder.faces().filter_by(Axis.Z)[-1].center()

    # J3 Bearing Bore (centered on the plate)
    with BuildSketch(Plane.XY.offset(plate_thickness / 2)) as j3_bore_sk:
         Circle(upper_arm_bearing_bore)
    extrude(amount=-plate_thickness, mode=Mode.SUBTRACT) # Subtract through the plate

    # J1 Mounting Holes (positioned relative to bottom edge)
    # Position reference for polar locations is relative to the part's origin
    with Locations((0, j1_mount_hole_center_y, 0)):
        with PolarLocations(radius=j1_mount_hole_pattern_radius, count=4, start_angle=45): # Use as context manager
            Hole(radius=j1_mount_hole_radius, depth=plate_thickness) # Indent Hole correctly

    # Assembly Fastener Holes (Top/Bottom Corners)
    fc_x = yoke_depth / 2.0 - fastener_offset
    fc_y = yoke_height / 2.0 - fastener_offset
    with Locations(
        ( fc_x,  fc_y, 0),
        (-fc_x,  fc_y, 0),
        ( fc_x, -fc_y, 0),
        (-fc_x, -fc_y, 0)
    ):
        Hole(radius=fastener_hole_radius, depth=plate_thickness)

side_plate = side_plate_builder.part

# Build Motor Mount Plate
motor_mount_width = yoke_depth
motor_mount_height = yoke_width # Plate fits *between* side plates

with BuildPart() as motor_plate_builder:
    # Base rectangle
    with BuildSketch() as motor_plate_sk:
        Rectangle(motor_mount_width, motor_mount_height)
    extrude(amount=plate_thickness)

    # NEMA 23 Center Bore
    with BuildSketch(Plane.XY.offset(plate_thickness / 2)) as nema_center_sk:
        Circle(nema23_center_bore_radius)
    extrude(amount=-plate_thickness, mode=Mode.SUBTRACT)

    # NEMA 23 Mounting Holes
    nema_spacing = nema23_hole_spacing / 2.0
    with Locations(
        ( nema_spacing,  nema_spacing, 0),
        (-nema_spacing,  nema_spacing, 0),
        ( nema_spacing, -nema_spacing, 0),
        (-nema_spacing, -nema_spacing, 0)
    ):
         Hole(radius=nema23_mount_hole_radius, depth=plate_thickness)

    # Assembly Fastener Holes (Edges)
    fa_x = motor_mount_width / 2.0 - fastener_offset
    fa_y = motor_mount_height / 2.0 - fastener_offset # Adjusted for plate height
    with Locations(
        ( fa_x,  fa_y, 0),
        (-fa_x,  fa_y, 0),
        ( fa_x, -fa_y, 0),
        (-fa_x, -fa_y, 0)
    ):
         Hole(radius=fastener_hole_radius, depth=plate_thickness)

motor_plate = motor_plate_builder.part

# --- Assembly ---

# Position parts
left_plate_loc = Location((-yoke_width / 2.0, 0, yoke_height / 2.0), (90, 0, 0))
right_plate_loc = Location((yoke_width / 2.0, 0, yoke_height / 2.0), (90, 0, 180))
motor_plate_loc = Location((0, -yoke_depth / 2.0, yoke_height / 2.0), (0, 90, 0))

assembly = Compound(children=[
    side_plate.located(left_plate_loc),
    side_plate.located(right_plate_loc),
    motor_plate.located(motor_plate_loc)
])

# --- Export ---

# Read output paths from environment variables set by Makefile
step_output_path = os.environ.get("STEP_OUTPUT_PATH", "j2_yoke.step")
stl_output_path = os.environ.get("STL_OUTPUT_PATH", "j2_yoke.stl")

print(f"Python script (build123d) running for J2 Yoke...")
print(f"STEP output path: {step_output_path}")
print(f"STL output path: {stl_output_path}")

try:
    export_step(assembly, step_output_path)
    print(f"Successfully exported STEP to {step_output_path}")
except Exception as e:
    print(f"Error exporting STEP: {e}")

try:
    export_stl(assembly, stl_output_path)
    print(f"Successfully exported STL to {stl_output_path}")
except Exception as e:
    print(f"Error exporting STL: {e}")

print("Python script (build123d) finished for J2 Yoke.")