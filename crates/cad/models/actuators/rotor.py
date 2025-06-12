"""Rotor (double-sided axial-flux drum)

This part prints as *one* cylinder that carries magnets on both faces and
leaves a central cavity for the stator disc.  Key features:

1. 3 mm outer shell – good for PLA at 0.3 mm layers.
2. 5 mm magnet pockets + 1.8 mm washer recess per face.
3. 1 mm air-gap each side of an 8 mm copper stator.
4. Central bore Ø62.5 mm for two 6908 bearings.
5. 4 ×15 mm key-slot on inner bore so the rotor can be driven by a spanner
   during bench tests.
6. Tiny ▲ orientation mark on the "north" side so you always align Disc A.
"""

from models.actuators.base import ActuatorParams
from build123d import *
from math import cos, sin, radians

__all__ = ["build_rotor_hub"]


# --- Axial-flux double-rotor drum -------------------------------------------

def _add_cooling_fins(
    inner_r: float,
    outer_r: float,
    root_thickness: float = 1.6,
    tip_thickness: float = 0.8,
    fin_height: float = 4.0,  # total protrusion → 2 mm each face (both=True)
    count: int = 8,
    skew_deg: float = 5.0,
) -> Part:
    """Return a Part with swept, tapered cooling fins.

    The fins are trapezoidal in plan view (root thicker than tip) and are
    swept `skew_deg` so rotation draws air from the hub and ejects it through
    the stator windows.
    """

    with BuildPart() as bp:
        angle_step = 360 / count

        for i in range(count):
            ang_deg = i * angle_step + skew_deg  # include sweep in angular placement

            # Unit vectors
            theta = radians(ang_deg)
            ux, uy = cos(theta), sin(theta)            # radial direction
            vx, vy = -uy, ux                           # tangential direction

            # Centres of root and tip along swept radial line
            root_c = (inner_r * ux, inner_r * uy)
            tip_c  = (outer_r * ux, outer_r * uy)

            # Four corner points of the trapezoid fin
            pts = [
                (root_c[0] + vx * (root_thickness / 2), root_c[1] + vy * (root_thickness / 2)),
                (root_c[0] - vx * (root_thickness / 2), root_c[1] - vy * (root_thickness / 2)),
                (tip_c[0]  - vx * (tip_thickness  / 2), tip_c[1]  - vy * (tip_thickness  / 2)),
                (tip_c[0]  + vx * (tip_thickness  / 2), tip_c[1]  + vy * (tip_thickness  / 2)),
            ]

            with BuildSketch(Plane.XY) as s:
                Polygon(*pts)

            # Extrude symmetrically so fins protrude on both faces (total height = fin_height)
            extrude(amount=fin_height / 2, mode=Mode.ADD, both=True)

    return bp.part


def build_rotor_hub(p: ActuatorParams, *, split: bool = False, single_sided: bool = False) -> Part | Compound:
    """Return OUTER drum that carries two axial magnet rings.

    Geometry is derived from the axial-flux concept detailed in
    notes/axial_flux_double_rotor.md.  The printed drum is a single piece
    containing:
      • two 5-mm-deep magnet pockets (one per face)
      • a central 8-mm spacer web that sets the dual 1-mm air-gaps
      • recesses for stacked steel fender-washer back-iron
      • shallow radial cooling fins on both faces
    """

    # Key radii
    outer_radius = p.outer_diameter / 2
    inner_clear_r = p.bearing_od / 2 + 0.25  # clearance for 62 mm bearing OD

    # --- Axial stack heights ------------------------------------------------
    washer_depth = 1.8  # recess for back-iron washer

    # Extra clearance on magnet pocket depth so bars sit proud for adhesive,
    # then are sanded flush – prevents magnet over-travel during bonding.
    MAGNET_CLEARANCE = 0.2  # mm

    magnet_pocket_depth = p.magnet_thickness + MAGNET_CLEARANCE  # 5.0 + 0.2
    pocket_depth = washer_depth + magnet_pocket_depth  # ≈ 7.0 mm

    stator_thickness = 8.0  # copper pancake including face sheets
    air_gap = 1.0           # design air-gap each side of stator

    if single_sided:
        # One magnet ring, one washer stack, and a single air gap.
        drum_height = pocket_depth + air_gap + stator_thickness  # Compact single-sided drum
    else:
        drum_height = 2 * pocket_depth + 2 * air_gap + stator_thickness  # Double-sided

    with BuildPart() as bp:
        # Outer 3 mm shell
        with BuildSketch(Plane.XY) as s:
            Circle(outer_radius)
        extrude(amount=drum_height)

        # ------------------------------------------------------------------
        # Central bearing bore + 4 mm-wide keyway
        # ------------------------------------------------------------------
        with BuildSketch(Plane.XY) as s:
            Circle(inner_clear_r)
        extrude(amount=drum_height, mode=Mode.SUBTRACT)

        # Keyway slot (flat) – 4 mm wide ×3 mm deep, along +Y axis
        with BuildSketch(Plane.XY) as s:
            with Locations((0, inner_clear_r - 1.5)):
                Rectangle(4, 3)
        extrude(amount=drum_height, mode=Mode.SUBTRACT)

        # --- Magnet & washer recesses (top and bottom) ---
        safe_land = 3  # mm solid wall behind magnets
        recess_radius = outer_radius - safe_land - p.magnet_width/2

        faces = (0,) if single_sided else (0, drum_height - pocket_depth)
        for face in faces:
            # Washer recess first
            with BuildSketch(Plane.XY.offset(face)) as s:
                Circle(recess_radius)
            extrude(amount=washer_depth, mode=Mode.SUBTRACT)

            # Magnet pockets – 14 bars equally spaced, skewed 3°
            for i in range(p.magnets_count):
                ang = i * 360 / p.magnets_count + 3  # 3° skew
                x = (recess_radius - p.magnet_width / 2) * cos(radians(ang))
                y = (recess_radius - p.magnet_width / 2) * sin(radians(ang))
                with BuildSketch(Plane.XY.offset(face + washer_depth)) as s:
                    with Locations((x, y)):
                        Rectangle(p.magnet_length + 0.3, p.magnet_width + 0.2, rotation=ang)
                extrude(amount=magnet_pocket_depth, mode=Mode.SUBTRACT)

        # ------------------------------------------------------------------
        # Orientation mark – 2 mm equilateral triangle embossed +0.4 mm on the
        # top rotor face at +X axis. Makes assembly fool-proof.
        # ------------------------------------------------------------------
        tri_size = 2
        with BuildSketch(Plane.XY.offset(drum_height)) as s:
            with Locations((outer_radius - 6, 0)):
                Polygon((0, 0), (tri_size, 0), (tri_size/2, tri_size*0.866))
        extrude(amount=0.4, mode=Mode.ADD)

        # --- Create central cavity for stator (remove material) ---
        stator_bottom = pocket_depth + air_gap  # bottom of stator cavity
        stator_top = stator_bottom + stator_thickness
        cavity_height = stator_thickness  # stator_top - stator_bottom (simplified)

        with BuildSketch(Plane.XY.offset(stator_bottom)) as s:
            Circle(outer_radius - 3)  # outer shell inner wall
            Circle(inner_clear_r, mode=Mode.SUBTRACT)
        extrude(amount=cavity_height, mode=Mode.SUBTRACT)

        # Cooling fins intentionally omitted – user requested removal

        # --- Alignment / locking through-pins (printed) --------------------
        # Eight equally spaced Ø3.2 mm holes run the full height of the drum.
        # When the rotor is sliced in the slicer at Z = drum_height/2 these
        # become half-holes in each printed half.  Separate Ø3 mm pins (or
        # filament off-cuts) can then be pushed through to lock the halves
        # around the stator disc.
        pin_count = 8
        pin_dia   = 3.2  # 0.2 mm clearance for a snug Ø3 mm pin
        pin_r     = outer_radius - pin_dia  # centre in the 3 mm wall
        for i in range(pin_count):
            ang = i * 360 / pin_count + 90  # degrees
            x = pin_r * cos(radians(ang))
            y = pin_r * sin(radians(ang))
            with BuildSketch(Plane.XY) as s:
                with Locations((x, y)):
                    Circle(pin_dia / 2)
            extrude(amount=drum_height, mode=Mode.SUBTRACT)

    # ------------------------------------------------------------------
    # Optional: split the drum into two printable halves at the mid-plane.
    # This yields two separate solids so each can be saved as its own STL
    # ready for FDM printing.  Through-pins (added above) ensure perfect
    # alignment when the halves are re-joined around the stator.
    # ------------------------------------------------------------------
    if split:
        mid_plane = Plane.XY.offset(drum_height / 2)
        halves = bp.part.split(mid_plane)

        # Label the resulting solids for easy identification
        if len(halves) >= 2:
            halves[0].label = f"{p.name}_RotorDrum_Lower"
            halves[1].label = f"{p.name}_RotorDrum_Upper"
        return Compound(children=halves, label=f"{p.name}_RotorDrum_Split")

    bp.part.label = f"{p.name}_RotorDrum"
    return bp.part