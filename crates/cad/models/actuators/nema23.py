"""NEMA 23 Actuator (Motor + Gearbox) Component Builder."""
from build123d import *
# Use relative import to access common_params in the sibling 'arm' package
from models.arm import common_params as cp

def build_nema23_actuator() -> Part:
    """Builds a simplified NEMA-23 motor + 20:1 gearbox assembly."""
    with BuildPart() as p:
        # Gearbox Body
        with BuildSketch(Plane.YZ) as s:
            Circle(cp.gearbox_face_diam / 2)
        extrude(amount=cp.gearbox_length)
        # Gearbox Output Flange
        with BuildSketch(Plane.YZ.offset(cp.gearbox_length)) as f:
            Circle(cp.gearbox_output_flange_diam / 2)
        extrude(amount=cp.gearbox_output_flange_thickness)
        # Motor Body (behind gearbox)
        with BuildSketch(Plane.YZ.offset(0)) as m:
            Rectangle(cp.nema23_face_size, cp.nema23_face_size)
        extrude(amount=-cp.nema23_length)
    p.part.label = "NEMA23_Actuator"
    # Part origin is implicitly at the center of the gearbox back face (YZ plane at X=0)
    # Extrusion happens along +X for gearbox, -X for motor
    return p.part

if __name__ == "__main__":
    from ocp_vscode import show
    actuator = build_nema23_actuator()
    print(f"Actuator Bounding Box: {actuator.bounding_box()}")
    show(actuator)