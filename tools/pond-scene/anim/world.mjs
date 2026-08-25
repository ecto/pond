/* SHARED — do not edit from a character module.

   THE WORLD TASK. Four bodies, one mind, one job: move a single cube around a
   closed circuit, forever. Every character reads its role out of this file, so
   the scene is one task performed by four machines rather than four loops that
   happen to run next to each other.

   Everything here is a PURE FUNCTION of the master clock. No state, no
   accumulation: the offline tools evaluate arbitrary times out of order and
   must get the same answer the browser does.

   ---------------------------------------------------------------------------
   WHY THE FROG IS THE COURIER

   The landing copy is a 544px column from the top of the frame down past the
   CTAs, and no character may intersect it at any supported viewport. Ask which
   characters can physically stand under it — floor still on screen, own height
   below the copy's bottom edge — and the answer is measured, not aesthetic:

       viewport     pond-bot        Go2             Z1              T1
       1280x700     from z=1.32     NEVER           NEVER           from z=4.66
       1280x1000    from z=-0.42    from z=2.98     from z=3.42     NEVER
       1440x1300    from z=-2.00    from z=1.44     from z=2.00     NEVER
       1280x1400    from z=-2.00    from z=0.00     from z=0.60     NEVER

   Only the pond-bot clears at ALL FOUR. A downstage floor point sits lower in
   frame, so walking further forward drops the floor off the bottom edge faster
   than distance shrinks a body — the Go2 runs out of frame before it runs out
   from under the words.

   So the copy column is a wall, and the frog is the only one small enough to go
   under it. That is not a workaround, it is the point: at true scale a 97mm
   machine can go where a 1.13m machine cannot, and the relay is built out of
   what each body is actually for. The arm has precision, the dog has range and
   a flat back, the frog fits, the humanoid has hands and height.

   ---------------------------------------------------------------------------
   THE CIRCUIT

   Left band: the Z1 on its pallet, and the Go2 that comes to meet it.
   Right band: the T1 at its bench.
   Between them: the copy, and one frog-sized gap underneath it.

       Z1 pallet --pick--> Z1 --load--> Go2 back --carry--> transfer point
                                                                |
                                                       frog takes it
                                                                |
                                            under the copy, downstage
                                                                |
                                     T1 squats, lifts it off, sets it down
                                                                |
                                              dwell: the whole cast watches
                                                                |
                                        and the same road back, in reverse.

   A leg is a span of the master clock with a giver, a taker and a moment. The
   moment is what matters: ownership changes on a single frame, and the cube's
   world position has to be continuous across it or it teleports. The selftest
   asserts exactly that. */

export const MASTER = 96;                  // one full circuit, seconds

/* ---------------- stations ----------------
   World positions in METRES (one stage unit is one metre — see stage.mjs).
   Every one of these is inside the owning character's roam region, and the
   regions are still solved by feasibleX from the copy keep-out and the crop
   budget, so a station cannot quietly break the layout. */
/* Every one of these was solved against feasibleX at its own depth, not
   eyeballed. The usable band NARROWS fast downstage (widthAtDepth shrinks), and
   at true scale the wide characters run out of room early: the Z1 has no room
   at all past z = 0.5, the Go2 past z = 1.2, the T1 past z = 0.5. The frog,
   being 75mm of half-width, still has 330mm of lateral room at z = 2.0. That
   asymmetry is what shapes the circuit. */
export const STATIONS = {
  // left band
  z1: { x: -1.74, z: 0.08 },               // the arm, bolted, mid-depth left
  z1Pallet: { x: -1.47, z: 0.36 },         // where the cube rests, 0.40m from the arm's base
  go2Load: { x: -1.44, z: 0.44 },          // the dog stands here to be loaded
  go2Patrol: { x: -1.85, z: -0.35 },       // and idles here between runs
  handoff: { x: -1.40, z: 1.05 },          // dog crouches, frog takes the cube

  // the frog's road: downstage, under the copy
  frogHome: { x: -0.95, z: 2.20 },
  frogCross: { z: 2.13 },                  // the depth it crosses at (see below)
  frogDeliver: { x: 1.392, z: 0.449 },     // right under the T1's hands (see HAND_AT_REACH)

  // right band
  t1: { x: 1.72, z: -0.45 },               // the humanoid at its bench
  t1Reach: { x: 1.53, z: 0.35 },           // it steps out to meet the frog here
  t1Pallet: { x: 1.643, z: -0.226 },       // its bench, 0.237 in front of where it stands
};

/* The crossing depth is set by the frog's hop WITH THE CUBE ON ITS BACK, not by
   its standing height. Under the copy at 1280x700:

     standing, 97mm             clears from z = 1.32
     mid-hop, 192mm             clears from z = 1.93
     mid-hop carrying, 237mm    clears from z = 2.23
     ...at a FLAT carrying hop, 212mm     clears from z = 2.07

   and the floor runs off the bottom edge of that same viewport at z = 2.34. At
   a full-height hop the corridor between the words and the edge of the world is
   about ten centimetres wide, which is not enough. So the crossing hops are
   deliberately flat — 45% of the frog's normal arc — which both opens the
   corridor to a workable width AND is what a loaded frog would do anyway. This
   is the tightest constraint in the scene, and the animation and the layout had
   to agree to solve it. */

/** the cube. Small enough that a 97mm frog carrying it reads as effort. */
export const CUBE = 0.05;

/* Where the cube rides on each body, as a link name plus an offset in METRES
   in that link's own frame. Measured off the link bounding boxes, not guessed:

     go2/base       trunk top at z = +0.089, x spans -0.128..0.332
     pondbot/body   origin at the feet, crown at z = 0.097 (the GLB is in mm,
                    but the offset is applied in world space after the scale is
                    divided out, so it is metres here like everything else)
     z1/link06      tool flange, 0.051 long
     t1/hands       a node pinned to the midpoint of the two hand links — whose
                    origins are at the ELBOWS, not the hands (INTERFACE.md 7)

   The renderers place the cube by taking the attach node's world matrix,
   dropping its scale, and applying this offset in the node's rotated frame. It
   is never a CHILD of a character: the pond-bot's subtree is scaled by 0.001,
   and a cube parented into that would render at 50 microns. */
export const CARRY = {
  z1: { node: 'link06', offset: [0.015, 0, 0] },   // matches z1.mjs's TOOL constant
  go2: { node: 'base', offset: [0.10, 0, 0.116] },
  pondbot: { node: 'body', offset: [0.012, 0, 0.124] },
  t1: { node: 'hands', offset: [0.155, 0, -0.150] },
};

/* Where the cube ACTUALLY sits on the Go2's back, measured through the real
   transform chain at the two moments it matters. It is not derivable in closed
   form — it depends on the dog's stance height, on the grounding solve that
   drops it onto the deck, and on its heading — so it is measured and pinned
   here, and the handoff-continuity assertion is what keeps it honest. Change
   the dog's route or its crouch and the assertion fails with the miss distance;
   re-measure and update these two lines.

     at the loading bay   standing, broadside to the arm
     at the transfer      lying down, so a 97mm frog can reach it */
export const BACK_AT_BAY = { x: -1.3774, y: 0.3292, z: 0.3712 };
export const BACK_AT_HANDOFF = { x: -1.3823, y: 0.2777, z: 1.1421 };

/* And where the T1's hands are when it squats out at the transfer spot.
   Measured the same way: the carry point rides 0.170 in front of the trunk and
   0.150 below the elbows, and at a 0.26 hip height that lands at 0.294. The
   frog therefore has to LEAP to hand the cube over, exactly as it leapt to take
   it — which is the right read anyway. The tiny one is always jumping to meet
   the big ones; that is what being 97mm tall in this cast means. */
export const HAND_AT_REACH = { x: 1.392, y: 0.294, z: 0.449 };

/* Where a parked cube rests. Two different things, because the two ends of the
   circuit have different bodies at them.

   The arm's is a PALLET on the floor: a 0.74m arm reaching down to 37mm is
   nothing, and the floor keeps it out of the frog's way.

   The humanoid's is a BENCH at 0.42. The T1 has no torso pitch — a squat is
   its only way down (INTERFACE.md 7) — so asking it to place a 50mm cube on the
   floor means folding it in half for no reason. It squats deep ONCE, to take
   the cube off a 141mm frog, and then works at bench height like a person. Each
   body doing what it is actually shaped for is the whole idea. */
export const PALLET = { w: 0.16, h: 0.012, d: 0.16 };
export const BENCH = { w: 0.26, h: 0.42, d: 0.20 };

/** the height a parked cube's CENTRE sits at, per pallet */
export function parkHeight(name) {
  return (name === 't1Pallet' ? BENCH.h : PALLET.h) + CUBE / 2;
}

/* ---------------- the score ----------------
   Each leg: [t0, t1, holder]. `holder` is who owns the cube for that span;
   null means it is parked on whichever pallet it was last put down on.
   Ownership changes exactly at a boundary, and the giver and taker are both
   required to be at the same place at that instant. */
const LEGS = [
  { t0: 0, t1: 6, hold: null, park: 'z1Pallet', beat: 'z1-approach' },
  { t0: 6, t1: 12, hold: 'z1', beat: 'z1-lift' },
  { t0: 12, t1: 18, hold: 'z1', beat: 'z1-load' },
  { t0: 18, t1: 30, hold: 'go2', beat: 'go2-carry-out' },
  { t0: 30, t1: 36, hold: 'go2', beat: 'go2-present' },
  { t0: 36, t1: 46, hold: 'pondbot', beat: 'frog-cross-out' },
  { t0: 46, t1: 52, hold: 'pondbot', beat: 'frog-present' },
  { t0: 52, t1: 62, hold: 't1', beat: 't1-place' },
  { t0: 62, t1: 66, hold: null, park: 't1Pallet', beat: 'dwell' },
  { t0: 66, t1: 74, hold: 't1', beat: 't1-return' },
  { t0: 74, t1: 85, hold: 'pondbot', beat: 'frog-cross-back' },
  { t0: 85, t1: 92, hold: 'go2', beat: 'go2-carry-back' },
  { t0: 92, t1: 96, hold: 'z1', beat: 'z1-restow' },
];

/** master-clock phase, 0..MASTER, from absolute scene seconds */
export function masterPhase(t) {
  const m = t % MASTER;
  return m < 0 ? m + MASTER : m;
}

/** the leg running at master time m */
export function legAt(m) {
  for (const L of LEGS) if (m >= L.t0 && m < L.t1) return L;
  return LEGS[LEGS.length - 1];
}

/** who is holding the cube at absolute time t, or null if it is parked */
export function holderAt(t) {
  return legAt(masterPhase(t)).hold;
}

/** which pallet the cube is parked on at time t (only meaningful when unheld):
    the most recent `park` at or before now, wrapping round the circuit */
export function parkAt(t) {
  const m = masterPhase(t);
  let best = null;
  for (const L of LEGS) if (L.park && L.t0 <= m) best = L.park;
  if (!best) for (const L of LEGS) if (L.park) best = L.park;   // before the first
  return best;
}

/* ---------------- handoffs ----------------
   Every ownership change in the circuit, as {t, from, to, where}. The two
   characters involved must both be at `where` at that instant — this is the
   list the selftest walks to prove the cube does not teleport. */
export const HANDOFFS = (() => {
  const out = [];
  const WHERE = {
    'z1-approach': 'z1Pallet',      // the wrap: the arm has just re-stowed it
    'z1-lift': 'z1Pallet',
    'go2-carry-out': 'go2Load',
    'frog-cross-out': 'handoff',
    't1-place': 't1Reach',
    'dwell': 't1Pallet',
    't1-return': 't1Pallet',
    'frog-cross-back': 't1Reach',
    'go2-carry-back': 'handoff',
    'z1-restow': 'go2Load',
  };
  for (let i = 0; i < LEGS.length; i++) {
    const prev = LEGS[(i - 1 + LEGS.length) % LEGS.length];
    const L = LEGS[i];
    if (prev.hold === L.hold) continue;
    out.push({ t: L.t0, from: prev.hold, to: L.hold, where: WHERE[L.beat] || null, beat: L.beat });
  }
  return out;
})();

/* ---------------- timed routes ----------------
   A walking character has to be at a named place at a named SECOND — the score
   sets arrival deadlines, not speeds. `makeRoute` takes waypoints with times
   and precomputes cumulative distance; `routeAt` returns where the character is
   and, crucially, HOW FAR IT HAS TRAVELLED.

   The distance matters more than the position. Every gait in this scene drives
   its phase from distance covered rather than from wall-clock time, which is
   what makes not-skating a property of the construction instead of something to
   tune (INTERFACE.md 4). Hand a gait `s` and it stays honest at any speed,
   including zero. */
export function makeRoute(points) {
  const pts = points.map((p) => ({ ...p }));
  let acc = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i].s = acc;
  }
  return { pts, total: acc };
}

/** ease a leg so a character does not start and stop like a lift */
const legEase = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export function routeAt(route, t) {
  const m = masterPhase(t);
  const P = route.pts;
  let i = 0;
  for (let k = 0; k < P.length - 1; k++) if (m >= P[k].t) i = k;
  const a = P[i], b = P[Math.min(i + 1, P.length - 1)];
  const span = b.t - a.t;
  const raw = span <= 0 ? 1 : (m - a.t) / span;
  const u = legEase(raw < 0 ? 0 : raw > 1 ? 1 : raw);
  const dist = b.s - a.s;
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
    s: a.s + dist * u,
    moving: dist > 1e-4 && raw > 0 && raw < 1,
    // instantaneous speed, for gait cadence and for leaning into a start
    v: span <= 0 ? 0 : (dist / span) * 6 * Math.max(0, raw * (1 - raw)) * (dist > 1e-4 ? 1 : 0),
    leg: i,
  };
}

/* ---------------- what each character should be doing ----------------
   A character module calls roleOf(key, t) and gets a small directive: where to
   be, whether it is holding the cube, and how far through the current gesture
   it is. The module still owns HOW — the gait, the arm path, the timing curves.
   This only says what the job needs from it right now. */

const smooth01 = (x) => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

/** 0..1 through the current leg */
function legU(m, L) { return (m - L.t0) / (L.t1 - L.t0); }

export function roleOf(key, t) {
  const m = masterPhase(t);
  const L = legAt(m);
  const u = legU(m, L);
  const holding = L.hold === key;
  const B = L.beat;

  if (key === 'z1') {
    // the arm works only at the two ends of the circuit; otherwise it rests
    const act = B === 'z1-approach' ? 'reach'
      : B === 'z1-lift' ? 'lift'
        : B === 'z1-load' ? 'load'
          : B === 'z1-restow' ? 'restow'
            : 'idle';
    return { holding, act, u, beat: B, at: STATIONS.z1 };
  }

  if (key === 'go2') {
    const goTo = (B === 'z1-approach' || B === 'z1-lift' || B === 'z1-load' || B === 'z1-restow'
      || B === 'go2-carry-back')
      ? STATIONS.go2Load
      : (B === 'go2-carry-out' || B === 'go2-present' || B === 'frog-cross-back')
        ? STATIONS.handoff
        : STATIONS.go2Patrol;
    // it must be dead still while something is put on or taken off its back
    const still = B === 'z1-load' || B === 'z1-restow' || B === 'go2-present';
    // and low, so a 97mm frog can reach a back that is otherwise 400mm up
    const crouch = B === 'go2-present' || B === 'frog-cross-out';
    return { holding, goTo, still, crouch, u, beat: B };
  }

  if (key === 'pondbot') {
    // the courier, and the only one that fits under the copy
    const goTo = (B === 'go2-present' || B === 'frog-cross-out') ? STATIONS.handoff
      : (B === 'frog-present' || B === 't1-place' || B === 't1-return' || B === 'dwell')
        ? STATIONS.frogDeliver
        : (B === 'frog-cross-back') ? STATIONS.handoff
          : STATIONS.frogHome;
    // crossing legs travel along the downstage corridor, under the words
    const crossing = B === 'frog-cross-out' || B === 'frog-cross-back';
    return { holding, goTo, crossing, u, beat: B, crossZ: STATIONS.frogCross.z };
  }

  // t1
  const goTo = (B === 'frog-present' || B === 't1-place' || B === 't1-return' || B === 'frog-cross-back')
    ? STATIONS.t1Reach : STATIONS.t1;
  const act = B === 't1-place' ? 'place'
    : B === 't1-return' ? 'take'
      : B === 'dwell' ? 'inspect'
        : B === 'frog-present' ? 'receive'
          : 'work';
  return { holding, goTo, act, u, beat: B };
}

/* ---------------- one mind ----------------
   All four accents breathe on ONE clock, in phase. Not a per-character idle:
   the same number, at the same moment, on four different machines. That is the
   whole idea made visible — and it is the cheapest possible way to say it.

   Returns 0..1. Reduced motion pins it to the middle so the scene still has its
   colour without anything moving. */
export const PULSE_PERIOD = 5.0;

export function pulse(t, reducedMotion) {
  if (reducedMotion) return 0.5;
  return 0.5 - 0.5 * Math.cos((t / PULSE_PERIOD) * Math.PI * 2);
}

/** where the cube sits when nobody is holding it, in world metres */
export function parkedCube(t) {
  const n = parkAt(t);
  const s = STATIONS[n] || STATIONS.z1Pallet;
  return { x: s.x, y: parkHeight(n), z: s.z };
}
