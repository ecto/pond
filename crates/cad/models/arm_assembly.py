"""
FROG Arm Assembly – Top-Level Model (build123d)
Combines the pre-built sub-assemblies into a single scene and exports STEP/STL.
"""

import os
from build123d import *

# --- Imports for sub-assemblies & common parameters ---
from arm import common_params as cp
from arm.base_column import build_base_column
from arm.j2_yoke_assembly import build_j2_yoke_assembly
from arm.upper_arm import build_upper_arm
from arm.forearm import build_forearm
from arm.wrist import build_wrist
from arm.j3_yoke_assembly import build_j3_yoke_assembly

# NOTE: Individual actuators are already included inside these sub-assemblies
# (e.g. J1 inside base_column, J2 inside j2_yoke_assembly, etc.)

# -----------------------------------------------------------------------------
# Build sub-assemblies (local origins)
# -----------------------------------------------------------------------------
base_col_asm   = build_base_column()        # Origin = J1 pivot (world origin)
j2_yoke_asm    = build_j2_yoke_assembly()   # Origin = J2 pivot
upper_arm_asm  = build_upper_arm()          # Origin = J2 pivot
forearm_asm    = build_forearm()            # Origin = J3 pivot
wrist_asm      = build_wrist()              # Origin = J5/J6 pivot

# -----------------------------------------------------------------------------
# Define joint locations in world frame
# -----------------------------------------------------------------------------
# World origin (0,0,0) is the J1 axis centre at the base.

j1_loc = Location((0, 0, 0))

j2_loc = Location((0, 0, cp.column_render_height))
# Upper arm length runs +X from J2 → J3
j3_loc = j2_loc * Location((cp.upper_arm_length, 0, 0))
# Forearm length runs +X from J4 (coincident with J3) → J5
j5_loc = j3_loc * Location((cp.forearm_length, 0, 0))
# J6 coincident with J5 for roll; wrist assembly covers J4/5/6 internally

# -----------------------------------------------------------------------------
# Position sub-assemblies in world frame
# -----------------------------------------------------------------------------
positioned_base_col  = base_col_asm.located(j1_loc)
positioned_j2_yoke   = j2_yoke_asm.located(j2_loc)
positioned_upper_arm = upper_arm_asm.located(j2_loc)
positioned_j3_yoke   = build_j3_yoke_assembly().located(j3_loc)
positioned_forearm   = forearm_asm.located(j3_loc)
positioned_wrist     = wrist_asm.located(j5_loc)

# -----------------------------------------------------------------------------
# Create final top-level assembly
# -----------------------------------------------------------------------------
arm_assembly = Compound(
    label="FROGArm_Assembly",
    children=[
        positioned_base_col,
        positioned_j2_yoke,
        positioned_upper_arm,
        positioned_j3_yoke,
        positioned_forearm,
        positioned_wrist,
    ],
)

# -----------------------------------------------------------------------------
# Export
# -----------------------------------------------------------------------------
step_output_path = os.environ.get("STEP_OUTPUT_PATH", "arm_assembly.step")
stl_output_path  = os.environ.get("STL_OUTPUT_PATH",  "arm_assembly.stl")

print("Python script (build123d) running for Arm Assembly…")
print(f"STEP output path: {step_output_path}")
print(f"STL  output path: {stl_output_path}")

os.makedirs(os.path.dirname(step_output_path), exist_ok=True)
os.makedirs(os.path.dirname(stl_output_path),  exist_ok=True)

try:
    export_step(arm_assembly, step_output_path)
    print(f"Successfully exported STEP → {step_output_path}")
except Exception as e:
    print(f"Error exporting STEP: {e}")

try:
    export_stl(arm_assembly, stl_output_path, tolerance=0.1, angular_tolerance=0.3)
    print(f"Successfully exported STL  → {stl_output_path}")
except Exception as e:
    print(f"Error exporting STL: {e}")

print("Python script (build123d) finished for Arm Assembly.")

# -----------------------------------------------------------------------------
# Optional viewer (uncomment when running in VS Code with OCP addon)
# -----------------------------------------------------------------------------
# from ocp_vscode import show
# show(arm_assembly)