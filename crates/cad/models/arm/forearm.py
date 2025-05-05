"""Forearm tube (local origin at J3 pivot, extends +X)."""
from build123d import *
from models.arm import common_params as cp
from models.actuators.nema23 import build_nema23_actuator


def build_forearm() -> Compound:
    with BuildPart() as tube:
        with BuildSketch(Plane.YZ) as sk:
            Circle(cp.forearm_or)
            Circle(cp.forearm_ir, mode=Mode.SUBTRACT)
        extrude(amount=cp.forearm_length)
    tube.part.label = "ForearmTube"
    tube_start = tube.part.located(Location((0, 0, -cp.forearm_or))) # centre @ bore
    # J4 actuator at proximal end (local origin), offset -Y, rotated so X aligns with actuator axis
    actuator = build_nema23_actuator().located(Location((0, -(cp.nema23_length+cp.gearbox_length),0)) * Rotation(0,0,90))
    return Compound(label="ForearmAssembly", children=[tube_start, actuator])


if __name__ == "__main__":
    from ocp_vscode import show
    show(build_forearm())