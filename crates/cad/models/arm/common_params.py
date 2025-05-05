"""Common dimension and parameter definitions for the FROG arm CAD models."""

from build123d import Axis

# --- Link Dimensions (mm) ---
column_od = 100.0
column_thickness = 6.0
column_render_height = 100.0  # for CAD visualisation only (full arm column is 500 mm)

upper_arm_od = 80.0
upper_arm_thickness = 4.0
upper_arm_length = 300.0

forearm_od = 60.0
forearm_thickness = 4.0
forearm_length = 250.0

# Derived radii
column_ir = column_od / 2 - column_thickness
column_or = column_od / 2
upper_arm_ir = upper_arm_od / 2 - upper_arm_thickness
upper_arm_or = upper_arm_od / 2
forearm_ir = forearm_od / 2 - forearm_thickness
forearm_or = forearm_od / 2

# --- Actuator Dimensions (NEMA-23 closed-loop + 20:1 gearbox) ---
nema23_face_size = 57.0
nema23_length = 76.0
nema23_hole_spacing = 47.14
nema23_mount_hole_radius = 5.5 / 2  # M5 clr
nema23_center_bore_radius = 38.0 / 2
gearbox_face_diam = nema23_face_size
gearbox_length = 80.0
gearbox_output_flange_diam = 40.0
gearbox_output_flange_thickness = 5.0

# --- Tool-flange (ISO-9409-1-50-4-M6) ---
tool_flange_diam = 50.0
tool_flange_thickness = 8.0
tool_flange_pcd = 31.5
tool_flange_hole_radius = 6.5 / 2

tool_flange_pin_diam = 6.0  # Ø6 H7 dowel

# --- Joint axes (world frame assumptions) ---
j1_axis = Axis.Z
j2_axis = Axis.Y
j3_axis = Axis.Y
j4_axis = Axis.X
j5_axis = Axis.Y
j6_axis = Axis.X