"""Base column + J1 actuator sub-assembly (local origin at J1 pivot axis)."""
from build123d import *
from models.arm import common_params as cp
# Import centralized actuator builder
from models.actuators.nema23 import build_nema23_actuator


def _build_nema23_actuator() -> Part:
    """Re-implementation of the simplified NEMA-23 + gearbox solid."""
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


def build_base_column() -> Compound:
    """Returns a Compound centred at the J1 pivot (world origin)."""
    # Column tube (short visual section)
    with BuildPart() as col:
        Cylinder(radius=cp.column_or, height=cp.column_render_height)
        Cylinder(radius=cp.column_ir, height=cp.column_render_height, mode=Mode.SUBTRACT)
    column_part = col.part.located(Location((0, 0, -cp.column_render_height / 2)))  # top face at Z=0
    column_part.label = "ColumnTube"

    # Actuator pointing up (rotate X -> Z)
    actuator = build_nema23_actuator().located(Rotation(0, 90, 0))

    return Compound(label="BaseColumnAssembly", children=[column_part, actuator])


if __name__ == "__main__":
    from ocp_vscode import show
    show(build_base_column())