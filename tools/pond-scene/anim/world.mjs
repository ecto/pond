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
  z1: { x: -1.80, z: -0.10 },              // the arm, bolted, upstage left
  z1Pallet: { x: -1.55, z: 0.16 },         // where the cube rests, 0.36m from the arm's base
  go2Load: { x: -1.52, z: 0.26 },          // the dog stands here to be loaded
  go2Patrol: { x: -1.90, z: -0.45 },       // and idles here between runs
  h2: { x: -1.56, z: 0.66 },               // the flagship, at the head of the belt
  h2Handoff: { x: -1.7589, z: 0.6893 },     // the dog crouches here; the H2 bends to it

  // right band — the kid
  k1: { x: 1.62, z: 0.38 },                // its bench
  k1Reach: { x: 1.510, z: 0.85 },           // it steps out to the belt tail and crouches

  // the belt's two ends (see BELT below)
  beltHead: { x: -1.5719, z: 0.7814 },
  beltTail: { x: 1.4739, z: 0.8409 },
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
  y: 0.1433,                               // deck height, metres
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
export const BACK_AT_BAY = { x: -1.4628, y: 0.3391, z: 0.3377 };
export const BACK_AT_HANDOFF = { x: -1.7405, y: 0.2702, z: 0.7794 };

/* And where each humanoid's hands are at the pose it uses to work the belt.
   The H2 stands at z = 0.45 and bends/reaches DOWNSTAGE to the belt head; the
   K1 crouches right beside the tail. Both measured the same way. */
export const H2_HAND_AT_BELT = { x: -1.4500, y: 0.2200, z: 0.9200 };
export const K1_HAND_AT_BELT = { x: 1.2500, y: 0.2050, z: 1.0450 };

/* Where a parked cube rests. The arm's is a PALLET on the floor: a 0.74m arm
   reaching down to 37mm is nothing, and the floor keeps it out of the way. The
   K1's is a BENCH at 0.30 — the kid is 0.94m tall, and a bench it can work at
   without folding in half is proportionally lower than a person's. */
export const PALLET = { w: 0.16, h: 0.012, d: 0.16 };
export const BENCH = { w: 0.24, h: 0.2372, d: 0.18 };

/** the height a parked cube's CENTRE sits at, per pallet */
export function parkHeight(name) {
  return (name === 'k1Bench' ? BENCH.h : PALLET.h) + CUBE / 2;
}

/* the bench is a station too, for the parked-cube position */
STATIONS.k1Bench = { x: 1.5326, z: 0.5480 };

/* ---------------- the score ----------------
   Each leg: [t0, t1, holder]. `holder` is who owns the cube for that span;
   'belt' is the conveyor, which owns it exactly like a character does; null
   means it is parked on whichever pallet it was last put down on.

   96 seconds, and the two belt legs are the spine of it:

        0..18   the arm picks the cube off its pallet and loads the dog
                 (the four instants the arm's own shift grasps and releases are
                  master 92, 96/0, 6 and 18 — the score is fitted to the arm,
                  not the other way round, because its choreography was already
                  measured against these)
       18..26   the dog carries it across the left band to the flagship
       26..34   the H2 bends to the crouched dog, lifts, and sets it on the belt
       34..47   THE CROSSING — 2.70m of belt, under the headline, 13 seconds
       47..54   the K1 crouches at the tail, picks it off, benches it
       54..60   the dwell: the whole cast is still, and this is what they watch
       60..67   the K1 puts it back on the belt
       67..80   the crossing again, the other way
       80..87   the H2 takes it off the belt and loads the dog
       87..96   the dog carries it home and the arm re-stows it                */
export const BELT_OUT = { t0: 34, t1: 47 };
export const BELT_BACK = { t0: 67, t1: 80 };
BELT.speed = BELT.len / (BELT_OUT.t1 - BELT_OUT.t0);

const LEGS = [
  { t0: 0, t1: 6, hold: null, park: 'z1Pallet', beat: 'z1-approach' },
  { t0: 6, t1: 12, hold: 'z1', beat: 'z1-lift' },
  { t0: 12, t1: 18, hold: 'z1', beat: 'z1-load' },
  { t0: 18, t1: 22, hold: 'go2', beat: 'go2-carry-out' },
  { t0: 22, t1: 26, hold: 'go2', beat: 'go2-present' },
  { t0: 26, t1: 34, hold: 'h2', beat: 'h2-load-belt' },
  { t0: 34, t1: 47, hold: 'belt', beat: 'belt-out' },
  { t0: 47, t1: 54, hold: 'k1', beat: 'k1-take' },
  { t0: 54, t1: 60, hold: null, park: 'k1Bench', beat: 'dwell' },
  { t0: 60, t1: 67, hold: 'k1', beat: 'k1-return' },
  { t0: 67, t1: 80, hold: 'belt', beat: 'belt-back' },
  { t0: 80, t1: 87, hold: 'h2', beat: 'h2-unload-belt' },
  { t0: 87, t1: 92, hold: 'go2', beat: 'go2-carry-back' },
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
    'z1-approach': 'z1Pallet',      // the wrap: the arm has just re-stowed it
    'z1-lift': 'z1Pallet',
    'go2-carry-out': 'go2Load',
    'h2-load-belt': 'h2Handoff',
    'belt-out': 'beltHead',
    'k1-take': 'beltTail',
    'dwell': 'k1Bench',
    'k1-return': 'k1Bench',
    'belt-back': 'beltTail',
    'h2-unload-belt': 'beltHead',
    'go2-carry-back': 'h2Handoff',
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
