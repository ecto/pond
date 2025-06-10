"""Integrated Motor-Gearbox Assembly Component Builder."""
import os
from build123d import export_step, export_stl, Compound
from math import pi

from models.actuators.base import ActuatorParams
from models.actuators.shell import build_shell
from models.actuators.stator import build_stator_core
from models.actuators.rotor import build_rotor_hub
from models.actuators.gearbox import (
    build_cycloid_disc,
    build_pin_ring,
    build_eccentric_sleeve,
    build_output_flange,
)
from models.actuators.back_plate import build_back_plate

# Medium actuator parameters (6908 bearing, 105 mm OD)
# Adjusted for proper 1mm air gap
params = ActuatorParams(
    name="medium",
    outer_diameter=105.0,
    housing_height=70.0,  # Increased from 45mm to fit 40mm magnets
    wall_thickness=3.0,
    bearing_id=40.0,
    bearing_od=62.0,
    bearing_thickness=12.0,
    shaft_housing_height=15.0,
    stator_teeth=12,
    tooth_length=11.0,  # Reduced to accommodate 5mm thick magnets with 1mm air gap
    tooth_width=7.0,
    magnets_count=10,  # Changed from 8 to 10 for better 12-slot/10-pole configuration
    magnet_length=40.0,
    magnet_width=10.0,
    magnet_thickness=5.0,  # Back to actual magnet thickness
    magnet_radius=30.0,  # Adjusted for 1mm air gap with 5mm magnets
    tooth_tip_width=6.0,
    # Gear parameters tuned for 3D printing
    flexspline_teeth=100,
    circular_spline_teeth=102,
    gear_module=0.4,
)

# Build components
shell_part = build_shell(params)
stator_part = build_stator_core(params)
rotor_part = build_rotor_hub(params)

# Cycloidal reducer components
pin_ring_part = build_pin_ring()

# Two discs 180°/lobes apart (1-lobe phase shift = 2*pi/29 with 29 pins, but disc lobes=27 so 1 lobe = 2*pi/27)
disc_a_part = build_cycloid_disc()
disc_b_part = build_cycloid_disc(phase=pi/27)  # phase shift one lobe

# Position cycloidal components: place mid-plane at wave_gen_mid for now
rotor_magnetic_height = params.housing_height - 2 * (params.bearing_thickness + 1)
transition_height = 5  # must match rotor.py
wave_gen_height = 12   # must match rotor.py
wave_gen_mid = rotor_magnetic_height + transition_height + wave_gen_height / 2

disc_thickness = 10.0
ring_thickness = 8.0

disc_z = wave_gen_mid - disc_thickness / 2
ring_z = wave_gen_mid - ring_thickness / 2

disc_a_part = disc_a_part.translate((0, 0, disc_z))
disc_b_part = disc_b_part.translate((0, 0, disc_z + 1.0))  # 1 mm axial offset with shim
pin_ring_part = pin_ring_part.translate((0, 0, ring_z))

# Add eccentric sleeve and output flange parts
eccentric_part = build_eccentric_sleeve()
output_flange_part = build_output_flange()

# Position eccentric sleeve concentric with rotor shaft (global axis), boss into disc bore
eccentric_length = 20.0
eccentric_z = disc_z - 1.0  # start slightly below discs, passes through
eccentric_part = eccentric_part.translate((0, 0, eccentric_z))

# Position output flange above discs
output_thickness = 8.0
flange_z = disc_z + disc_thickness + 0.5  # 0.5 mm clearance
output_flange_part = output_flange_part.translate((0, 0, flange_z))

# Add back plate
back_plate_part = build_back_plate(params)

# ---- Export logic ----
step_out = os.environ.get("STEP_OUTPUT_PATH", "medium_actuator.step")
stl_out = os.environ.get("STL_OUTPUT_PATH", "medium_actuator.stl")

print("Python script (build123d) running for Medium Actuator (cycloidal)…")
print("  STEP output:", step_out)
print("  STL  output:", stl_out)

# ---- Combined assembly for reference ----
combined = Compound(
    label="medium_actuator_cycloidal_asm",
    children=[
        shell_part,
        stator_part,
        rotor_part,
        pin_ring_part,
        disc_a_part,
        disc_b_part,
        eccentric_part,
        output_flange_part,
        back_plate_part,
    ],
)

# Export combined assembly (reference only)
export_step(combined, step_out)
export_stl(combined, stl_out)

# Export individual printable parts
export_stl(shell_part, stl_out.replace(".stl", "_shell.stl"))
export_stl(stator_part, stl_out.replace(".stl", "_stator.stl"))
export_stl(rotor_part, stl_out.replace(".stl", "_rotor.stl"))
export_stl(pin_ring_part, stl_out.replace(".stl", "_pin_ring.stl"))
export_stl(disc_a_part, stl_out.replace(".stl", "_disc_a.stl"))
export_stl(disc_b_part, stl_out.replace(".stl", "_disc_b.stl"))
export_stl(eccentric_part, stl_out.replace(".stl", "_eccentric.stl"))
export_stl(output_flange_part, stl_out.replace(".stl", "_output_flange.stl"))
export_stl(back_plate_part, stl_out.replace(".stl", "_back_plate.stl"))

print("Finished exporting Medium actuator components.")
print("  - Shell (housing)")
print("  - Stator core")
print("  - Rotor with wave generator")
print("  - Pin ring")
print("  - Disc A")
print("  - Disc B")
print("  - Eccentric sleeve")
print("  - Output flange")
print("  - Back plate")