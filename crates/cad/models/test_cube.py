# Placeholder for CadQuery/Build123d model

import os
# Import build123d
from build123d import *

# Read output paths from environment variables set by build.rs
step_output_path = os.environ.get("STEP_OUTPUT_PATH", "test_cube.step") # Default if not set
# Change OBJ to STL for build123d export
stl_output_path = os.environ.get("STL_OUTPUT_PATH", "test_cube.stl")   # Default if not set
# Note: build.rs still passes OBJ_OUTPUT_PATH env var, we just ignore it here
# Alternatively, modify build.rs to pass STL_OUTPUT_PATH

print(f"Python script (build123d) running...")
print(f"STEP output path: {step_output_path}")
print(f"STL output path: {stl_output_path}")

# Example (replace with actual model logic later):
# result = cq.Workplane("XY").box(10, 10, 10)

# Example export (add later):
# cq.exporters.export(result, 'output.step')
# cq.exporters.export(result, 'output.obj')

# --- Model Definition ---
# Create a simple 10x10x10 cube using build123d
result = Box(10, 10, 10)

# --- Export ---
try:
    # Export STEP file
    export_step(result, step_output_path)
    print(f"Successfully exported STEP to {step_output_path}")
except Exception as e:
    print(f"Error exporting STEP: {e}")
    # Potentially exit with an error code if export fails
    # import sys
    # sys.exit(1)

try:
    # Export STL file (replacing OBJ)
    # You might need to adjust tolerance or angular_tolerance for quality
    export_stl(result, stl_output_path)
    print(f"Successfully exported STL to {stl_output_path}")
except Exception as e:
    print(f"Error exporting STL: {e}")
    # import sys
    # sys.exit(1)

print("Python script (build123d) finished.")