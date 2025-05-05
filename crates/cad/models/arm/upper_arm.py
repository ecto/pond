"""Upper arm link (tube) with placeholder J3 actuator (local origin at J2 pivot)."""
from build123d import *
from models.arm import common_params as cp
# Import centralized actuator builder
from models.actuators.nema23 import build_nema23_actuator


def _build_nema23_actuator() -> Part:
    with BuildPart() as p:
        with BuildSketch(Plane.YZ) as s:
            Circle(cp.gearbox_face_diam / 2)
        extrude(amount=cp.gearbox_length)
        with BuildSketch(Plane.YZ.offset(cp.gearbox_length)) as f:
            Circle(cp.gearbox_output_flange_diam / 2)
        extrude(amount=cp.gearbox_output_flange_thickness)
        with BuildSketch(Plane.YZ.offset(0)) as m:
            Rectangle(cp.nema23_face_size, cp.nema23_face_size)
        extrude(amount=-cp.nema23_length)
    p.part.label = "NEMA23_Actuator"
    return p.part


def build_upper_arm() -> Compound:
    """Returns compound centred at J2 pivot, extending +X."""
    # tube
    with BuildPart() as tube:
        with BuildSketch(Plane.YZ) as sk:
            Circle(cp.upper_arm_or)
            Circle(cp.upper_arm_ir, mode=Mode.SUBTRACT)
        extrude(amount=cp.upper_arm_length)
    tube.part.label = "UpperArmTube"
    tube_start = tube.part.located(Location((0, 0, -cp.upper_arm_or))) # centre @ bore

    return Compound(label="UpperArmAssembly", children=[tube_start])


if __name__ == "__main__":
    from ocp_vscode import show
    show(build_upper_arm())