"""Direct-drive wrist assembly (no belts).

Origin at J5/J6 pivot. Contains:
  • J5 pitch actuator offset ‑Y
  • J6 roll actuator coaxial with flange
  • ISO-9409-1-50-4-M6 tool flange
"""
from build123d import *
from models.arm import common_params as cp
# Import centralized actuator builder
from models.actuators.nema23 import build_nema23_actuator


def _build_tool_flange() -> Part:
    with BuildPart() as p:
        with BuildSketch(Plane.XY) as sk:
            Circle(cp.tool_flange_diam/2)
            with PolarLocations(radius=cp.tool_flange_pcd/2, count=4):
                Circle(cp.tool_flange_hole_radius, mode=Mode.SUBTRACT)
        extrude(amount=cp.tool_flange_thickness)
    return p.part.located(Location((0,0,-cp.tool_flange_thickness/2)))


def build_wrist() -> Compound:
    """Returns wrist assembly compound centred at J5/J6 pivot.

    Components:
      • J5 pitch actuator (axis Y) – offset -Y.
      • J6 roll actuator (axis X) – coaxial with tool flange, sits in front of J5 gearbox.
      • ISO-9409-1-50-4-M6 tool flange.
    """
    # J5 pitch actuator: rotate so actuator X axis aligns world Y, offset along -Y
    j5_act = build_nema23_actuator().located(
        Location((0, -(cp.nema23_length + cp.gearbox_length), 0)) * Rotation(0, 0, 90)
    )

    # J6 roll actuator: coaxial with tool flange (world X), placed in front of J5 gearbox
    j6_offset_x = cp.gearbox_length + cp.gearbox_output_flange_thickness
    j6_act = build_nema23_actuator().located(Location((j6_offset_x, 0, 0)))

    flange = _build_tool_flange().located(Location((j6_offset_x + cp.gearbox_length, 0, 0)) * Rotation(0, -90, 0))

    return Compound(label="WristAssembly", children=[j5_act, j6_act, flange])

if __name__ == "__main__":
    from ocp_vscode import show
    show(build_wrist())