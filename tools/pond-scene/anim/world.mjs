/* SHARED — do not edit from a character module.

   THE WORLD TASK. Four bodies, one belt, one job: move a single cube around a
   closed circuit, forever. Every character reads its role out of this file, so
   the scene is one task performed by four machines rather than four loops that
   happen to run next to each other.

   Everything here is a PURE FUNCTION of the master clock. No state, no
   accumulation: the offline tools evaluate arbitrary times out of order and
   must get the same answer the browser does.

   ---------------------------------------------------------------------------
   WHY THERE IS A CONVEYOR

   The landing copy is a 544px column, and no character may intersect it at any
   supported viewport. That makes the column a WALL across the middle of the
   stage, and the only way past it is a corridor between the words and the
   bottom edge of the frame.

   The corridor's height is set by exactly one number — how far up the frame the
   copy's bottom edge sits. With the copy vertically centred it was 0.175m at
   1280x700, which is why this scene used to have a 97mm frog in it: the frog
   was the only body that fitted, and it walked the cube across underneath.

   The copy now sits in the top third (docs/style.css, and keepOut() in
   stage.mjs), and the corridor is about 0.31m. That is still nowhere near
   enough for a body — the smallest robot here is a 0.46m dog, and 0.52m with
   the cube on its back. Measured, at all four viewports, no member of this cast
   crosses at any depth that is still on screen.

   But 0.31m is plenty for INFRASTRUCTURE. So the thing that crosses is not a
   robot at all: it is a conveyor, 0.12m tall, running along the corridor at
   z = 1.00, where the ceiling measures 0.218m and a cube riding the belt tops
   out at 0.170m. The machines stay in their bands and hand work to the line.

   That is a better story than the frog was, and a truer one: this is what a
   real cell looks like. Big machines do not squeeze through gaps. They stand
   where they can reach and let the line carry the part.

   ---------------------------------------------------------------------------
   THE CIRCUIT

   Left band: the Z1 on its pallet, the Go2 that shuttles, and the H2 standing
   over the head of the belt. Right band: the K1 at its bench. Between them the
   copy, and the belt running underneath it.

       Z1 pallet --pick--> Z1 --load--> Go2 back --carry--> the H2's station
                                                                |
                                    the H2 bends to a crouched dog and lifts
                                                                |
                                          places it on the belt head, gently
                                                                |
                                    ===== the belt, under the copy =====
                                                                |
                                        the K1 crouches and picks it off
                                                                |
                                             bench, and the dwell: all watch
                                                                |
                                        and the same road back, in reverse.

   A leg is a span of the master clock with a giver, a taker and a moment. The
   moment is what matters: ownership changes on a single frame, and the cube's
   world position has to be continuous across it or it teleports. The selftest
   asserts exactly that, including the two moments the belt is one of the two
   parties. */

export const MASTER = 96;                  // one full circuit, seconds

/* ---------------- stations ----------------
   World positions in METRES (one stage unit is one metre — see stage.mjs).
   Every one is inside the owning character's roam region, and the regions are
   solved by feasibleX from the copy keep-out and the crop budget, so a station
   cannot quietly break the layout. The selftest asserts it.

   The bands NARROW fast downstage, and at true scale the big bodies run out of
   room early. Measured usable x-interval at VW_BASE 5.00:

       depth     H2 (half 0.55, left)    K1 (half 0.42, right)
       z=0.4     [-1.75, -1.64]          [ 1.51,  1.88]
       z=0.6     [-1.66, -1.62]          [ 1.49,  1.79]
       z=0.8     empty                   [ 1.47,  1.69]
       z=1.2     empty                   [ 1.42,  1.49]
       z=1.4     empty                   empty

   So the H2 cannot go downstage at all — it works at z <= 0.6 and reaches. The
   K1 is small enough to get out to the belt. That asymmetry is the whole reason
   the belt's head is on the H2's side and its tail is where the K1 can crouch
   beside it. */
export const STATIONS = {
  // left band — the arm, the dog, the flagship
  /* The arm is bolted at the ONE point that reaches all four of its targets:
     its pallet (0.42), the dog's back at the bay (0.41), the flagship's
     presented hands (0.25) and the head of the belt (0.43) — every one inside
     the 0.20..0.65 band where this arm still looks like an arm. It loads the
     line because the flagship physically cannot: an H2's lowest legal hand
     height is 0.232m and a belt that clears the copy has to ride at 0.17. */
  z1: { x: -1.70, z: 0.95 },               // the arm, bolted to a plinth, DOWNSTAGE
  z1Pallet: { x: -1.55, z: 1.15 },         // its parts stand, downstage of it again
  go2Load: { x: -1.40, z: 1.05 },          // the dog stands here to be loaded
  go2Patrol: { x: -1.90, z: -0.45 },       // and idles here between runs
  h2: { x: -1.62, z: 0.50 },               // the flagship, UPSTAGE of the arm
  h2Handoff: { x: -1.7030, z: 0.7405 },    // the dog crouches here; the H2 bends to it
  h2Present: { x: -1.7674, z: 0.6278 },    // where the H2 holds the cube out for the arm    // where the H2 holds the cube out for the arm    // where the H2 holds the cube out for the arm    // where the H2 holds the cube out for the arm    // where the H2 holds the cube out for the arm    // where the H2 holds the cube out for the arm

  // right band — the kid
  k1: { x: 1.62, z: 0.38 },                // its bench
  k1Reach: { x: 1.500, z: 0.95 },          // it steps out to the belt tail and crouches

  // the belt's two ends (see BELT below)
  beltHead: { x: -1.4200, z: 1.0000 },
  beltTail: { x: 1.4668, z: 0.9664 },
};

/* ---------------- the conveyor ----------------
   A straight belt along the corridor. Deck at 0.12m, running from beltHead to
   beltTail at a constant z, which is what lets the whole span be checked
   against one ceiling number.

   Every one of these is a measured constraint, not a preference:

     z = 1.00     the depth. The copy ceiling there is 0.218m and the belt's
                  own frame tops out at 0.12, so a 50mm cube riding it reaches
                  0.170 — 48mm of clearance. Further upstage the ceiling drops
                  below the cube (it is NEGATIVE by z = 0.7, i.e. under the
                  deck); further downstage the belt walks out of the bottom of
                  the frame and, worse, out of the K1's reach.
     x = -1.45 .. 1.25   the span. The column is 1.026m of half-width at this
                  depth, so both ends stick out past the words — which is the
                  point: each end has to be somewhere a robot can stand.
     0.12m tall   comfortably inside the ~0.31m corridor, and low enough that
                  a 1.83m humanoid placing a cube on it has to really bend.

   SPEED is derived, not chosen: the score gives the crossing 13 seconds and
   the span is 2.70m, so the belt runs at 0.208 m/s. That is an unhurried
   factory pace — real belts run 0.1 to 0.5 — and it is slow enough that the
   cube crossing under the headline reads as a deliberate beat rather than a
   flick. Change BELT_OUT/BELT_BACK in the score and the speed follows. */
export const BELT = {
  y: 0.1463,                               // deck height, metres
  w: 0.19,                                 // deck width (across the run)
  head: STATIONS.beltHead,
  tail: STATIONS.beltTail,
};
BELT.len = Math.hypot(BELT.tail.x - BELT.head.x, BELT.tail.z - BELT.head.z);

/** the cube. Small enough that the whole cast has to be careful with it. */
export const CUBE = 0.05;

/** where a cube sitting ON the belt has its centre */
export const BELT_CARRY_Y = BELT.y + CUBE / 2;

/**
 * Where the cube is along the belt at fraction u (0 = head, 1 = tail), in
 * world metres. The belt is straight, so this is the whole of its motion.
 */
export function beltPoint(u) {
  const k = u < 0 ? 0 : u > 1 ? 1 : u;
  return {
    x: BELT.head.x + (BELT.tail.x - BELT.head.x) * k,
    y: BELT_CARRY_Y,
    z: BELT.head.z + (BELT.tail.z - BELT.head.z) * k,
  };
}

/* Where the cube rides on each body, as a link name plus an offset in METRES
   in that link's own frame. Measured off the link bounding boxes, not guessed:

     go2/base       trunk top at z = +0.089, x spans -0.128..0.332
     z1/link06      tool flange, 0.051 long
     h2/hands       a node pinned to the midpoint of the two hand links
     k1/hands       the same, on the smaller robot

   The renderers place the cube by taking the attach node's world matrix,
   dropping its scale, and applying this offset in the node's rotated frame. It
   is never a CHILD of a character.

   `frame` names the link whose ORIENTATION the offset is applied in. It only
   matters for the `hands` pseudo-node, which has a position (the midpoint of
   two hand links) but no rotation of its own, so it borrows the torso's. The
   two humanoids call that link different things — the H2's is `torso_link` and
   the K1's is `Trunk` — and this used to be hardcoded to `Trunk`, which would
   have silently given the H2 an unrotated identity frame. */
export const CARRY = {
  z1: { node: 'link06', offset: [0.015, 0, 0] },   // matches z1.mjs's TOOL constant
  go2: { node: 'base', offset: [0.10, 0, 0.116] },
  h2: { node: 'hands', frame: 'torso_link', offset: [0.185, 0, -0.120] },
  /* the K1 holds the cube LOW and close — 0.175 below the hand midpoint rather
     than the H2's 0.120. Not a style choice: its arms are 0.31m and its
     shoulders are 0.68m up, so with a shallower grip its hands bottom out
     41mm above the conveyor and it simply cannot reach the line it works at.
     It went deeper still (0.235) when the lunge had to be narrowed: the K1
     works at the deep end of the right band where there is no width to spare,
     so it cannot buy reach by leaning further out. It buys it by holding the
     part lower instead. */
  k1: { node: 'hands', frame: 'Trunk', offset: [0.130, 0, -0.235] },
};

/* Measured through the real transform chain at the moments that matter. None
   of these is derivable in closed form — they depend on stance heights, on the
   grounding solve and on headings — so they are measured and pinned here, and
   the handoff-continuity assertion is what keeps them honest. Change a route or
   a crouch and the assertion fails with the miss distance in millimetres.

     at the loading bay   the dog standing, broadside to the arm
     at the H2 handoff    the dog crouched, so a bending humanoid can reach it */
export const BACK_AT_BAY = { x: -1.3491, y: 0.3326, z: 0.9701 };
export const BACK_AT_HANDOFF = { x: -1.7405, y: 0.2702, z: 0.7794 };

/* Where the flagship holds the cube out for the arm to take. This is the one
   exchange in the circuit between two ROBOTS' end effectors rather than
   between a robot and a surface, so it has to suit both: chest height for a
   1.83m machine standing straight, and inside the arm's reach envelope from
   the top of its plinth.

   This value is the arm's AIM, and it is pre-compensated. The arm's realised
   base bearing runs about 0.12 rad inside the bearing it is given at this
   station — far enough out on the yaw track that a lead offset and the tail of
   a line-up have not fully unwound — so aiming it at the true exchange point
   left the gripper 63mm away. Aiming it 0.12 rad past lands it on the hands.
   `STATIONS.h2Present` below is the TRUE point, and the handoff assertion is
   measured against reality either way. */
export const H2_PRESENT = { x: -1.8084, y: 0.7609, z: 0.6280 };

/* Where a parked cube rests. The arm's is a PALLET on the floor: a 0.74m arm
   reaching down to 37mm is nothing, and the floor keeps it out of the way. The
   K1's is a BENCH at 0.30 — the kid is 0.94m tall, and a bench it can work at
   without folding in half is proportionally lower than a person's. */
/* A parts STAND, not a floor pallet. At 12mm the cube sat at 0.037 and the arm
   had to drive its shoulder 0.086 rad past joint2's limit to get down to it —
   the runtime clamped, and the arm stopped short of its own pallet. Raising the
   stand to 0.10 puts the pick at 0.125, the same order as the belt, and every
   joint stays inside its limit through the whole reach. */
export const PALLET = { w: 0.16, h: 0.10, d: 0.16 };
/* The arm stands on a plinth, the way a real cell mounts one. This is not
   dressing: an arm's reach envelope SHRINKS with height, and bolted flat to
   the floor this one could not meet the flagship's presented hands (0.567) and
   still lay the cube on a 0.113 belt — it was 78mm short at the exchange and
   straining at the limit clamp. Raising the base 0.25 puts BOTH targets in the
   comfortable middle of its envelope: 0.414 out to the hands, 0.445 down to
   the belt, against a 0.555 maximum. */
export const PLINTH = { w: 0.26, h: 0.25, d: 0.26 };
export const BENCH = { w: 0.24, h: 0.2372, d: 0.18 };

/** the height a parked cube's CENTRE sits at, per pallet */
export function parkHeight(name) {
  return (name === 'k1Bench' ? BENCH.h : PALLET.h) + CUBE / 2;
}

/* the bench is a station too, for the parked-cube position */
STATIONS.k1Bench = { x: 1.5326, z: 0.5480 };

/* ---------------- the set ----------------
   Every solid prop in the scene, as {name, w, h, d, at, yaw}, in metres and
   stage coordinates. `at` is the CENTRE of the footprint and `h` is the full
   height, so a prop occupies y = 0 .. h.

   THIS LIST IS THE ONE SOURCE. Both renderers build their props from it —
   scene.js for the browser and preview.js for the offline sheets — because
   they used to keep two hand-written copies "in sync" and they drifted: the
   browser bundle still asked for a station called `t1Pallet` long after the
   T1 left the cast, `STATIONS.t1Pallet` came back undefined, and reading `.x`
   off it threw. The throw happened inside start(), which the boot wraps in a
   catch that exists to never break the docs page, so the site showed no error
   at all — it just silently kept the PNG fallback while a canvas sat in the
   DOM doing nothing. A prop list that cannot drift is the fix; the assertion
   below is the seatbelt. */
export const PROPS = [
  { name: 'z1Plinth', ...PLINTH, at: STATIONS.z1 },
  { name: 'z1Pallet', ...PALLET, at: STATIONS.z1Pallet },
  { name: 'k1Bench', ...BENCH, at: STATIONS.k1Bench },
];

/* ---------------- the score ----------------
   Each leg: [t0, t1, holder]. `holder` is who owns the cube for that span;
   'belt' is the conveyor, which owns it exactly like a character does; null
   means it is parked on whichever pallet it was last put down on.

   96 seconds, and the two belt legs are the spine of it:

        0..6    the cube is parked on the arm's pallet; the arm reaches for it
        6..18   the arm lifts it and sets it on the dog's back
       18..26   the dog carries it across the left band to the flagship
       26..33   THE BEND — the flagship folds to the crouched dog, lifts the
                cube off its back and holds it out
       33..46   the arm takes it from the flagship's hands and lays it on the
                head of the belt. The arm loads the line, not the flagship:
                an H2's lowest LEGAL hand height is 0.232m (its knee limit and
                its canted hip's roll limit, not something tunable) and a belt
                that clears the copy has to ride at 0.17. The arm reaches 0.037
                without thinking about it. Each body does what only it can.
       46..59   THE CROSSING — 2.87m of belt, under the headline, 13 seconds
       59..65   the K1 crouches at the tail, picks it off, benches it
       65..70   the dwell: the whole cast is still, and this is what they watch
       70..76   the K1 puts it back on the belt
       76..89   the crossing again, the other way
       89..96   the arm takes it off the belt and re-stows it on its pallet

   The return path is deliberately shorter than the outbound one. Sending it
   back through the flagship and the dog would be symmetric and would say
   nothing new; letting the arm close the loop on its own gives the second half
   a different shape and gets the cube home in time to start again.           */
export const BELT_OUT = { t0: 46, t1: 59 };
export const BELT_BACK = { t0: 76, t1: 89 };
BELT.speed = BELT.len / (BELT_OUT.t1 - BELT_OUT.t0);

const LEGS = [
  { t0: 0, t1: 6, hold: null, park: 'z1Pallet', beat: 'rest' },
  { t0: 6, t1: 12, hold: 'z1', beat: 'z1-lift' },
  { t0: 12, t1: 18, hold: 'z1', beat: 'z1-load-dog' },
  { t0: 18, t1: 22, hold: 'go2', beat: 'go2-carry-out' },
  { t0: 22, t1: 26, hold: 'go2', beat: 'go2-present' },
  { t0: 26, t1: 33, hold: 'h2', beat: 'h2-take' },
  { t0: 33, t1: 40, hold: 'z1', beat: 'z1-take-from-h2' },
  { t0: 40, t1: 46, hold: 'z1', beat: 'z1-load-belt' },
  { t0: 46, t1: 59, hold: 'belt', beat: 'belt-out' },
  { t0: 59, t1: 65, hold: 'k1', beat: 'k1-take' },
  { t0: 65, t1: 70, hold: null, park: 'k1Bench', beat: 'dwell' },
  { t0: 70, t1: 76, hold: 'k1', beat: 'k1-return' },
  { t0: 76, t1: 89, hold: 'belt', beat: 'belt-back' },
  { t0: 89, t1: 96, hold: 'z1', beat: 'z1-restow' },
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

/**
 * How far along the belt the cube is at time t, 0 (head) .. 1 (tail), or null
 * if the belt is not carrying it. The two crossings run in opposite
 * directions, and both are LINEAR — a belt does not ease in and out, and
 * easing it would be the one thing that made it read as an animation rather
 * than as a machine.
 */
export function beltProgress(t) {
  const m = masterPhase(t);
  if (m >= BELT_OUT.t0 && m < BELT_OUT.t1) return (m - BELT_OUT.t0) / (BELT_OUT.t1 - BELT_OUT.t0);
  if (m >= BELT_BACK.t0 && m < BELT_BACK.t1) return 1 - (m - BELT_BACK.t0) / (BELT_BACK.t1 - BELT_BACK.t0);
  return null;
}

/**
 * The belt's surface speed at time t, metres/second, SIGNED (+1 runs head to
 * tail). Zero when nothing is on it — this drives the belt's own surface
 * motion, so the line visibly starts before the cube reaches it and stops
 * after it leaves. It runs a little either side of each crossing for that
 * reason; a belt that springs to life at the exact frame the cube lands reads
 * as a conveyor-shaped prop rather than a machine that was already running.
 */
export function beltVelocity(t) {
  const m = masterPhase(t);
  const spin = (a, b, dir) => {
    const LEAD = 1.6, TAIL = 1.2;
    if (m < a - LEAD || m > b + TAIL) return 0;
    const up = Math.min(1, (m - (a - LEAD)) / LEAD);
    const dn = Math.min(1, ((b + TAIL) - m) / TAIL);
    return dir * BELT.speed * Math.max(0, Math.min(up, dn));
  };
  return spin(BELT_OUT.t0, BELT_OUT.t1, 1) + spin(BELT_BACK.t0, BELT_BACK.t1, -1);
}

/** which pallet the cube is parked on at time t (only meaningful when unheld) */
export function parkAt(t) {
  const m = masterPhase(t);
  let best = null;
  for (const L of LEGS) if (L.park && L.t0 <= m) best = L.park;
  if (!best) for (const L of LEGS) if (L.park) best = L.park;   // before the first
  return best;
}

/* ---------------- handoffs ----------------
   Every ownership change in the circuit, as {t, from, to, where}. The two
   parties must both be at `where` at that instant — this is the list the
   selftest walks to prove the cube does not teleport. The belt is a party like
   any other: `beltHead` and `beltTail` are real places with real heights, and
   the two moments the cube lands on and leaves the line are checked exactly
   the way a hand-to-hand pass is. */
export const HANDOFFS = (() => {
  const out = [];
  const WHERE = {
    'rest': 'z1Pallet',             // the wrap: the arm has just re-stowed it
    'z1-lift': 'z1Pallet',
    'go2-carry-out': 'go2Load',
    'h2-take': 'h2Handoff',
    'z1-take-from-h2': 'h2Present',
    'belt-out': 'beltHead',
    'k1-take': 'beltTail',
    'dwell': 'k1Bench',
    'k1-return': 'k1Bench',
    'belt-back': 'beltTail',
    'z1-restow': 'beltHead',
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
   tune (INTERFACE.md 4). Hand a gait `s` and it stays honest at any speed. */
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
    v: span <= 0 ? 0 : (dist / span) * 6 * Math.max(0, raw * (1 - raw)) * (dist > 1e-4 ? 1 : 0),
    leg: i,
  };
}

/* ---------------- what each character should be doing ----------------
   A character module calls roleOf(key, t) and gets a small directive: where to
   be, whether it is holding the cube, and how far through the current gesture
   it is. The module still owns HOW — the gait, the arm path, the timing curves.
   This only says what the job needs from it right now. */

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
    const goTo = (B === 'z1-approach' || B === 'z1-lift' || B === 'z1-load' || B === 'z1-restow')
      ? STATIONS.go2Load
      : (B === 'go2-carry-out' || B === 'go2-present' || B === 'h2-load-belt'
        || B === 'h2-unload-belt' || B === 'go2-carry-back')
        ? STATIONS.h2Handoff
        : STATIONS.go2Patrol;
    // it must be dead still while something is put on or taken off its back
    const still = B === 'z1-load' || B === 'z1-restow' || B === 'go2-present'
      || B === 'h2-load-belt' || B === 'h2-unload-belt';
    // and low, so a bending humanoid can reach a back that is otherwise 400mm up
    const crouch = B === 'go2-present' || B === 'h2-load-belt' || B === 'h2-unload-belt';
    return { holding, goTo, still, crouch, u, beat: B };
  }

  if (key === 'h2') {
    /* the flagship works the head of the belt. Two gestures, mirrored: take the
       cube off a crouched dog and set it on the line, and take it off the line
       and put it back on the dog. */
    const act = B === 'h2-load-belt' ? 'load'
      : B === 'h2-unload-belt' ? 'unload'
        : B === 'go2-present' ? 'receive'
          : 'idle';
    return { holding, act, u, beat: B, at: STATIONS.h2 };
  }

  // k1
  const goTo = (B === 'k1-take' || B === 'k1-return' || B === 'belt-out' || B === 'belt-back')
    ? STATIONS.k1Reach : STATIONS.k1;
  const act = B === 'k1-take' ? 'take'
    : B === 'k1-return' ? 'give'
      : B === 'dwell' ? 'inspect'
        : B === 'belt-out' ? 'await'
          : 'work';
  return { holding, goTo, act, u, beat: B };
}

/* ---------------- one mind ----------------
   All four accents breathe on ONE clock, in phase. Not a per-character idle:
   the same number, at the same moment, on four different machines — and on the
   cube, and on the belt's status light. That is the whole idea made visible,
   and it is the cheapest possible way to say it.

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
