/* SHARED — do not edit from a character module.

   ===========================================================================
   STATUS: THE SCORE IS WRITTEN, THE CAST HAS NOT LEARNED IT YET.

   Everything in this file is live and asserted — the stations are solved
   against the real composition, the legs tile the master clock, the handoffs
   are consistent, and `pulse()` IS driving all four accents in the shipped
   bundle right now.

   What is NOT yet wired: the four character modules still run their own
   independent loops at their own periods (17.5 / 19.7 / 36.6 / 46.6s) from
   their own roam regions, and the cube is still the Z1's private prop. So the
   STATIONS below describe where the cast needs to stand for the relay, not
   where it stands today — the Z1 in particular is still in the RIGHT band and
   has to move left before this circuit is real.

   Remaining work to make the relay run, in order:
     1. cross-character prop ownership: one cube whose parent is holderAt(t),
        re-parented preserving world transform, in scene.js AND preview.js
        (extend the release-timeline in preview.js — a prop's parent becomes a
        function of world time rather than a park label);
     2. each character's work() reads roleOf(key, t) and drives its existing
        motion vocabulary to the station and gesture it names, replacing its
        private scheduler — the Z1 moves band, the Go2's patrol becomes the
        two rendezvous, the T1 gains a step-out-and-squat, the frog gains the
        crossing route;
     3. retire the T1's ink crate in favour of the shared 5cm cube plus two
        small static pallets (this also frees band width — the crate is
        180x300x500mm, which is enormous next to a 50mm cube at true scale);
     4. the handoff assertion the whole design turns on: sample the cube's
        world position either side of every ownership change and require
        continuity, so a handoff can never become a teleport.

   Do not treat the STATIONS as descriptive of the current scene.
   ===========================================================================

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

export const MASTER = 88;                  // one full circuit, seconds

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
  z1: { x: -1.62, z: 0.15 },               // the arm, bolted, mid-depth left
  z1Pallet: { x: -1.34, z: 0.30 },         // where the cube rests, 0.32m from the arm's base
  go2Load: { x: -1.45, z: 0.55 },          // the dog stands here to be loaded
  go2Patrol: { x: -1.85, z: -0.35 },       // and idles here between runs
  handoff: { x: -1.40, z: 1.05 },          // dog crouches, frog takes the cube

  // the frog's road: downstage, under the copy
  frogHome: { x: -0.95, z: 2.20 },
  frogCross: { z: 2.15 },                  // the depth it crosses at (see below)
  frogDeliver: { x: 1.25, z: 0.55 },       // where it presents the cube to the T1

  // right band
  t1: { x: 1.72, z: -0.45 },               // the humanoid at its bench
  t1Reach: { x: 1.53, z: 0.35 },           // it steps out to meet the frog here
  t1Pallet: { x: 1.65, z: 0.00 },          // and sets the cube down here
};

/* The crossing depth is set by the frog's HOP, not its standing height. Under
   the copy at 1280x700 a 97mm frog clears from z = 1.32 — but mid-hop it is
   192mm to the top of its arc, and that only clears from z = 1.93. 2.15 leaves
   a little over 20cm of margin and still keeps the floor 5% clear of the
   bottom edge, which is the other end of the same squeeze. */

/** the cube. Small enough that a 97mm frog carrying it reads as effort. */
export const CUBE = 0.05;

/* ---------------- the score ----------------
   Each leg: [t0, t1, holder]. `holder` is who owns the cube for that span;
   null means it is parked on whichever pallet it was last put down on.
   Ownership changes exactly at a boundary, and the giver and taker are both
   required to be at the same place at that instant. */
const LEGS = [
  { t0: 0.0, t1: 6.0, hold: null, park: 'z1Pallet', beat: 'z1-approach' },
  { t0: 6.0, t1: 12.0, hold: 'z1', beat: 'z1-lift' },
  { t0: 12.0, t1: 18.0, hold: 'z1', beat: 'z1-load' },
  { t0: 18.0, t1: 30.0, hold: 'go2', beat: 'go2-carry-out' },
  { t0: 30.0, t1: 36.0, hold: 'go2', beat: 'go2-present' },
  { t0: 36.0, t1: 46.0, hold: 'pondbot', beat: 'frog-cross-out' },
  { t0: 46.0, t1: 52.0, hold: 'pondbot', beat: 'frog-present' },
  { t0: 52.0, t1: 58.0, hold: 't1', beat: 't1-place' },
  { t0: 58.0, t1: 64.0, hold: null, park: 't1Pallet', beat: 'dwell' },
  { t0: 64.0, t1: 70.0, hold: 't1', beat: 't1-return' },
  { t0: 70.0, t1: 78.0, hold: 'pondbot', beat: 'frog-cross-back' },
  { t0: 78.0, t1: 84.0, hold: 'go2', beat: 'go2-carry-back' },
  { t0: 84.0, t1: 88.0, hold: 'z1', beat: 'z1-restow' },
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
    const goTo = (B === 'z1-approach' || B === 'z1-lift' || B === 'z1-load' || B === 'z1-restow')
      ? STATIONS.go2Load
      : (B === 'go2-carry-out' || B === 'go2-present' || B === 'go2-carry-back' || B === 'frog-cross-out')
        ? STATIONS.handoff
        : STATIONS.go2Patrol;
    // it must be dead still while something is being put on or taken off its back
    const still = B === 'z1-load' || B === 'z1-restow' || B === 'go2-present'
      || B === 'frog-cross-out' || B === 'go2-carry-back';
    const crouch = B === 'go2-present' || B === 'frog-cross-out' || B === 'go2-carry-back';
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
  const s = STATIONS[parkAt(t)] || STATIONS.z1Pallet;
  return { x: s.x, y: CUBE / 2, z: s.z };
}
