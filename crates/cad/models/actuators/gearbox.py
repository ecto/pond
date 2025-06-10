"""Strain wave (harmonic drive) gearbox components."""

from models.actuators.base import ActuatorParams
from build123d import *
from math import cos, sin, radians, pi

__all__ = [
    "build_cycloid_disc",
    "build_pin_ring",
    "build_eccentric_sleeve",
    "build_output_flange",
]


def build_cycloid_disc(lobes: int = 27,
                       pin_count: int = 29,
                       pin_circle_dia: float = 72.0,
                       thickness: float = 10.0,
                       eccentricity: float | None = None,
                       phase: float = 0.0,
                       bore_dia: float = 18.0) -> Part:
    """Return one cycloidal disc (flat) for a pin count / lobe count set.

    Uses a sampled epicycloid approximation good enough for printing.
    phase shifts the disc by an angle (radians)."""
    if eccentricity is None:
        # Classic formula e = (Dp - Dd)/ (2*Nlobes)
        disc_od = pin_circle_dia - 6  # 3 mm clearance each side from plate ID
        eccentricity = (pin_circle_dia - disc_od) / (2 * lobes)
    else:
        disc_od = pin_circle_dia - 6  # fallback

    base_radius = (pin_circle_dia - 6) / 2  # approximate mid-radius of lobes

    # Build profile
    pts: list[tuple[float, float]] = []
    steps = 720  # 0.5° resolution
    for i in range(steps):
        theta = 2 * pi * i / steps
        r = base_radius + eccentricity * cos(lobes * theta + phase)
        x = r * cos(theta)
        y = r * sin(theta)
        pts.append((x, y))

    with BuildPart() as bp:
        with BuildSketch(Plane.XY) as s:
            with BuildLine() as l:
                Polyline(*pts, close=True)
            make_face()

        # Extrude base disc first
        extrude(amount=thickness)

        # Central bore for eccentric boss
        with BuildSketch(Plane.XY) as s:
            Circle(bore_dia / 2)
        extrude(amount=thickness, mode=Mode.SUBTRACT)

        # Add kidney slots for output pins (6 pins)
        slot_pin_count = 6
        slot_circle = (pin_circle_dia - 20) / 2  # inside lobes
        slot_length = 8.0
        slot_width = 6.5  # clearance for 6 mm pins
        for i in range(slot_pin_count):
            angle = i * 360 / slot_pin_count
            x = slot_circle * cos(radians(angle))
            y = slot_circle * sin(radians(angle))
            with BuildSketch(Plane.XY.offset(thickness/2)) as s:
                with Locations((x, y)):
                    Rectangle(slot_width, slot_length, rotation=angle)
            extrude(amount=thickness, mode=Mode.SUBTRACT)

    bp.part.label = f"CycloidDisc_{lobes}lobes"
    return bp.part


def build_pin_ring(pin_count: int = 29,
                   pin_diameter: float = 6.1,
                   pin_circle_dia: float = 72.0,
                   thickness: float = 8.0) -> Part:
    """Return rigid ring plate with through-holes for steel pins.

    Pins are inserted from one side; holes are clearance (0.1 mm)."""
    outer_radius = pin_circle_dia / 2 + pin_diameter * 2  # leave material around pins
    inner_radius = pin_circle_dia / 2 - pin_diameter      # generous central clearance

    with BuildPart() as bp:
        # Base plate
        with BuildSketch(Plane.XY) as s:
            Circle(outer_radius)
            Circle(inner_radius, mode=Mode.SUBTRACT)
        extrude(amount=thickness)

        # Drill pin holes
        for i in range(pin_count):
            angle = i * 360 / pin_count
            r = pin_circle_dia / 2
            x = r * cos(radians(angle))
            y = r * sin(radians(angle))
            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    Circle(pin_diameter / 2)  # clearance hole
            extrude(amount=thickness, mode=Mode.SUBTRACT)

    bp.part.label = f"PinRing_{pin_count}pins"
    return bp.part

# -----------------------------------------------------------------------------
# Helper: generate trapezoidal tooth outline (returns list[tuple[float,float]])
# -----------------------------------------------------------------------------


def _trapezoid_tooth(root_r: float, tip_r: float, base_ang_width: float, tip_ang_width: float) -> list[tuple[float, float]]:
    """Return 4-point trapezoid tooth outline in polar space converted to XY.

    Points ordered CCW starting at root left → root right → tip right → tip left.
    root_r: radius of tooth root (external gear) or inner radius (internal gear)
    tip_r : radius of tooth tip (external) or root (internal inverted)
    base_ang_width: total angular width of tooth at root (radians)
    tip_ang_width:  total angular width of tooth at tip  (radians)"""

    root_half = base_ang_width / 2
    tip_half = tip_ang_width / 2

    # Root left & right
    pts = []
    pts.append((root_r * cos(-root_half), root_r * sin(-root_half)))
    pts.append((root_r * cos(root_half), root_r * sin(root_half)))
    # Tip right & left
    pts.append((tip_r * cos(tip_half), tip_r * sin(tip_half)))
    pts.append((tip_r * cos(-tip_half), tip_r * sin(-tip_half)))
    return pts

# -------------------------------
# Additional components for full cycloidal reducer
# -------------------------------

def build_eccentric_sleeve(
    eccentricity: float = 2.7,
    shaft_dia: float = 15.0,
    boss_dia: float = 18.0,
    length: float = 20.0,
) -> Part:
    """Create an eccentric sleeve that converts concentric motor rotation to the disc wobble.

    The sleeve has an inner bore (shaft_dia) concentric with global Z.
    The outer cylindrical boss (boss_dia) is offset +X by *eccentricity* so that
    its axis drives the cycloid disc centre hole."""

    with BuildPart() as bp:
        # Outer boss profile but bore subtracted at shaft centre
        with BuildSketch(Plane.XY) as s:
            Circle(boss_dia / 2)
            Circle(shaft_dia / 2, mode=Mode.SUBTRACT)
        extrude(amount=length)

    # Shift so that boss axis aligns with global axis, leaving the bore offset
    bp.part = bp.part.translate((eccentricity, 0, 0))
    bp.part.label = "EccentricSleeve"
    return bp.part


def build_output_flange(
    pin_count: int = 6,
    pin_diameter: float = 6.1,
    pin_circle_dia: float = 50.0,
    thickness: float = 8.0,
    bore_dia: float = 25.0,
    mount_hole_count: int = 6,
    mount_hole_diameter: float = 3.4,  # clearance for M3 screws
    mount_circle_dia: float | None = None,  # default set relative to boss_dia
) -> Part:
    """Flat output flange plate with through-holes for the six output pins."""

    outer_radius = pin_circle_dia / 2 + 8  # leave material beyond pins

    with BuildPart() as bp:
        # Base plate with centre bore
        with BuildSketch(Plane.XY) as s:
            Circle(outer_radius)
            Circle(bore_dia / 2, mode=Mode.SUBTRACT)
        extrude(amount=thickness)

        # Add centre boss for bearing inner race (40 mm)
        boss_dia = 39.6  # slight clearance for 40 mm inner race
        boss_down = thickness / 2  # 4 mm down
        boss_up = 8.0  # 8 mm above plate for coupling

        # Downward boss (into bearing)
        with BuildSketch(Plane.XY.offset(-boss_down)) as s:
            Circle(boss_dia / 2)
        extrude(amount=boss_down, mode=Mode.ADD, both=False)

        # Upward boss
        with BuildSketch(Plane.XY.offset(thickness)) as s:
            Circle(boss_dia / 2)
        extrude(amount=boss_up, mode=Mode.ADD, both=False)

        # Mounting holes in the central boss for attaching output coupling
        if mount_hole_count > 0 and mount_hole_diameter > 0:
            # Default circle diameter: slightly smaller than boss OD so holes are in the boss wall
            effective_circle_dia = (
                mount_circle_dia if mount_circle_dia is not None else boss_dia - 6.0  # 3 mm wall on each side
            )
            for i in range(mount_hole_count):
                angle = i * 360 / mount_hole_count
                r = effective_circle_dia / 2
                x = r * cos(radians(angle))
                y = r * sin(radians(angle))
                # Start sketch on the TOP of the boss and cut downward (negative amount)
                with BuildSketch(Plane.XY.offset(thickness + boss_up)) as s:
                    with Locations((x, y)):
                        Circle(mount_hole_diameter / 2)
                # Cut down through upward boss, flange plate, and downward boss
                extrude(amount=-(thickness + boss_up + boss_down), mode=Mode.SUBTRACT, both=False)

        # Pin holes
        for i in range(pin_count):
            angle = i * 360 / pin_count
            r = pin_circle_dia / 2
            x = r * cos(radians(angle))
            y = r * sin(radians(angle))
            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    Circle(pin_diameter / 2)
            extrude(amount=thickness, mode=Mode.SUBTRACT)

    bp.part.label = "OutputFlange"
    return bp.part