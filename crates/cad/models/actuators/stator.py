from models.actuators.base import ActuatorParams
from build123d import *
from math import radians, cos, sin, pi

__all__ = ["build_stator_core"]


COIL_COUNT = 6  # round coils, ABCABC sequence
INSERT_COUNT = 3
INSERT_RADIUS = 2.0  # pilot hole radius


def build_stator_core(p: ActuatorParams) -> Part:
    """Return printable coreless stator former with six round coil windows.

    The former is a 10-mm-thick disc (PLA) that holds six circular coils.
    Each window is a 45-mm OD ring; inner diameter 30 mm, matching the
    dimensions in notes/axial_flux_double_rotor.md.
    """

    disc_thickness = 8.0
    outer_r = 90 / 2  # 90 mm OD as per BoM
    inner_clear_r = 25  # 50 mm ID clearance for hub & gearbox

    with BuildPart() as bp:
        # Base solid disc
        with BuildSketch(Plane.XY) as s:
            Circle(outer_r)
            Circle(inner_clear_r, mode=Mode.SUBTRACT)
        extrude(amount=disc_thickness)

        # Cut six coil windows (26 mm OD / 8 mm ID) – fits without overlap
        coil_id = 8
        coil_od = 26
        coil_radius = outer_r - coil_od / 2 - 3  # maintain 3-mm land to outer rim
        for i in range(COIL_COUNT):
            ang = i * 360 / COIL_COUNT
            cx = coil_radius * cos(radians(ang))
            cy = coil_radius * sin(radians(ang))
            with BuildSketch(Plane.XY) as s:
                with Locations((cx, cy)):
                    Circle(coil_od / 2)
            extrude(amount=disc_thickness, mode=Mode.SUBTRACT)

            # Keep central core for stem attachment

        # Add optional V-groove wire channels (simple notches)
        for i in range(COIL_COUNT):
            ang = i * 360 / COIL_COUNT + 30  # between coils
            x = (outer_r - 2) * cos(radians(ang))
            y = (outer_r - 2) * sin(radians(ang))
            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    Rectangle(3, 2, rotation=ang)
            extrude(amount=disc_thickness, mode=Mode.SUBTRACT)

        # Pilot holes for M2.5 inserts to mount Hall-sensor PCB
        for i in range(INSERT_COUNT):
            ang = i * 360 / INSERT_COUNT
            r = inner_clear_r + 4
            x = r * cos(radians(ang))
            y = r * sin(radians(ang))
            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    Circle(INSERT_RADIUS)
            extrude(amount=disc_thickness, mode=Mode.SUBTRACT)

        # ------------------------------------------------------------------
        # Hex drive stems (ADD material) – ¼" hex profile for drill chuck
        # ------------------------------------------------------------------
        across_flats = 6.35  # ¼-inch hex driver
        hex_in_radius = across_flats / 2
        hex_out_radius = hex_in_radius / cos(pi / 6)  # vertex radius
        plate_thickness = 3.0

        for i in range(COIL_COUNT):
            ang = i * 360 / COIL_COUNT
            cx = coil_radius * cos(radians(ang))
            cy = coil_radius * sin(radians(ang))

            with BuildSketch(Plane.XY) as s:
                with Locations((cx, cy)):
                    pts = [
                        (hex_out_radius * cos(radians(60 * k + 30)),
                         hex_out_radius * sin(radians(60 * k + 30)))
                        for k in range(6)
                    ]
                    Polygon(*pts)
            extrude(amount=disc_thickness + plate_thickness, mode=Mode.ADD, both=True)

    bp.part.label = f"{p.name}_StatorFormer"
    return bp.part