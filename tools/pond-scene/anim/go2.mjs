/* Unitree Go2 — the sentry. A working dog on patrol: alert, rhythmic,
   economical, with just enough dog-brain leaking through to be likeable.

   OWNED BY THE GO2 SPECIALIST. Everything this file imports is shared and must
   not be edited from here. See INTERFACE.md.

   Everything below is a pure function of `t`. Where this file wants a
   derivative (how hard the body is accelerating right now) it re-evaluates the
   shared schedule at t ± h rather than remembering the last frame, so the
   offline tools can sample time out of order and still get the same picture the
   browser does. */

import { legIK } from './kinematics.mjs';
import { plan, follow, clamp01, smooth, track, TAU, EASE } from './schedule.mjs';
import { MASTER, STATIONS, makeRoute, routeAt, masterPhase } from './world.mjs';

export const params = {
  L: 0.2130,          // both leg links, metres
  stand: 0.335,       // hip above foot, metres
  stance: 0.130,      // ground covered per stance, metres
  duty: 0.75,         // three feet down at a time: a crawl
  lift: 0.058,        // swing apex, metres
  speed: 0.30,        // stage units per second
  hold: 4.2,          // seconds parked at each waypoint
  entrySpeed: 0.42,
  scan: 0.30,         // trunk sweep amplitude while parked, radians
  vicinity: 1.30,     // pointer-attention radius, stage units

  /* --- body dynamics, coupled to the stride ------------------------------
     All of these are degrees-scale on purpose. A quadruped chassis is stiff;
     the read we want is "there is mass on those legs", not a cartoon lurch. */
  leanPerAccel: 0.009,  // radians of nose-down per stage-unit/s^2
  leanMax: 0.038,       // ~2.2 deg, the cap on that lean
  rollStance: 0.015,    // ~0.9 deg of roll toward the supported side
  pitchStride: 0.013,   // stride-frequency pitch, before stabilisation
  gazeHold: 0.62,       // how much of the stride pitch the "neck" cancels
  bob: 0.006,           // vertical life at twice stride frequency, metres

  /* --- swing shaping ----------------------------------------------------- */
  toeOff: 0.74,         // <1 pushes the apex early: quick lift, slow descent
  apexBias: 1.22,       // >1 flattens the top of the arc into a carry

  /* --- patrol beats ------------------------------------------------------ */
  settle: 0.019,        // metres the body sinks as weight arrives
  sniff: 0.105,         // metres the front end drops to sniff
  breathe: 0.0038,      // idle breathing, metres
};
params.advance = params.stance / params.duty;   // metres per full gait cycle

/* crawl sequence: left-front, right-hind, right-front, left-hind. With
   duty 0.75 and quarter-cycle offsets exactly one foot is airborne at a time,
   which is what lets every flourish in this file be aimed at the swing leg
   without ever disturbing a planted one. */
const LEGS = [['FL', 0], ['RR', 0.25], ['FR', 0.5], ['RL', 0.75]];
const HIP = { FL: 0.04, RL: 0.04, FR: -0.04, RR: -0.04 };
/* Where each foot stands in the robot's own frame at the neutral pose, metres:
   x forward, y left. Measured from the built FK, not from the URDF's hip
   origins — the abduction offset in HIP puts the contact patch wider than the
   hip. These are what a trunk yaw has to be undone against. A hip joint of
   +1 rad moves its foot +`stand` in y (verified against the same FK), which is
   what makes the lateral correction a single division. */
const FOOT_AT = {
  FL: { x: 0.193, y: 0.142 }, FR: { x: 0.193, y: -0.142 },
  RL: { x: -0.193, y: 0.142 }, RR: { x: -0.193, y: -0.142 },
};
/* which side of the body each leg is on: rolling toward the stance side means
   rolling away from whichever leg is currently in the air */
const SIDE = { FL: 1, RL: 1, FR: -1, RR: -1 };

/* waypoints, in the left band. Shallow and mostly in depth: the screen-x of a
   world point drifts with viewport aspect through its depth, so a deep patrol
   would make the horizontal composition move between viewports. */
/* ---------------------------------------------------------------- the beat --
   This dog now works to the score (anim/world.mjs) rather than to a private
   patrol. It is the stage's only long-haul carrier: the arm can reach 0.74m and
   the frog can carry something 50mm, but moving a load a metre and a half
   across the floor is what a quadruped with a flat back is FOR.

   Its round, in master seconds:

      0..19   crouched at the loading bay while the arm works over it (arm
              releases onto its back at 18)
     19..23   walks out to the transfer point, cube on its back
     23..42   lies right down and waits — a 97mm frog cannot reach a back that
              is 400mm up, so the dog has to come to it (frog takes at 36)
     42..49   back to its patrol post
     49..68   its own beats: scan, sniff, watch
     68..87   out to the transfer point again, and down (frog gives back at 85)
     87..96   carries it home to the loading bay for the arm (arm takes at 92)

   The waypoints carry ARRIVAL TIMES, not a speed — the score sets deadlines and
   the walk has to fit them. routeAt() turns that into position AND cumulative
   distance, and everything below still drives its gait phase from distance,
   never from the clock, so the anti-skate invariant is untouched. */
const OFFSTAGE = { x: -3.60, z: -0.64 };
const LOAD = STATIONS.go2Load, HAND = STATIONS.h2Handoff, POST = STATIONS.go2Patrol;

/* `yaw` on a wait PINS the facing. It matters at the loading bay: the arm has
   one target for the cube on this dog's back, so the dog has to present its
   back the same way on both visits — otherwise arriving from the patrol rather
   than from the transfer point rotates the target by most of a right angle and
   the handoff misses by 110mm. Both visits also leave a settled second either
   side of the moment the arm actually touches the cube. */
/* Broadside to the arm — its back square to the reach, not its nose. The carry
   point rides 0.10 forward of the body centre, so facing the arm head-on or
   away from it swings that 0.10 straight along the reach and moves the target
   by 200mm between the two. Perpendicular, it moves sideways instead, which
   costs the arm almost nothing and is what "presenting your back" means. */
const LOAD_YAW = 0.695;
/* Same reasoning at the transfer point, and it matters more now: the H2 bends
   to ONE place, so the back has to be presented the same way whether the dog
   arrived from the bay or from its patrol post. Without this the two visits
   differ by 185mm — twice the carry offset — because the dog is facing
   opposite ways. It pivots its trunk over planted feet to get there, which the
   foot compensation downstairs already knows how to do. */
const HAND_YAW = -1.471;
/* Retimed to the conveyor score. The dog is loaded by the arm at the bay
   (0..16), carries the cube to the flagship's station (16..22), holds still and
   low while the H2 lifts it off (22..34), goes back on patrol while the belt
   does the crossing (34..76), comes back to be re-loaded by the H2 (76..87) and
   carries it home (87..96). */
const ROUTE = makeRoute([
  /* It must still be STANDING STILL at 18, when the arm lets go of the cube on
     its back — a dog that has already taken its first step has moved the target
     150mm. So the hold runs a beat past the ownership change and the walk
     starts after it. */
  { t: 0, ...LOAD, yaw: LOAD_YAW }, { t: 19.5, ...LOAD, yaw: LOAD_YAW },
  { t: 22.5, ...HAND, yaw: HAND_YAW }, { t: 36, ...HAND, yaw: HAND_YAW },
  { t: 42, ...POST }, { t: 70, ...POST },
  { t: 76, ...HAND, yaw: HAND_YAW }, { t: 88, ...HAND, yaw: HAND_YAW },
  { t: 92, ...LOAD, yaw: LOAD_YAW }, { t: 96, ...LOAD, yaw: LOAD_YAW },
]);

/* How low it gets. Standing, its back is 0.49 off the deck; a frog at the top
   of its hop reaches about 0.22. So "crouch" here means LIE DOWN — hip over
   foot drops from 0.335 to 0.075, which puts the trunk on the deck and the back
   within a frog's leap. This is the one moment the two scales in this scene
   have to actually touch, and it only works because the dog gives way. */
const STAND_TALL = params.stand;   // 0.335 — walking
const STAND_MID = 0.185;           // being loaded by the arm
const STAND_LOW = 0.175;           // folded flat for the flagship — see below
                                   // FLOOR: by 0.100 the calf joint is at
                                   // -2.665 of its -2.72 limit and the thigh is
                                   // near the top of its range. A real Go2
                                   // cannot fold flatter than this, so the frog
                                   // has to make up the difference with its
                                   // leap, which is the right way round anyway.

/* Two different amounts of giving way, and both are forced by reach, not taste.

   For the arm: the Z1's wrist can only get (L1+L2)*0.965 from its shoulder, and
   a back standing 0.50 up and 0.53 out is outside that — the IK clamps and the
   gripper stops 46mm short, which is a miss. Dropping to 0.23 brings the back
   to 0.42 and the whole reach inside the envelope.

   For the frog: 97mm tall, hopping. Nothing short of lying down is reachable. */
/** ramp up over [a,b], hold, ramp down over [c,d], on a clock rebased to `at` */
function window(t, at, a, b, c, d) {
  const m = masterPhase(t - at);
  return Math.max(0, Math.min(smooth(clamp01((m - a) / (b - a))), 1 - smooth(clamp01((m - c) / (d - c)))));
}

/** 0..1 how far into a crouch it is — patrol flourishes fade out against this */
function crouchWeight(t) {
  const low = Math.max(window(t, 0, 22, 25, 34, 36), window(t, 0, 76, 79, 87, 88));
  const mid = window(t, 86, 0, 2, 28, 30);
  return Math.max(0, Math.min(1, Math.max(low, mid * 0.55)));
}

function standAt(t) {
  /* Lying down for the FLAGSHIP, twice: the H2 lifts the cube off its back at
     26..34 and puts it back at 80..87. It is the same fold the frog used to ask
     for, and for the same reason — the thing reaching for the cube cannot get
     that low on its own, so the dog gives way. A 1.83m humanoid folded over a
     dog folded flat is the size story of the whole scene in one picture. */
  const low = Math.max(window(t, 0, 22, 25, 34, 36), window(t, 0, 76, 79, 87, 88));
  /* and the loading crouch for the arm, which WRAPS the master boundary. It has
     to be down at 92, when the arm takes the cube off the back, and still down
     at 18, when the arm puts the next one on — one hold spanning 86..20, not
     two. Getting this window wrong does not look wrong; it just moves the back
     by 150mm between the two visits and the handoff assertion fails. */
  const mid = window(t, 86, 0, 2, 28, 30);
  const wm = mid * (1 - low);
  return STAND_TALL + (STAND_LOW - STAND_TALL) * low + (STAND_MID - STAND_TALL) * wm;
}

/* the entrance is still a real walk on, straight to the loading bay */
const sched = plan(
  [{ from: OFFSTAGE, to: LOAD, speed: params.entrySpeed }, { hold: 1.0, at: LOAD }],
  [{ from: LOAD, to: LOAD }], params.speed);

/** follow(), but reading the score instead of a private schedule */
function path(t) {
  if (t < sched.entry.dur) return follow(sched, t);
  const a = routeAt(ROUTE, t);
  // heading: the direction of the leg being walked, held through the waits
  const P = ROUTE.pts, mm = masterPhase(t);
  let h = 0, cur = 0;
  for (let i = 0; i < P.length - 1; i++) if (mm >= P[i].t) cur = i;
  if (P[cur].yaw != null && Math.hypot(P[cur + 1].x - P[cur].x, P[cur + 1].z - P[cur].z) < 1e-4) {
    h = P[cur].yaw;                       // a pinned wait
  } else {
    for (let i = P.length - 1; i >= 0; i--) {
      const b = P[Math.min(i + 1, P.length - 1)];
      const dx = b.x - P[i].x, dz = b.z - P[i].z;
      if (Math.hypot(dx, dz) > 1e-4 && mm >= P[i].t) { h = Math.atan2(-dz, dx); break; }
    }
  }
  // `u` is progress within the current leg or wait — the patrol beats read it
  const P2 = ROUTE.pts; const m2 = masterPhase(t);
  let i2 = 0;
  for (let i = 0; i < P2.length - 1; i++) if (m2 >= P2[i].t) i2 = i;
  const span = P2[i2 + 1].t - P2[i2].t;
  const u = span <= 0 ? 0 : clamp01((m2 - P2[i2].t) / span);
  return { x: a.x, z: a.z, s: a.s + sched.entry.dist, heading: h, moving: a.moving, u };
}

/* Roam region. Shared code clamps ctx.moveTo() into this, so a waypoint moved
   outside it simply does not take effect. Every station it visits was solved
   against the composition — see the assertion in selftest.js. */
export const roam = {
  side: 'left',
  halfWidth: 0.35,            // true swept half-extent, metres
  work: { x: [-1.90, -1.36], z: [-0.40, 1.10] },
  entry: { x: [-3.70, -1.36], z: [-0.64, 1.10] },
};
export const ground = ['FL_foot', 'FR_foot', 'RL_foot', 'RR_foot'];
export const period = MASTER;          // phase-locked to the world task
export const entryEnd = sched.entry.dur;

/* ---------------------------------------------------------------- helpers */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** deterministic 0..1 from an integer — variety without hidden state */
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** 0..1..0, smooth at both ends: the shape of a settle, a bob, a hold */
const bump = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(clamp01(u) * Math.PI) ** 1.4);
/** time window helper: 0..1 across [a, b], 0 outside */
const win = (x, a, b) => (x <= a || x >= b ? 0 : (x - a) / (b - a));

/* Where we are in the schedule, plus which leg of it and which lap — the lap
   number is what makes the patrol beats vary instead of metronome. */
function locate(t) {
  if (t < sched.entry.dur) return { idx: 0, lap: 0, entering: true };
  const m = masterPhase(t);
  let idx = 0;
  for (let i = 0; i < ROUTE.pts.length - 1; i++) if (m >= ROUTE.pts[i].t) idx = i;
  return { idx, lap: Math.floor(t / MASTER) + 1, entering: false };
}

/* Speed and acceleration along the path, by re-sampling the shared schedule.
   Acceleration is what the lean is made of: schedule.follow() eases the first
   and last 12% of every leg, so leaving a waypoint really does have a push and
   arriving really does have a check — the body just has to show it. */
function dynamics(t) {
  const h = 1 / 24;
  if (t < h) return { v: 0, a: 0 };
  const s0 = path(t - h).s, s1 = path(t).s, s2 = path(t + h).s;
  return { v: (s2 - s0) / (2 * h), a: (s2 - 2 * s1 + s0) / (h * h) };
}

/* The heading, but turned into rather than cut to.

   schedule.follow() reports the heading of whichever leg is current, so at a
   waypoint the facing changes in a single frame — the body was snapping round
   between the hold and the walk. Averaging the heading over a window either
   side of now (as a unit vector, so it is angle-safe) spreads that change into
   a real turn that starts before the first step and finishes just after it.
   The difference from the raw heading is returned separately: it is fed
   through the same foot compensation as the scan, so the dog pivots its trunk
   over planted feet instead of dragging them round. */
function heading(t, raw) {
  const w = 0.34, n = 6;
  let sx = 0, sz = 0;
  for (let i = -n; i <= n; i++) {
    const k = 1 - Math.abs(i) / (n + 1);                // triangular weight
    const h = path(Math.max(0, t + (i / n) * w)).heading || 0;
    sx += Math.cos(h) * k; sz += Math.sin(h) * k;
  }
  const smoothed = Math.atan2(sz, sx);
  return ((smoothed - raw + Math.PI * 3) % TAU) - Math.PI;
}

/* One swing foot, in the hip frame, in metres.

   Horizontal: a cubic Hermite whose end slopes match the stance slope exactly.
   That is swing-leg retraction — the foot swings ahead of where it will land
   and is already travelling backward at ground speed when it touches down, so
   the plant is a continuation rather than a jolt. It is also what keeps the
   slip budget honest: velocity is continuous across every phase boundary.

   Vertical: not a triangle and not a symmetric sine. `toeOff < 1` warps the
   phase so the foot leaves the deck quickly, and the exponent flattens the top
   into a carry, leaving a long soft descent onto the heel. */
function swing(b, stance, duty, lift) {
  const p0 = -stance / 2, p1 = stance / 2;
  const m = -stance * (1 - duty) / duty;          // stance slope, per unit b
  const b2 = b * b, b3 = b2 * b;
  const fx = (2 * b3 - 3 * b2 + 1) * p0 + (b3 - 2 * b2 + b) * m
    + (-2 * b3 + 3 * b2) * p1 + (b3 - b2) * m;
  const shaped = Math.sin(Math.PI * Math.pow(b, params.toeOff)) ** params.apexBias;
  return { fx, fz: lift * shaped };
}

/* --------------------------------------------------------- patrol beats ---
   A waypoint is not a pause, it is a paragraph: arrive, let the weight land,
   then do one or two dog things, then be ready to leave. The pieces are chosen
   from the lap number and the leg number, so the same corner is not performed
   the same way twice in a row and nothing is ever exactly on the beat. */
/* Weighted on purpose: the job is scanning, the charm is the sniff, and a
   sentry that sniffed at every corner would be a different character. */
const BEATS = ['scan', 'scanBack', 'watch', 'scan', 'sniff', 'watch', 'scanBack', 'sniff'];

function beatPlan(seed) {
  const a = BEATS[Math.floor(hash(seed) * BEATS.length) % BEATS.length];
  let b = BEATS[Math.floor(hash(seed + 41) * BEATS.length) % BEATS.length];
  if (b === a) b = BEATS[(BEATS.indexOf(a) + 1) % BEATS.length];
  // jitter the split so two beats never land on the same clock twice
  const split = 0.54 + (hash(seed + 7) - 0.5) * 0.14;
  return [
    { kind: a, t0: 0.20, t1: split },
    { kind: b, t0: split + 0.02 + hash(seed + 13) * 0.05, t1: 0.985 },
  ];
}

/** returns { yaw, drop, frontDrop, pitch } for the parked body, in radians/metres */
function beats(u, seed) {
  const out = { yaw: 0, drop: 0, frontDrop: 0, pitch: 0 };

  // 1. the weight arrives. The body sinks onto the legs and rebounds, and the
  //    nose dips a touch with it — one beat, before anything else happens.
  const s = win(u, 0, 0.19);
  out.drop += params.settle * bump(s) * 1.0;
  out.pitch += 0.020 * bump(s) * (1 - s);

  // 2. breathing, always, so a parked sentry is never a still image
  out.drop += params.breathe * Math.sin(u * TAU * 2.5 + seed);

  for (const b of beatPlan(seed)) {
    const w = win(u, b.t0, b.t1);
    if (w <= 0) continue;
    if (b.kind === 'scan' || b.kind === 'scanBack') {
      // a sweep with two interest-holds at nothing in particular. The holds are
      // what sell it: a scan that never stops reads as a machine sweeping, a
      // scan that catches on something reads as an animal looking.
      const dir = b.kind === 'scan' ? 1 : -1;
      /* amplitude varies per visit, but the ceiling is set by the frame-edge
         budget, not by taste: a broadside sentry is the widest this character
         ever gets, and the 1280x1400 viewport has very little to spare. */
      const amp = params.scan * (0.60 + hash(seed + 3) * 0.34);
      out.yaw += dir * amp * track(w, [
        [0.00, { y: 0 }], [0.20, { y: 1 }], [0.34, { y: 0.96 }],
        [0.46, { y: 0.18 }], [0.66, { y: -0.82 }], [0.80, { y: -0.78 }],
        [1.00, { y: 0 }],
      ]).y;
      out.pitch += -0.012 * Math.sin(w * Math.PI);        // chin up a hair, alert
    } else if (b.kind === 'sniff') {
      // nose down, slow, two small micro-bobs at the bottom, back up. The drop
      // is made by shortening the FRONT legs rather than pitching the whole
      // body: the elbows fold, which is both more doglike and much kinder to
      // the frame-edge budget than rotating a 0.45 m body about its floor point.
      const down = track(w, [
        [0.00, { y: 0 }], [0.26, { y: 1 }], [0.74, { y: 1 }], [1.00, { y: 0 }],
      ]).y;
      const held = clamp01((w - 0.26) / 0.48);
      const bobs = w > 0.26 && w < 0.74 ? Math.sin(held * TAU * 2) * 0.22 * Math.sin(held * Math.PI) : 0;
      out.frontDrop += params.sniff * (down + bobs);
      out.pitch += 0.055 * down;                          // and the nose goes down with it
      out.yaw += 0.06 * Math.sin(w * TAU) * down;         // casting about
    } else {
      // 'watch': the economical one. Hold the line, one slow weight shift, one
      // small chin lift. A sentry that is doing nothing is still working.
      out.yaw += 0.055 * Math.sin(w * TAU - 0.6);
      out.drop += 0.004 * Math.sin(w * TAU * 1.5);
      out.pitch += -0.010 * bump(w);
    }
  }
  return out;
}

/* ------------------------------------------------------------- the body ---
   Order of business: where the schedule says we are, what the legs are doing,
   what the trunk is doing about it, then the pointer overlay on top. */
function body(ctx, t) {
  const p = path(t);
  const loc = locate(t);
  const seed = loc.lap * 17 + loc.idx * 5 + 1;

  /* Reduced motion: no gait, no scan, no drift. The sentry simply stands at
     its post in an alert, weight-even pose. Shared code has already neutered
     ctx.pointer, so the overlay below switches itself off too — the pose is a
     constant, which is exactly what "prefers-reduced-motion" is asking for. */
  if (ctx.reducedMotion) {
    for (const [leg] of LEGS) {
      const ik = legIK(leg[0] === 'F' ? 0.010 : -0.010, -standAt(t), params.L, params.L, -1);
      ctx.set(leg + '_thigh_joint', ik.hip);
      ctx.set(leg + '_calf_joint', ik.knee);
      ctx.set(leg + '_hip_joint', HIP[leg]);
    }
    ctx.moveTo(A.x, A.z);
    ctx.face(-Math.PI / 2 + 0.35);
    ctx.tilt(-0.015, 0);
    ctx.noProp();
    return p;
  }

  const phi = (p.s * ctx.mps) / params.advance;   // gait phase, driven by distance
  const dyn = dynamics(t);
  // the patrol beats belong to a waypoint hold; while walking, the job is walking
  /* The patrol beats — the settle, the weight rock, the sniff that folds the
     front elbows — are flourishes ON TOP of a normal stance. Run them while the
     dog is already folded flat and they drive the calf past its -2.72 limit and
     the thigh past 3.49: the runtime clamps, the pose stops matching the
     reference FK, and the leg visibly locks. They belong to the patrol post, so
     they fade out against the crouch. */
  const crouched = crouchWeight(t);
  const raw = p.moving ? { yaw: 0, drop: 0, frontDrop: 0, pitch: 0 } : beats(p.u, seed);
  const parked = {
    yaw: raw.yaw * (1 - crouched),
    drop: raw.drop * (1 - crouched),
    frontDrop: raw.frontDrop * (1 - crouched),
    pitch: raw.pitch * (1 - crouched),
  };

  /* ---- what the trunk is pointing at ----------------------------------
     No neck joint on this robot: the trunk IS the head. Which means two
     things at once — the scan has to be a torso swivel, and the stride's own
     wobble has to be taken back out again or the "gaze" bounces with every
     footfall. Both are handled as a single yaw/pitch offset from the heading,
     compensated at the feet below so a swivel never drags a planted foot. */

  // stride-frequency pitch, mostly cancelled: vestibular hold. A real dog's
  // head stays remarkably level over a walking body; keeping ~38% of the
  // oscillation leaves the body reading as sprung without the camera-shake.
  const stridePitch = params.pitchStride * Math.sin(phi * TAU + 0.9) * (1 - params.gazeHold);
  // lean into acceleration: nose down pushing off, nose up checking into a stop.
  // Subtracted from `pitch` below, where negative is nose-down.
  const lean = clamp(dyn.a * params.leanPerAccel, -params.leanMax, params.leanMax);

  // one mid-entrance head-check toward the viewer: the patrol notices us, does
  // not stop, and carries on to its post.
  let headCheck = 0;
  if (ctx.entering) {
    const e = win(t / Math.max(1e-3, sched.entry.legs[0].t1), 0.42, 0.72);
    if (e > 0) headCheck = -0.26 * Math.sin(EASE(e) * Math.PI);
  }

  // anticipation: in the last third of a hold the weight shifts forward before
  // the first step, so the walk starts from a lean and not from a freeze
  const leaving = p.moving ? 0 : win(p.u, 0.72, 1);
  const anticipate = 0.026 * smooth(leaving);

  /* ---- pointer overlay -------------------------------------------------
     Prey drive with manners. Attention comes in fast and lets go slowly, so
     the dog snaps onto something moving and then unsticks reluctantly rather
     than flicking back to work.

     It is layered here, before the legs are solved, precisely so it can go
     through the same yaw compensation the scan does: the overlay is allowed to
     swivel the trunk, and the feet are told about it, and nothing is ever
     written onto a leg directly. Shared code hands us NO_POINTER under reduced
     motion, so this whole block switches itself off. */
  const ptr = ctx.pointer;
  let ptrYaw = 0, ptrPitch = 0, ptrRoll = 0;
  if (ptr.present && ptr.attention > 0.001 && ptr.atMyDepth) {
    // `speed` is the pursuit trigger and `dwellMs` is the only memory a pure
    // function of time is allowed. A pointer that has stopped keeps its grip
    // for about a second and then gradually gives it back: fast in, slow out.
    const chase = clamp01(ptr.speed / 0.55);
    const linger = 1 - clamp01((ptr.dwellMs - 900) / 2200);
    const w = clamp01(ptr.attention * (0.55 + 0.45 * chase)) * (0.35 + 0.65 * linger);

    const want = Math.atan2(-(ptr.atMyDepth.z - p.z), ptr.atMyDepth.x - p.x);
    // shortest way round, then held to what a torso swivel can honestly do
    let d = ((want - (p.heading || 0) - parked.yaw - headCheck) % TAU + Math.PI * 3) % TAU - Math.PI;
    d = clamp(d, -0.55, 0.55);
    ptrYaw = d * w * 0.85;

    // ear-perk equivalent: a quick trunk tilt when something close is moving.
    // Small, fast, gone again — a twitch, not a pose.
    const perk = clamp01((ptr.attention - 0.45) / 0.55) * chase;
    // the curious step-toward. Position is clamped to a point, so the impulse
    // is spent as a lean: weight over the front feet, as if about to come and
    // have a look.
    const step = clamp01((ptr.dwellMs - 400) / 900) * clamp01(1 - ptr.distance / (params.vicinity * 0.65));
    ptrPitch = 0.055 * step * (1 - 0.5 * chase) + 0.018 * perk;
    ptrRoll = -0.045 * perk * Math.sign(d || 1);
  }

  /* The turn is capped: a patrol leg can reverse direction, and blending the
     whole 180 deg would swing the dog broadside, which is the widest it ever
     reads on screen — and the 1280x1400 crop has about a percent to spare
     (`node preview.js extents`). Capped, the facing still rotates into the
     next leg instead of cutting to it, but never presents full flank. At
     +-0.30 rad the go2's worst edge slack is 1.4%; uncapped it was 0.5%. */
  const turn = clamp(heading(t, p.heading || 0), -0.30, 0.30);
  const yawOff = turn + parked.yaw + headCheck + ptrYaw;
  // negative pitch is nose-down (verified against the built FK)
  const pitch = -0.012 - lean - stridePitch - anticipate - parked.pitch - ptrPitch;

  /* ---- roll toward the stance side ------------------------------------
     Exactly one foot is in the air at a time, so the support polygon is
     biased away from it; the body leans onto the three legs that are holding
     it up. One degree, but it is the difference between a walk cycle and a
     walking dog. */
  let roll = 0, swingSide = 0;
  /* smooth support bias: each leg's airborne-ness, faded in and out, summed
     with its side. A step function here would jerk the whole body between
     footfalls — and, because tilt pivots the floor point, would show up in the
     slip budget as skating. */
  if (p.moving) {
    for (const [leg, off] of LEGS) {
      const q = (phi + off) % 1;
      if (q < params.duty) continue;
      const b = (q - params.duty) / (1 - params.duty);
      swingSide += SIDE[leg] * Math.sin(b * Math.PI) ** 2;
    }
  }

  /* ---- the legs -------------------------------------------------------- */
  const gather = p.moving ? win(p.u, 0.86, 1) : 0;   // final half-step, see below
  for (const [leg, off] of LEGS) {
    let fx, fz;
    if (p.moving) {
      const q = (phi + off) % 1;
      if (q < params.duty) {                        // stance: the foot tracks the ground
        fx = params.stance * (0.5 - q / params.duty);
        fz = -standAt(t);
      } else {
        /* swing. On the last stretch into a waypoint the foot is carried lower
           and set down softer: a gather, not a freeze. Note what is NOT done
           here — the stride is not shortened. Shortening it would land the foot
           somewhere the next stance phase does not expect, and that mismatch is
           a real foot-pop at plant; the same illusion is available for free
           from the flatter carry and the arrival settle. */
        const b = (q - params.duty) / (1 - params.duty);
        const g = smooth(gather);
        const sw = swing(b, params.stance, params.duty, params.lift * (1 - 0.38 * g));
        fx = sw.fx;
        fz = -standAt(t) + sw.fz;
      }
      fz += params.bob * Math.sin(phi * TAU * 2);   // a little vertical life
    } else {
      // standing sentry: a slow weight rock, and one foot re-plants now and
      // then — the small correction a real dog makes without thinking about it
      const s = Math.sin(p.u * TAU);
      fx = (leg[0] === 'F' ? 0.012 : -0.012) + 0.010 * s;
      fz = -standAt(t) + SIDE[leg] * 0.006 * s + parked.drop;
      const stepAt = { FL: 0.30 + hash(seed) * 0.06, RR: 0.62 + hash(seed + 2) * 0.06 }[leg];
      if (stepAt != null) {
        const b = win(p.u, stepAt, stepAt + 0.10);
        if (b > 0) { fz += params.lift * 0.7 * Math.sin(b * Math.PI); fx += 0.012 * Math.sin(b * Math.PI); }
      }
      if (leg[0] === 'F') fz += parked.frontDrop;   // sniffing folds the elbows
    }

    /* Trunk yaw compensation. A swivel of `yawOff` moves every body-frame
       point; undo it at the feet so the planted ones stay exactly where the
       ground put them. Fore/aft goes into the IK, lateral into the hip
       abduction (a foot hanging `stand` below the hip moves sideways by
       stand*sin(hip)), which is why this is cheap enough to run every frame. */
    const at = FOOT_AT[leg];
    const c = Math.cos(yawOff), s = Math.sin(yawOff);
    const x0 = at.x + fx, y0 = at.y;
    const cx = c * x0 + s * y0, cy = -s * x0 + c * y0;   // the same point, seen from the swivelled trunk
    const ik = legIK(cx - at.x, fz, params.L, params.L, -1);
    ctx.set(leg + '_thigh_joint', ik.hip);
    ctx.set(leg + '_calf_joint', ik.knee);
    ctx.set(leg + '_hip_joint', HIP[leg] + clamp((cy - at.y) / standAt(t), -0.30, 0.30));
  }
  roll = -swingSide * params.rollStance * (p.moving ? 1 : 0);

  ctx.moveTo(p.x, p.z);
  ctx.face((p.heading || 0) + yawOff);
  ctx.tilt(pitch, roll + ptrRoll + (p.moving ? 0 : Math.sin(p.u * TAU) * 0.004));
  ctx.noProp();
  return p;
}

export function entrance(ctx, t) { body(ctx, t); }
export function work(ctx, t) { body(ctx, t); }

/* ------------------------------------------------------------- reactions ---
   Layered over whatever `work` did, as additive joint deltas plus a whole-body
   nudge. Reactions get a fresh context, so only ctx.add() and ctx.nudge() mean
   anything in here. */
export const reactions = [
  {
    name: 'playbow',
    duration: 1.35,
    update(ctx, t) {
      /* A real play-bow is not a smooth arc. It is a fast drop onto the
         elbows, a HOLD down there with the rear end wiggling and up in the
         air, then a bounce back to standing. Timing: 14% down, 60% held,
         26% up. */
      const down = t < 0.14 ? smooth(t / 0.14)
        : t < 0.74 ? 1
          : 1 - smooth((t - 0.74) / 0.26);
      const held = t > 0.14 && t < 0.74 ? (t - 0.14) / 0.60 : 0;
      const wiggle = held ? Math.sin(held * Math.PI * 4.2) * Math.sin(held * Math.PI) : 0;

      /* the calf add is capped at 0.48: the work loop already drives the calf
         to -2.20 mid-swing and the URDF stops at -2.72, so a deeper fold would
         be silently clamped whenever the click landed on the wrong frame */
      ctx.add('FL_thigh_joint', 1.05 * down); ctx.add('FR_thigh_joint', 1.05 * down);
      ctx.add('FL_calf_joint', -0.48 * down); ctx.add('FR_calf_joint', -0.48 * down);
      ctx.add('RL_thigh_joint', -0.34 * down); ctx.add('RR_thigh_joint', -0.34 * down);
      ctx.add('RL_calf_joint', 0.22 * down); ctx.add('RR_calf_joint', 0.22 * down);
      // the rear end swings; the front feet brace against it
      ctx.add('RL_hip_joint', 0.15 * wiggle); ctx.add('RR_hip_joint', 0.15 * wiggle);
      ctx.add('FL_hip_joint', -0.05 * wiggle); ctx.add('FR_hip_joint', -0.05 * wiggle);
      ctx.nudge({ rotZ: -0.075 * down, rotY: 0.05 * wiggle, posY: -0.03 * down });
    },
  },
  {
    name: 'doubletake',
    duration: 1.05,
    update(ctx, t, v) {
      /* Alert double-take: look away, catch it, snap back and freeze. The
         freeze at the end is the joke — the whole body locks, one beat too
         long, before the patrol resumes. */
      const look = track(t, [
        [0.00, { y: 0 }], [0.16, { y: -0.42 }], [0.30, { y: -0.40 }],
        [0.44, { y: 0.66 }], [0.55, { y: 0.62 }], [1.00, { y: 0.60 }],
      ]).y * v;
      const snap = t > 0.30 && t < 0.52 ? Math.sin((t - 0.30) / 0.22 * Math.PI) : 0;
      // weight drops back onto the hind legs as the head comes round
      ctx.add('RL_thigh_joint', 0.30 * snap); ctx.add('RR_thigh_joint', 0.30 * snap);
      ctx.add('RL_calf_joint', -0.20 * snap); ctx.add('RR_calf_joint', -0.20 * snap);
      ctx.add('FL_thigh_joint', -0.18 * snap); ctx.add('FR_thigh_joint', -0.18 * snap);
      // the front feet step round under the turn rather than pivoting on the spot
      ctx.add('FL_hip_joint', 0.16 * look); ctx.add('FR_hip_joint', 0.16 * look);
      ctx.add('RL_hip_joint', -0.09 * look); ctx.add('RR_hip_joint', -0.09 * look);
      ctx.nudge({ rotY: look * 0.55, rotX: -0.06 * snap, posY: -0.02 * snap });
    },
  },
  {
    name: 'wiggle',
    duration: 1.0,
    update(ctx, t) {
      /* No tail joint, so the happiness has to come out of the whole rear
         half: hips swing, the back end sits down a little, the front feet
         stay put and take the shear. Decays, like an actual wag. */
      const e = (1 - t) ** 1.4;
      const s = Math.sin(t * Math.PI * 6.5) * e;
      const sit = Math.sin(t * Math.PI) * 0.5;
      ctx.add('RL_hip_joint', 0.19 * s); ctx.add('RR_hip_joint', 0.19 * s);
      ctx.add('FL_hip_joint', -0.10 * s); ctx.add('FR_hip_joint', -0.10 * s);
      ctx.add('RL_thigh_joint', 0.16 * sit); ctx.add('RR_thigh_joint', 0.16 * sit);
      ctx.add('RL_calf_joint', -0.12 * sit); ctx.add('RR_calf_joint', -0.12 * sit);
      ctx.nudge({ rotY: s * 0.10, rotZ: 0.03 * sit });
    },
  },
  {
    name: 'hop',
    duration: 0.68,
    update(ctx, t, v) {
      /* Anticipate, pop, land soft. The legs tuck at the top, which is what
         makes it read as a hop rather than an elevator. */
      const crouch = t < 0.22 ? Math.sin(t / 0.22 * Math.PI) : 0;
      const air = t >= 0.18 ? Math.sin(clamp01((t - 0.18) / 0.62) * Math.PI) : 0;
      for (const [leg] of LEGS) {
        ctx.add(leg + '_thigh_joint', 0.30 * air + 0.16 * crouch);
        ctx.add(leg + '_calf_joint', -0.24 * air - 0.13 * crouch);
      }
      ctx.nudge({
        posY: air * 0.30 * v,
        sclY: 1 + air * 0.10 - crouch * 0.06,
        sclX: 1 - air * 0.06 + crouch * 0.04,
      });
    },
  },
];

export default { key: 'go2', params, roam, ground, period, entryEnd, entrance, work, reactions };
