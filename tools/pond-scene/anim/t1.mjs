/* Booster T1 — the worker. Carries a crate between two spots, sets it down,
   picks it back up, and takes a breath in between.

   The whole character is one idea: THE CRATE HAS MASS. Everything else falls
   out of that — it stands taller and leans back a little to counterbalance the
   load, its steps shorten and its knees give a fraction on every touchdown, it
   keeps the crate close to the body on the way down, and it never hurries a
   placement. Motion that costs effort is slow at the start and careful at the
   end; motion that costs nothing (a head turn, a glance at a coworker) is
   quick. The contrast between those two is what sells the weight.

   OWNED BY THE T1 SPECIALIST. Everything this file imports is shared and must
   not be edited from here. See INTERFACE.md.

   Two rig facts drive most of the choices below, both from INTERFACE.md §7:
     - There is no torso pitch. "Waist" is a yaw between the trunk and the LEGS,
       so it swings the feet, not the chest. A squat is the only way down, which
       is why the crate is tall and gripped at its top rim.
     - The crate hangs from the MIDPOINT OF THE TWO ELBOWS (the *_hand_link
       origins sit at the elbow) and takes its orientation from the Trunk. So
       Shoulder_Pitch/Roll move the crate and Elbow_Pitch/Yaw do not — which is
       a gift: all the arm asymmetry that reads as "one arm is taking more of
       the weight" can live in the elbows, where it cannot disturb the load. */

import { legIK } from './kinematics.mjs';
import { plan, follow, track, clamp01, smooth, mix, TAU, arc } from './schedule.mjs';
import { MASTER, STATIONS, BENCH, CUBE, makeRoute, routeAt, masterPhase, parkHeight } from './world.mjs';

export const params = {
  L1: 0.2363, L2: 0.2920,   // hip->knee, knee->foot, metres
  stand: 0.455,             // hip above foot while carrying — the load compresses it
  standTall: 0.478,         // fully upright: the breath at the top, and the survey.
                            //   This is the tallest pose in the loop, and the swept
                            //   height is what the stage normalises the character by
                            //   — going higher would silently shrink T1 on the page.
  bench: 0.400,             // hip height that puts the cube on its 0.42m bench
  reach: 0.260,             // hip height for the deep squat out at the transfer
                            //   spot. Both measured through the real chain: at
                            //   0.400 with the SET arms the carry point is
                            //   0.448 (the bench wants 0.445) and at 0.260 with
                            //   the arms hanging it is 0.294, which is where
                            //   the frog leaps to.

  stance: 0.125,            // ground per stance — short steps, because it is loaded
  duty: 0.80,               // long double support: it is carrying something
  lift: 0.034,              // swing apex — it does not pick its feet up far
  give: 0.011,              // knee compliance on each touchdown, metres
  speed: 0.072,             // stage units per second at work
  entrySpeed: 0.19,         // clocking in: steady, not hurried
  workDur: 16.0,            // seconds of crate cycle at each spot
  vicinity: 1.40,           // pointer-attention radius, stage units
  regard: 0.55,             // pointer-attention CAP: polite, but the job comes first
};
params.advance = params.stance / params.duty;   // metres of travel per gait cycle

/* ---- the beats of one crate cycle, in hold-local u ----------------------
   Named so the shape of the performance is readable in one place. The two
   money moments are SET (0.24 -> 0.40) and LIFT (0.76 -> 0.94); everything
   before each of them is anticipation and everything after is recovery. */
const SCAN0 = 0.10, SCAN1 = 0.19;   // look at the spot before committing to it
const SQUARE = 0.24;                // square up, hands re-set: the descent begins
const SETTLE = 0.455;               // hands stay on the crate a beat after contact
const TOP0 = 0.555, TOP1 = 0.625;   // straighten, and pause at the top — a breath
const IDLE0 = 0.63, IDLE1 = 0.70;   // between work
const ADDRESS = 0.715;              // address the crate before reaching for it
const EFFORT = 0.815;               // the lift is slow for its first fifth

/* Read by the tooling to freeze the parked crate, so these two are contract:
   the pose at RELEASE_U must put the crate exactly on the deck, and the pose
   at REGRASP_U must be IDENTICAL to it, or the crate jumps as it re-attaches.
   Body placement, facing and tilt have to match across the whole gap too — the
   released crate is parented under the character's shift node, so a body that
   keeps swaying would drag the crate along the floor with it. */
export const RELEASE_U = 0.40, REGRASP_U = 0.76;

const OFFSTAGE = { x: 3.60, z: -0.44 };
const BENCH_AT = STATIONS.t1, REACH_AT = STATIONS.t1Reach;
/* Facings. At the bench it works square to its own bench; stepping out to meet
   the frog it turns downstage-left, toward where the frog comes up from the
   corridor, so the exchange happens in front of its chest and not behind it. */
const YAW_BENCH = -1.90, YAW_REACH = -2.522;

/* This character's part of the world task (anim/world.mjs). It has the shortest
   walk of the cast and the deepest bend — it is the only one that can pick a
   50mm cube off a 97mm frog without lying down, because it has hands and a
   squat. It steps out to meet the frog, takes the cube, puts it on its bench,
   looks it over, and hands it back.

     49  takes the cube off the frog's back      (deep squat, out at the reach)
     55  sets it on the bench                    (standing, bench height)
     55..59  the dwell: the whole cast is still and this is what they look at
     59  picks it back up
     64  hands it back down to the frog          (deep squat again)  */
const ROUTE = makeRoute([
  { t: 0, ...BENCH_AT, yaw: YAW_BENCH }, { t: 46, ...BENCH_AT, yaw: YAW_BENCH },
  { t: 49, ...REACH_AT, yaw: YAW_REACH }, { t: 55.5, ...REACH_AT, yaw: YAW_REACH },
  { t: 57.5, ...BENCH_AT, yaw: YAW_BENCH }, { t: 68.7, ...BENCH_AT, yaw: YAW_BENCH },
  { t: 70.5, ...REACH_AT, yaw: YAW_REACH }, { t: 78, ...REACH_AT, yaw: YAW_REACH },
  { t: 82, ...BENCH_AT, yaw: YAW_BENCH }, { t: 96, ...BENCH_AT, yaw: YAW_BENCH },
]);

/* Which of its two jobs a hold is for, and how far through it we are. The
   character has exactly two gestures now and they are quite different animals:

     BENCH  the crate cycle it already knew — square up, descend, set down,
            stand up and breathe, address, take the weight, lift. Re-aimed from
            the deck to a 0.42m bench, which is what a person actually works at.
     REACH  a deep squat out at the transfer spot, to take a 50mm cube off the
            back of a 97mm frog. It has no torso pitch, so a squat is the only
            way down (INTERFACE.md 7) — this is that trap turned into the
            character's signature move. */
/* The bench window is sized so the cycle's OWN beats land on the score's
   moments: RELEASE_U (0.40) has to be master 62 and REGRASP_U (0.76) master 66,
   which fixes the span at 4 / (0.76 - 0.40) = 11.11s starting at 57.56. Fitting
   the window to the performance rather than squeezing the performance into a
   window is what keeps the authored proportions — the slow arrival, the breath
   at the top, the effort onset — exactly as they were. */
const BENCH_T0 = 62 - RELEASE_U * (4 / (REGRASP_U - RELEASE_U));
const BENCH_SPAN = 4 / (REGRASP_U - RELEASE_U);

function job(t) {
  const m = masterPhase(t);
  if (m >= BENCH_T0 && m < BENCH_T0 + BENCH_SPAN) return { kind: 'bench', u: (m - BENCH_T0) / BENCH_SPAN };
  if (m >= 49 && m < 55.5) return { kind: 'reach', u: (m - 49) / 6.5, take: (52 - 49) / 6.5 };
  if (m >= 70.5 && m < 78) return { kind: 'reach', u: (m - 70.5) / 7.5, take: (74 - 70.5) / 7.5 };
  return { kind: 'idle', u: 0 };
}

/* the entrance is unchanged: it clocks in from offstage right, to the bench */
const sched = plan(
  [{ from: OFFSTAGE, to: BENCH_AT, speed: params.entrySpeed },
    { hold: 2.0, at: BENCH_AT, yaw: YAW_BENCH }],
  [{ from: BENCH_AT, to: BENCH_AT }], params.speed);

/** follow(), reading the score once the entrance is done */
function path(t) {
  if (t < sched.entry.dur) return follow(sched, t);
  const a = routeAt(ROUTE, t);
  const P = ROUTE.pts, m = masterPhase(t);
  let i = 0;
  for (let k = 0; k < P.length - 1; k++) if (m >= P[k].t) i = k;
  const b = P[i + 1];
  const dx = b.x - P[i].x, dz = b.z - P[i].z;
  const moving = Math.hypot(dx, dz) > 1e-4 && a.moving;
  const span = b.t - P[i].t;
  return {
    x: a.x, z: a.z, s: a.s + sched.entry.dist, moving,
    u: span <= 0 ? 0 : clamp01((m - P[i].t) / span),
    heading: moving ? Math.atan2(-dz, dx) : (P[i].yaw != null ? P[i].yaw : YAW_BENCH),
  };
}

/* Roam region — see INTERFACE.md, "Moving a character". */
export const roam = {
  side: 'right',
  halfWidth: 0.50,            // true swept half-extent, metres
  work: { x: [1.50, 1.76], z: [-0.46, 0.38] },
  entry: { x: [1.50, 3.70], z: [-0.46, 0.38] },
};
export const ground = ['left_foot_link', 'right_foot_link'];
export const period = MASTER;          // phase-locked to the world task
export const entryEnd = sched.entry.dur;

/* ---- arm poses ----------------------------------------------------------
   Shoulder pitch/roll carry the crate (they move the elbows, and the crate
   hangs off the elbow midpoint); the elbows are free decoration. Left and
   right shoulders therefore stay in step, and the asymmetry — the right arm
   tucked harder, as though it has the heavier corner — lives in the elbows. */
const CARRY = {
  Left_Shoulder_Pitch: -1.05, Right_Shoulder_Pitch: -1.05,
  Left_Shoulder_Roll: -1.30, Right_Shoulder_Roll: 1.30,
  Left_Elbow_Pitch: -0.40, Right_Elbow_Pitch: -0.52,
  Left_Elbow_Yaw: -0.10, Right_Elbow_Yaw: 0.16,
};
/* the bottom of the lift: arms hanging, crate close to the shins. Paired with
   params.place this puts the crate bottom on the deck to within a millimetre */
const SET = {
  Left_Shoulder_Pitch: -0.45, Right_Shoulder_Pitch: -0.45,
  Left_Shoulder_Roll: -1.30, Right_Shoulder_Roll: 1.30,
  Left_Elbow_Pitch: -0.30, Right_Elbow_Pitch: -0.36,
  Left_Elbow_Yaw: -0.06, Right_Elbow_Yaw: 0.10,
};
/* hands hovering just above the rim — the "address", and the release */
const READY = {
  Left_Shoulder_Pitch: -0.56, Right_Shoulder_Pitch: -0.56,
  Left_Shoulder_Roll: -1.36, Right_Shoulder_Roll: 1.36,
  Left_Elbow_Pitch: -0.22, Right_Elbow_Pitch: -0.26,
  Left_Elbow_Yaw: -0.04, Right_Elbow_Yaw: 0.06,
};
/* hands off, arms at the sides: the only moment this character is not loaded */
const OFF = {
  Left_Shoulder_Pitch: -0.10, Right_Shoulder_Pitch: -0.10,
  Left_Shoulder_Roll: -1.47, Right_Shoulder_Roll: 1.47,
  Left_Elbow_Pitch: -0.14, Right_Elbow_Pitch: -0.20,
  Left_Elbow_Yaw: -0.03, Right_Elbow_Yaw: 0.05,
};

/* who it might glance at between jobs, in stage coordinates */
const COWORKERS = [
  { x: -1.36, z: 0.72 },    // pond-bot, hopping about downstage left
  { x: -1.82, z: -0.52 },   // the Go2 on its patrol
  { x: 1.66, z: 0.60 },     // the Z1 at the next bench
];

const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** a smooth 0->1->0 window over [a, b] with `e` of ramp at each end */
const win = (u, a, b, e) => clamp01(Math.min(smooth((u - a) / e), smooth((b - u) / e)));
/** stage heading from (x, z) toward (tx, tz) — see INTERFACE.md §3 */
const headingTo = (x, z, tx, tz) => Math.atan2(-(tz - z), tx - x);

/** one leg from the IK, sole kept flat on the deck */
function leg(ctx, side, fx, fz) {
  const ik = legIK(fx, fz, params.L1, params.L2, +1);
  ctx.set(side + '_Hip_Pitch', ik.hip);
  ctx.set(side + '_Knee_Pitch', ik.knee);
  ctx.set(side + '_Ankle_Pitch', -(ik.hip + ik.knee));
}

/** where a foot sits at gait phase q, in the hip frame, metres */
function footAt(q, stand) {
  const p = ((q % 1) + 1) % 1;
  if (p < params.duty) {
    // Stance: travel backward at exactly body speed, so not-skating is a
    // property of the construction rather than something to tune. The load
    // shows up as `give` — the knee yields just after touchdown and recovers,
    // which is vertical only and so costs the anti-skate invariant nothing.
    const a = p / params.duty;
    const sink = params.give * Math.sin(clamp01(a / 0.34) * Math.PI) * (a < 0.34 ? 1 : 0);
    return { fx: params.stance * (0.5 - a), fz: -stand + sink };
  }
  const b = (p - params.duty) / (1 - params.duty);
  return { fx: params.stance * (-0.5 + b), fz: -stand + params.lift * Math.sin(b * Math.PI) };
}

/** which beat of the day this is — used to vary the idle without any state */
function beatId(t) {
  if (t < entryEnd) return 0;
  const k = Math.floor((t - entryEnd) / period);
  const tt = (t - entryEnd) - k * period;
  return 1 + 2 * k + (tt >= period / 2 ? 1 : 0);
}

/** the heading of the next walk, if one is coming up within `ahead` seconds */
function upcoming(t, ahead) {
  for (let dt = 0.2; dt <= ahead; dt += 0.2) {
    const q = path(t + dt);
    if (q.moving) return { heading: q.heading, dt };
  }
  return null;
}
/** the heading of the walk that just ended, if it ended within `back` seconds */
function arriving(t, back) {
  for (let dt = 0.2; dt <= back; dt += 0.2) {
    const q = path(t - dt);
    if (q.moving) return q.heading;
  }
  return null;
}
/** shortest-arc blend between two headings */
const mixYaw = (a, b, w) => a + (((b - a + Math.PI * 3) % TAU) - Math.PI) * w;

/* ---- the head ----------------------------------------------------------
   Written last every frame and blended, never overwritten, so the work pose
   still reads underneath a glance. `want` is a world heading; the head yaw is
   relative to the trunk, so the body's own facing comes off first. */
function lookAt(ctx, bodyYaw, want, w) {
  const rel = clampTo(((want - bodyYaw + Math.PI * 3) % TAU) - Math.PI, -1.45, 1.45);
  ctx.set('AAHead_yaw', mix(ctx.get('AAHead_yaw'), rel, clamp01(w)));
}

/* ---- pointer overlay ----------------------------------------------------
   The worker acknowledges visitors, but attention is capped well below the
   frog's or the dog's: it is polite, not eager, and the job comes first. If
   the hands are mid-placement the glance simply waits — interrupting a lift
   would undo everything the rest of the file is trying to say. */
function regard(ctx, x, z, yaw, busy) {
  const p = ctx.pointer;
  if (!p.present || !p.atMyDepth) return;
  const w = Math.min(p.attention, params.regard) * (1 - busy);
  if (w < 0.02) return;
  lookAt(ctx, yaw, headingTo(x, z, p.atMyDepth.x, p.atMyDepth.z), w);
  ctx.add('Head_pitch', -0.10 * w);
  // a longer dwell earns one small nod of acknowledgement, then back to work
  const d = p.dwellMs;
  if (d > 850) {
    const n = clamp01((d - 850) / 900);
    ctx.add('Head_pitch', Math.sin(n * Math.PI * 2) * 0.16 * (1 - n) * w * 2);
  }
}

/* ================= walking ================= */
function walking(ctx, t, p) {
  const phi = (p.s * ctx.mps) / params.advance;
  for (const [side, off] of [['Left', 0], ['Right', 0.5]]) {
    const f = footAt(phi + off, params.stand);
    leg(ctx, side, f.fx, f.fz);
  }

  const sh = Math.sin(phi * TAU);
  const quiet = ctx.reducedMotion ? 0 : 1;
  // "Waist" sits between the trunk and the LEGS, so any waist yaw swings both
  // feet across the deck; while walking it has to stay tiny.
  ctx.set('Waist', 0.010 * sh * quiet);
  ctx.setAll(CARRY);
  // counterbalance: leans back against the load, and the arms hug it in
  ctx.add('Left_Shoulder_Pitch', -0.05); ctx.add('Right_Shoulder_Pitch', -0.05);
  ctx.add('Left_Shoulder_Roll', -0.10); ctx.add('Right_Shoulder_Roll', 0.10);
  ctx.set('Head_pitch', 0.12);
  ctx.set('AAHead_yaw', 0.06 * Math.sin(phi * Math.PI) * quiet);

  ctx.moveTo(p.x, p.z);
  ctx.face(p.heading);
  // The lateral chain is one rotational DOF per joint, so hip roll cannot shift
  // the pelvis without dragging the planted foot sideways with it (measured at
  // ~15% of body speed, which reads as a skate). The weight shift therefore
  // lives in the body tilt, which pivots about the character's floor point.
  //   ctx.tilt(a, b): `a` turns about the character's own forward axis (a
  // lateral ROLL) and `b` about its lateral axis (a fore-aft PITCH, positive =
  // leaning BACK) — verified by rendering, because the two are easy to swap.
  // So the step-to-step weight shift is `a` and the counterbalance is `b`.
  //   Both stay small: the grounding push happens BEFORE the tilt in the
  // transform chain, so a tilted body slides its own contact offset along the
  // deck by dy*sin(tilt), and dy bobs with the gait. The weight shift buys foot
  // slip at a fixed exchange rate — 0.075 rad measured 5.8%, over the 5% budget
  // — so this is as much sway as the walk can afford.
  ctx.tilt(-0.034 * sh * quiet, 0.030);
  ctx.holdProp();

  // clocking in: one nod to the viewer halfway across, then back to the job
  if (ctx.entering) {
    const n = win(p.u, 0.34, 0.62, 0.14);
    if (n > 0) {
      lookAt(ctx, p.heading, headingTo(p.x, p.z, p.x, p.z + 3), n * 0.9);
      ctx.add('Head_pitch', Math.sin(clamp01((p.u - 0.40) / 0.16) * Math.PI) * 0.30);
    }
  }
  regard(ctx, p.x, p.z, p.heading, 0.55);
}

/* ================= parked: the crate cycle ================= */
function working(ctx, t, p) {
  const id = beatId(t);
  const quiet = ctx.reducedMotion ? 0 : 1;
  // one hold in five is the long one: it stands all the way up and just looks
  // at the shop for a while. Rare on purpose — it only reads as a pause if the
  // other four are busy.
  const survey = id % 5 === 3;      // kept: an occasional long look at the shop

  /* --- hips and arms: two jobs, two shapes -------------------------------
     The bench cycle is the crate cycle this character already knew, re-aimed
     from the deck to a 0.42m bench: square up, descend, set down, stand all the
     way up and breathe, address, take the weight, lift. Every named beat below
     is unchanged. What it sets down is now a 50mm cube instead of a 500mm
     crate, so the descent is shallower and the arms do proportionally more of
     it — but the shape of the performance, which is the part that was authored,
     is the same.

     The reach is new and is the other half of the character: a deep squat out
     at the transfer spot to meet a frog. It has no torso pitch, so a squat is
     the only way down — the trap in the joint table, turned into the move. */
  const J = job(t);
  const S = params.stand, T = params.standTall;
  let hip, arms;

  if (J.kind === 'bench') {
    const u2 = J.u, C = params.bench;
    hip = track(u2, [
      [0.00, { h: S }], [SCAN1, { h: S }],
      [SQUARE, { h: S - 0.006 }],                     // settle before committing
      [0.33, { h: mix(S, C, 0.62) }],                 // the fast middle of the descent
      [RELEASE_U, { h: C }],                          // ...and a slow, careful arrival
      [SETTLE, { h: C }],
      [0.50, { h: mix(C, S, 0.55) }],
      [TOP0, { h: T }], [TOP1, { h: T }],             // stand all the way up: a breath
      [IDLE1, { h: S }],
      [ADDRESS, { h: S - 0.008 }],                    // anticipation: dip before reaching
      [REGRASP_U, { h: C }],
      [EFFORT, { h: C + 0.004 }],                     // effort onset — barely moves at first
      [0.90, { h: mix(C, S, 0.80) }],
      [0.955, { h: S + 0.004 }], [1.00, { h: S }],    // overshoot a hair, then settle
    ]).h;
    arms = track(u2, [
      [0.00, CARRY], [SQUARE, CARRY],
      [0.34, { ...SET }],                             // arms arrive early; knees finish
      [RELEASE_U, SET], [SETTLE, SET],
      [0.50, READY],                                  // hands come off the cube
      [TOP0, OFF], [IDLE1, OFF],
      [ADDRESS, READY],                               // hands set on the cube
      [REGRASP_U, SET], [EFFORT, SET],
      [0.92, CARRY], [1.00, CARRY],
    ]);
  } else if (J.kind === 'reach') {
    /* All the way down, hold while the frog arrives, all the way back up. The
       hold is wide on purpose: the frog is aiming at these hands at the top of
       a leap, and a moving target would be a miss. */
    const u2 = J.u, k = J.take;
    const down = clamp01((u2 - 0.04) / (k - 0.14));
    const up = clamp01((u2 - (k + 0.16)) / (1 - k - 0.22));
    const w = Math.min(smooth(down), 1 - smooth(up));
    hip = mix(S, params.reach, w) - 0.008 * win(u2, 0.02, k - 0.16, 0.04);
    arms = track(w, [[0, CARRY], [0.45, { ...SET }], [1, { ...OFF }]]);
  } else {
    /* between jobs: standing at its bench, weight easy, arms down */
    hip = S;
    arms = OFF;
  }
  const u = J.kind === 'idle' ? (p.u || 0) : J.u;

  /* --- breath and weight shift ------------------------------------------
     Gated to zero across the whole free window: while the crate is on the
     deck it is parented under the body, so a swaying torso would slide it. */
  const held = 1 - win(u, RELEASE_U - 0.05, REGRASP_U + 0.05, 0.05);
  // the ends of the hold belong to the walk on either side of it: everything
  // that oscillates fades out there so the two branches meet exactly
  const nextLeg = upcoming(t, 2.6);
  const edge = 1 - Math.max(1 - smooth(u / 0.06), nextLeg ? smooth((u - 0.94) / 0.06) : 0);
  const breath = Math.sin(t * 0.52) * quiet * edge * (survey ? 0.25 : 1);
  const shift = Math.sin(t * 0.31) * quiet * held * edge * (survey ? 0 : 1);
  const grip = 1 - win(u, RELEASE_U - 0.03, RELEASE_U + 0.03, 0.03)
    - win(u, REGRASP_U - 0.03, REGRASP_U + 0.03, 0.03);

  const h = hip + breath * 0.004 * grip;
  leg(ctx, 'Left', 0.004, -h);
  leg(ctx, 'Right', 0.004, -h);

  ctx.setAll(arms);
  ctx.set('Waist', shift * 0.05 * grip);
  // carrying leans back against the load; setting down squares up and levels off
  ctx.tilt(shift * 0.042, 0.026 * held);

  /* --- facing: pivot into and out of the hold ---------------------------
     A hold declares its own yaw, so the schedule's facing steps by up to 50
     degrees the instant a walk begins or ends. Turning through it across the
     same window the feet are re-planting in (below) turns that pop into a
     pivot — and it stays clear of the free window, where the facing has to be
     frozen or the crate on the deck would be dragged around with the body. */
  const next = nextLeg;
  const held0 = p.heading == null ? YAW1 : p.heading;
  let bodyYaw = held0;
  const camefrom = u < 0.06 ? arriving(t, 1.6) : null;
  if (camefrom != null) bodyYaw = mixYaw(camefrom, held0, smooth(u / 0.06));
  else if (next && u > 0.94) bodyYaw = mixYaw(held0, next.heading, smooth((u - 0.94) / 0.06));

  /* --- the head: intent, always one beat ahead of the hands -------------- */
  ctx.set('AAHead_yaw', 0);
  ctx.set('Head_pitch', track(u, [
    [0.00, { p: 0.12 }], [SCAN0, { p: 0.12 }],
    [SCAN1, { p: 0.66 }],                             // scans the spot before moving to it
    [SQUARE, { p: 0.58 }], [RELEASE_U, { p: 0.62 }],  // eyes on the crate all the way down
    [SETTLE, { p: 0.55 }],
    [TOP0, { p: 0.02 }], [TOP1, { p: -0.04 }],        // chin up at the top of the breath
    [IDLE1, { p: 0.04 }],
    [ADDRESS, { p: 0.60 }],                           // addresses the crate before reaching
    [REGRASP_U, { p: 0.58 }], [EFFORT, { p: 0.52 }],
    [0.94, { p: 0.14 }], [1.00, { p: 0.12 }],
  ]).p + breath * 0.03 * grip);

  // scan: a small sweep across the spot it is about to use
  ctx.add('AAHead_yaw', -0.26 * win(u, SCAN0, SQUARE, 0.06));
  // between work, it checks on somebody — a different somebody each time
  if (!survey) {
    const who = COWORKERS[id % COWORKERS.length];
    lookAt(ctx, bodyYaw, headingTo(p.x, p.z, who.x, who.z), 0.85 * win(u, IDLE0, IDLE1 + 0.01, 0.035));
  } else {
    // the long beat: upright, still, taking in the whole shop
    lookAt(ctx, bodyYaw, headingTo(p.x, p.z, 0, 0.1), 0.9 * win(u, TOP1 - 0.03, ADDRESS, 0.05));
  }

  /* --- intent precedes motion ------------------------------------------
     Before the feet go anywhere the head has already looked there. This is
     the single most important thing in the file: a biped that turns its head
     first reads as deciding, and one that does not reads as being dragged. */
  if (next) {
    const w = clamp01((2.6 - next.dt) / 1.7) * 0.9;
    lookAt(ctx, bodyYaw, next.heading, w);
    ctx.add('Head_pitch', -0.06 * w);
  }

  ctx.moveTo(p.x, p.z);
  ctx.face(bodyYaw);

  /* --- feet: prepare the step, and land out of the last one --------------
     The gait phase is driven by distance, so it is identical at the end of the
     walk into this hold and at the start of the walk out of it. Blending the
     feet to that same pose at both ends of the hold means the first step never
     pops — and because it happens standing still, the swing foot can be lifted
     and re-planted instead of sliding. */
  const phi = (p.s * ctx.mps) / params.advance;
  const land = 1 - smooth(u / 0.06);
  const leave = next ? smooth((u - 0.94) / 0.06) : 0;
  const blend = Math.max(land, leave);
  if (blend > 0.001) {
    for (const [side, off] of [['Left', 0], ['Right', 0.5]]) {
      const f = footAt(phi + off, h);
      const dx = f.fx - 0.004;
      // whichever foot has further to travel picks itself up to get there
      const step = Math.abs(dx) > params.stance * 0.25 ? params.lift * 0.7 : 0;
      leg(ctx, side, mix(0.004, f.fx, blend), -h + step * Math.sin(blend * Math.PI));
    }
  }

  const carrying = u < RELEASE_U || u >= REGRASP_U;

  /* --- reduced motion ---------------------------------------------------
     Shared code freezes time and hands out NO_POINTER, so the overlays above
     switch themselves off. All that is left to do is make the one frame it
     does show a good one: level the head, drop the lean, stand square. */
  if (ctx.reducedMotion) {
    ctx.set('AAHead_yaw', 0);
    ctx.set('Head_pitch', 0.10);
    ctx.tilt(0, 0);
  }

  /* --- pointer overlay, last, and it waits its turn ---------------------- */
  const busy = Math.max(win(u, SQUARE - 0.02, SETTLE, 0.03), win(u, ADDRESS - 0.02, 0.94, 0.03));
  regard(ctx, p.x, p.z, bodyYaw, busy * 0.94);
}

function body(ctx, t) {
  const p = path(t);
  if (p.moving) walking(ctx, t, p); else working(ctx, t, p);
}

export function entrance(ctx, t) { body(ctx, t); }
export function work(ctx, t) { body(ctx, t); }

/* ---- reactions ----------------------------------------------------------
   All three have to work while the crate is in its hands, because a click can
   land at any time and the crate is held for most of the loop. Anything that
   moves the two elbows by different amounts moves the crate, so a gesture that
   wants one arm has to pay for it with the other.

   Two runtime facts shape these. First, a reaction's `nudge` REPLACES the work
   pose's body tilt for as long as it runs, so every reaction that nudges at
   all re-states the carrying lean (LEAN) rather than letting it snap to level.
   Second, the nudge axes are the same ones ctx.tilt uses: rotZ is the fore-aft
   pitch (positive leans BACK) and rotX is the lateral roll — worth knowing,
   because a robot with no torso pitch can only bow from the whole body. */
const LEAN = 0.028;

export const reactions = [
  {
    /* A courteous bow with a beat held at the bottom. T1 cannot bend its back,
       so this is a hip hinge in the joints plus a whole-body pitch in the
       nudge; the two together read as one bend instead of a squat. The head
       arrives and leaves a fraction late, which is the whole difference
       between a bow and a nod. */
    name: 'bow',
    duration: 1.60,
    update(ctx, t) {
      const b = smooth(clamp01(t / 0.28)) - smooth(clamp01((t - 0.70) / 0.30));
      ctx.add('Left_Hip_Pitch', -0.42 * b); ctx.add('Right_Hip_Pitch', -0.42 * b);
      ctx.add('Left_Knee_Pitch', 0.19 * b); ctx.add('Right_Knee_Pitch', 0.19 * b);
      ctx.add('Left_Ankle_Pitch', 0.22 * b); ctx.add('Right_Ankle_Pitch', 0.22 * b);
      const late = smooth(clamp01((t - 0.07) / 0.30)) - smooth(clamp01((t - 0.77) / 0.30));
      ctx.add('Head_pitch', 0.34 * late);
      // the arms swing a little forward and settle back — the load noticing
      ctx.add('Left_Shoulder_Pitch', -0.22 * b); ctx.add('Right_Shoulder_Pitch', -0.22 * b);
      ctx.add('Left_Elbow_Pitch', 0.14 * b); ctx.add('Right_Elbow_Pitch', 0.10 * b);
      ctx.nudge({ rotZ: LEAN - 0.22 * b });
    },
  },
  {
    /* A one-arm wave — while still holding the crate. The crate hangs from the
       midpoint of the two elbows, so the waving shoulder is mirrored exactly by
       the other one: one hand comes up to wave, the other slides down the side
       of the crate, and the load itself never moves a millimetre. Roll brings
       an arm DOWN and IN, so waving means unrolling it, and the left arm's roll
       is the negative one (INTERFACE.md §7). The flap lives in the elbow, which
       cannot disturb the crate at all. */
    name: 'wave',
    duration: 1.45,
    update(ctx, t, dir) {
      const w = win(t, 0.0, 1.0, 0.26);
      const right = dir >= 0;
      const near = right ? 'Right' : 'Left', far = right ? 'Left' : 'Right';
      const sgn = right ? 1 : -1;
      ctx.add(near + '_Shoulder_Pitch', -0.50 * w);
      ctx.add(far + '_Shoulder_Pitch', 0.50 * w);       // the counterweight
      ctx.add(near + '_Shoulder_Roll', sgn * 0.42 * w); // unroll: arm comes out
      ctx.add(far + '_Shoulder_Roll', -sgn * 0.42 * w);
      const flap = Math.sin(t * Math.PI * 5.2) * w;
      ctx.add(near + '_Elbow_Pitch', 0.80 * w + 0.30 * flap);
      ctx.add(near + '_Elbow_Yaw', sgn * 0.45 * w);
      ctx.add('AAHead_yaw', -sgn * 0.28 * w);
      ctx.add('Head_pitch', -0.14 * w);
      ctx.nudge({ rotY: sgn * 0.05 * w, rotZ: LEAN });
    },
  },
  {
    /* Hefting the load: a dip and a hoist, the way you re-settle something
       heavy that has slipped an inch through your hands. Perfectly symmetric,
       so the crate rides straight up and comes back down — the most
       in-character answer this robot has to being spoken to. */
    name: 'heft',
    duration: 1.05,
    update(ctx, t) {
      const dip = t < 0.26 ? Math.sin(clamp01(t / 0.26) * Math.PI) : 0;
      const up = arc(clamp01((t - 0.20) / 0.80));
      ctx.add('Left_Knee_Pitch', 0.34 * dip - 0.10 * up); ctx.add('Right_Knee_Pitch', 0.34 * dip - 0.10 * up);
      ctx.add('Left_Hip_Pitch', -0.17 * dip + 0.05 * up); ctx.add('Right_Hip_Pitch', -0.17 * dip + 0.05 * up);
      ctx.add('Left_Ankle_Pitch', -0.17 * dip + 0.05 * up); ctx.add('Right_Ankle_Pitch', -0.17 * dip + 0.05 * up);
      ctx.add('Left_Shoulder_Pitch', -0.34 * up); ctx.add('Right_Shoulder_Pitch', -0.34 * up);
      ctx.add('Left_Elbow_Pitch', -0.20 * up); ctx.add('Right_Elbow_Pitch', -0.24 * up);
      ctx.add('Head_pitch', 0.16 * dip - 0.10 * up);
      ctx.nudge({ posY: 0.030 * up, rotZ: LEAN + 0.05 * dip });
    },
  },
];

export default { key: 't1', params, roam, ground, period, entryEnd, entrance, work, reactions };
