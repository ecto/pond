/* Booster K1 — the kid of the shop.

   The whole character is one idea: EAGERNESS, slightly ahead of competence.
   It is 0.94m tall and it works next to a 1.83m flagship, a dog and a robot
   arm, and it is the newest thing on the floor. So everything it does is a
   fraction quicker than it needs to be — it gets to the belt early and waits,
   it commits to a crouch in one movement instead of settling into it, and when
   it has the cube it straightens up with a little more snap than the job
   requires. That last one is the character in a single beat: THE PROUD
   STRAIGHTEN. It did the thing. It would like that noted.

   The counterweight, so it reads as young rather than as badly animated: it is
   genuinely careful with the cube itself. The quick timing is all in the
   approach and the recovery. The moment its hands are actually on the part, it
   slows right down — which is what a good new hire looks like.

   OWNED BY THE K1 SPECIALIST. Everything this file imports is shared and must
   not be edited from here. See INTERFACE.md.

   Rig facts that drive the choices below:

     - Legs are an exact two-link planar chain, L1 = 0.1915, L2 = 0.2452, knee
       sign +1, whole leg 0.4367m. Short legs: its whole stride is a third of
       the H2's. L1 is measured from the HIP_PITCH axis — the joint the IK
       drives — not from hip_yaw; see the same note in h2.mjs, where taking the
       hip_yaw figure cost 20% of foot slip.
     - There is NO WAIST. The hips hang straight off the Trunk, so unlike the
       T1 this replaces there is no "yawing the waist swings both feet" trap —
       but there is also no torso bend at all. Every descent is a hip hinge plus
       a squat, and that is why its folds lean so much further than the H2's.
     - It drops its arms with shoulder ROLL, not pitch. The zero pose is a T,
       hands straight out at shoulder height; roll ~1.3 brings them to its
       sides. Getting this backwards leaves the character permanently
       surrendering.
     - The shoulder-pitch joints are named ALeft_/ARight_Shoulder_Pitch. The
       leading A is not a typo and not a side; it is how the URDF orders them. */

import { legIK } from './kinematics.mjs';
import { plan, follow, track, clamp01, smooth, mix, TAU, arc } from './schedule.mjs';
import {
  MASTER, STATIONS, BENCH, CUBE, makeRoute, routeAt, masterPhase, parkHeight,
} from './world.mjs';

export const params = {
  L1: 0.19151, L2: 0.24519, // hip_PITCH->knee, knee->ankle, metres (see below)
  a0: 0.01044, a1: -0.00082, // the angles those segments sit at when the joints read zero
  stand: 0.330,             // hip above foot at work
  standTall: 0.352,         // all the way up: the proud straighten tops out here
  stance: 0.132,            // ground per stance — short legs, quick steps
  duty: 0.70,               // brisk: less double support than anyone else
  lift: 0.038,              // it picks its feet up. Slightly too much.
  give: 0.008,              // knee compliance on touchdown
  speed: 0.135,             // stage units per second at work — the quickest walker
  entrySpeed: 0.30,         // arriving: frankly hurrying
  vicinity: 1.60,           // pointer-attention radius, stage units
  regard: 0.80,             // pointer-attention CAP: it is very interested in you
};
params.advance = params.stance / params.duty;

/* ---- the folds -----------------------------------------------------------
   MEASURED through the real transform chain (node solve-fold.js k1 <targetY>),
   accurate to a tenth of a millimetre. The handoff assertion keeps them honest.

     BELT   puts the carried cube at y = 0.145 — the conveyor deck plus half a
            cube. It has to be LOW and NARROW at the same time, which is the
            hard part: a deeper hip lean would buy the reach easily, but it
            splays the silhouette sideways and the K1 works at the deep end of
            the right band where there is no width to spare — at lean -1.05 it
            ran off the frame edge wherever its station went. So the lean is
            capped and the reach is bought by holding the cube lower instead
            (see CARRY.k1 in world.mjs). `footX` is the root translation that
            keeps its planted feet still through the fold: the runtime only
            grounds VERTICALLY, so without it the feet skate every reach.
     BENCH  puts it at y = 0.300, its own bench height. A bench a 0.94m robot
            can work at without folding in half is proportionally lower than a
            person's, which is the whole reason it has its own. */
export const FOLD = {
  stand: { stand: params.stand, lean: 0, shoulder: -0.30, elbow: -0.34, roll: 1.28, footX: 0 },
  belt: { stand: 0.2415, lean: -0.45, shoulder: 0, elbow: 0.80, roll: 1.50, footX: 0.0915 },
  bench: { stand: 0.293, lean: 0, shoulder: -0.45, elbow: 0.80, roll: 1.00, footX: 0.0038 },
};
const FOLD_REACH = { stand: 0.16, belt: 0.1287, bench: 0.1950 };

const OFFSTAGE = { x: 3.40, z: 0.30 };
const BENCH_AT = STATIONS.k1, REACH_AT = STATIONS.k1Reach;

/* Facings. At the bench it works square to it; out at the belt tail it turns
   back toward the middle of the frame, so the cube comes off the line in front
   of its chest and the exchange is visible rather than hidden behind it. */
const YAW_BENCH = -2.10;
const YAW_REACH = 2.64;

/* Roam region — see INTERFACE.md. The K1 has the right band to itself, and
   being 0.42m of half-width it is the only humanoid here that can get
   downstage far enough to work the belt. */
/* halfWidth is the TRUE swept half-extent, measured off the rendered frames
   (node preview.js extents), not a guess. It was 0.42 and the real figure is
   0.50: the belt lunge throws its arms and one foot a long way out for a body
   this size, and the `hail` reaction puts both arms up. An understated
   halfWidth does not make the character smaller, it makes feasibleX solve the
   WRONG composition — the guard rail quietly lies and the K1 ran 0.4% off the
   right edge at 1280x700 while every check said it was fine. */
export const roam = {
  side: 'right',
  halfWidth: 0.46,
  work: { x: [1.48, 1.74], z: [0.35, 0.90] },
  entry: { x: [1.48, 3.50], z: [0.35, 0.90] },
};
export const ground = ['left_foot_link', 'right_foot_link'];
export const period = MASTER;

/* Its part of the world task (anim/world.mjs):

     34..47   the belt is running. It goes out to the tail EARLY and waits,
              because of course it does.
     47..54   takes the cube off the line and carries it to its bench
     54..60   the dwell: it has put the cube down and it is looking at it, and
              so is everybody else
     60..67   picks it up and takes it back to the line
     67..80   sends it away, and watches it the whole way out                 */
/* It has to be OUT at the belt tail with its hands on the cube at master 47,
   and standing at its bench having just put it down at 54 — so it leaves early
   (it always leaves early) and the walk between the two is what the seven
   seconds are for. */
const ROUTE = makeRoute([
  { t: 0, ...BENCH_AT, yaw: YAW_BENCH }, { t: 38, ...BENCH_AT, yaw: YAW_BENCH },
  { t: 42, ...REACH_AT, yaw: YAW_REACH }, { t: 49, ...REACH_AT, yaw: YAW_REACH },
  { t: 52, ...BENCH_AT, yaw: YAW_BENCH }, { t: 62, ...BENCH_AT, yaw: YAW_BENCH },
  { t: 65, ...REACH_AT, yaw: YAW_REACH }, { t: 78, ...REACH_AT, yaw: YAW_REACH },
  { t: 82, ...BENCH_AT, yaw: YAW_BENCH }, { t: 96, ...BENCH_AT, yaw: YAW_BENCH },
]);

const sched = plan(
  [{ from: OFFSTAGE, to: BENCH_AT, speed: params.entrySpeed },
    { hold: 1.6, at: BENCH_AT, yaw: YAW_BENCH }],
  [{ from: BENCH_AT, to: BENCH_AT }], params.speed);

export const entryEnd = sched.entry.dur;

const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const win = (u, a, b, e) => clamp01(Math.min(smooth((u - a) / e), smooth((b - u) / e)));
const headingTo = (x, z, tx, tz) => Math.atan2(-(tz - z), tx - x);
const mixYaw = (a, b, w) => a + (((b - a + Math.PI * 3) % TAU) - Math.PI) * w;
const S = (side) => (side === 'left' ? 'Left' : 'Right');

/** one leg from the IK, sole flat through any lean */
function leg(ctx, side, fx, fz, lean) {
  const c = Math.cos(lean), s = Math.sin(lean);
  const tx = fx * c - fz * s, tz = fx * s + fz * c;
  const ik = legIK(tx, tz, params.L1, params.L2, +1);
  /* take out the angles the segments sit at when the joints read zero. Small
     here — a hundredth of a radian — but free, and the K1's hips are otherwise
     a clean uncanted chain, unlike the H2's. */
  const hip = ik.hip - params.a0;
  const knee = ik.knee + params.a0 - params.a1;
  ctx.set(S(side) + '_Hip_Pitch', hip);
  ctx.set(S(side) + '_Knee_Pitch', knee);
  ctx.set(S(side) + '_Ankle_Pitch', -(hip + knee) - lean);
}

function footAt(q, stand) {
  const p = ((q % 1) + 1) % 1;
  if (p < params.duty) {
    const a = p / params.duty;
    const sink = params.give * Math.sin(clamp01(a / 0.34) * Math.PI) * (a < 0.34 ? 1 : 0);
    return { fx: params.stance * (0.5 - a), fz: -stand + sink };
  }
  const b = (p - params.duty) / (1 - params.duty);
  return { fx: params.stance * (-0.5 + b), fz: -stand + params.lift * Math.sin(b * Math.PI) };
}

function mixFold(A, B, w) {
  const out = {};
  for (const k of Object.keys(A)) out[k] = mix(A[k], B[k], w);
  return out;
}

/** write a fold; returns the root shift (metres, along the body's forward) */
function applyFold(ctx, F) {
  leg(ctx, 'left', 0.004, -F.stand, F.lean);
  leg(ctx, 'right', 0.004, -F.stand, F.lean);
  for (const side of ['left', 'right']) {
    const sgn = side === 'left' ? -1 : 1;
    ctx.set('A' + S(side) + '_Shoulder_Pitch', F.shoulder);
    ctx.set(S(side) + '_Shoulder_Roll', sgn * F.roll);
    ctx.set(S(side) + '_Elbow_Pitch', F.elbow);
  }
  return -F.footX;
}

function lookAt(ctx, bodyYaw, want, w) {
  const rel = clampTo(((want - bodyYaw + Math.PI * 3) % TAU) - Math.PI, -1.00, 1.00);
  ctx.set('AAHead_yaw', mix(ctx.get('AAHead_yaw') || 0, rel, clamp01(w)));
}

/* who it looks at. It looks at the H2 more than at anything else, which is
   most of what makes it read as the junior one. */
const COWORKERS = [
  { x: -1.68, z: 0.45 },    // the H2, all the way across
  { x: -1.68, z: 0.45 },    // ...twice. It really is watching the big one.
  { x: -1.90, z: -0.45 },   // the Go2
  { x: -1.80, z: -0.10 },   // the Z1
];

/* ---- pointer overlay -----------------------------------------------------
   Quick to look, slow to look away — the opposite of the H2's measured
   attention, and the two next to each other is the point. It commits fast,
   holds, and then goes back to work slightly reluctantly. */
function regard(ctx, x, z, yaw, busy) {
  const p = ctx.pointer;
  if (!p.present || !p.atMyDepth) return;
  const w = Math.min(p.attention * 1.35, params.regard) * (1 - busy);
  if (w < 0.02) return;
  lookAt(ctx, yaw, headingTo(x, z, p.atMyDepth.x, p.atMyDepth.z), w);
  const high = clampTo((p.atMyDepth.y - 0.5) / 0.9, -1, 1);
  ctx.add('Head_pitch', -0.22 * high * w);
  // the small bounce of interest: it is pleased you are here
  if (p.dwellMs > 500) {
    const n = clamp01((p.dwellMs - 500) / 800);
    ctx.add('Head_pitch', Math.sin(n * Math.PI * 3) * 0.10 * (1 - n) * w);
  }
}

function beatId(t) {
  if (t < entryEnd) return 0;
  const k = Math.floor((t - entryEnd) / period);
  const tt = (t - entryEnd) - k * period;
  return 1 + 3 * k + Math.floor(tt / (period / 3));
}

/* ================= the job ================= */
/* Windows on the master clock. TAKE is the pick off the line, GIVE is putting
   it back; between them it works at its bench and the scene has its dwell. */
/* Same construction as the H2's: the window is fitted around the score's two
   ownership instants. The K1 takes the cube off the belt at master 47 and it is
   parked on the bench at 54; it picks it back up at 60 and it is back on the
   belt at 67. */
const span = (t0, t1, gb, st) => ({ t0, t1, grab: (gb - t0) / (t1 - t0), set: (st - t0) / (t1 - t0) });
const TAKE = span(43, 57, 47, 54);
const GIVE = span(57, 71, 60, 67);

function jobAt(m) {
  if (m >= TAKE.t0 && m < TAKE.t1) return { kind: 'take', u: (m - TAKE.t0) / (TAKE.t1 - TAKE.t0), J: TAKE };
  if (m >= GIVE.t0 && m < GIVE.t1) return { kind: 'give', u: (m - GIVE.t0) / (GIVE.t1 - GIVE.t0), J: GIVE };
  return { kind: 'idle', u: 0, J: null };
}

function working(ctx, t, p) {
  const m = masterPhase(t);
  const job = jobAt(m);
  const quiet = ctx.reducedMotion ? 0 : 1;
  const id = beatId(t);

  /* a faster idle than anybody else's — the kid does not stand still well */
  const breath = Math.sin(t * 0.72) * quiet;
  const fidget = Math.sin(t * 0.47 + 1.1) * quiet;

  let F, shift;
  let yaw = p.heading == null ? YAW_BENCH : p.heading;

  if (job.kind === 'idle') {
    F = { ...FOLD.stand };
    F.stand += breath * 0.005;
    shift = applyFold(ctx, F);
    ctx.set('Head_pitch', 0.10 + breath * 0.05);
    ctx.set('AAHead_yaw', fidget * 0.10);
    // it checks on the big one, often
    const who = COWORKERS[id % COWORKERS.length];
    lookAt(ctx, yaw, headingTo(p.x, p.z, who.x, who.z), 0.8 * win((m % 18) / 18, 0.15, 0.55, 0.10));
    // and one small weight shift, a bit too often
    ctx.set('Left_Hip_Roll', clampTo(0.05 * fidget, -0.40, 1.57));
    ctx.set('Right_Hip_Roll', clampTo(0.05 * fidget, -1.57, 0.40));
  } else {
    const take = job.kind === 'take';
    const u = job.u, J = job.J;
    /* down to the line, grab, up, across to the bench, down, set. On the way
       BACK (give) it is the same in reverse. The approach is quick and the
       contact is slow: `grab` and `set` are both held wide. */
    const toF = take ? FOLD.belt : FOLD.bench;
    const awayF = take ? FOLD.bench : FOLD.belt;

    const d1 = smooth(clamp01((u - 0.02) / (J.grab - 0.06)));
    const hold1 = win(u, J.grab, J.grab + 0.09, 0.025);
    const up = smooth(clamp01((u - (J.grab + 0.09)) / 0.13));
    const d2 = smooth(clamp01((u - (J.set - 0.16)) / 0.13));
    const rec = smooth(clamp01((u - (J.set + 0.08)) / 0.15));

    F = mixFold(FOLD.stand, toF, Math.max(0, d1 - up));
    F = mixFold(F, awayF, Math.max(0, d2 - rec));
    /* a beat of settle at the bottom of the fold — but never deeper than the
       solved pose, which is already sitting on the knee limit. Without the
       floor this dip drove Knee_Pitch 0.007 rad past 2.23 and the runtime
       quietly clamped it, which means the pose that shipped was not the pose
       that was measured. */
    F.stand = Math.max(F.stand - 0.006 * hold1, Math.min(FOLD.belt.stand, FOLD.bench.stand));

    /* THE PROUD STRAIGHTEN. Once it is up with the cube it goes a few
       millimetres past standing and settles back — the tiny overshoot that
       reads as "got it". It only happens on the way UP with the part, never on
       the way down, and never when it is empty-handed. */
    const proud = win(u, J.grab + 0.12, J.grab + 0.34, 0.07);
    F.stand += (params.standTall - params.stand) * 0.55 * proud;

    shift = applyFold(ctx, F);

    ctx.set('Head_pitch', track(u, [
      [0.00, { p: 0.16 }], [0.08, { p: 0.72 }],
      [J.grab, { p: 0.80 }], [J.grab + 0.14, { p: 0.30 }],
      [J.grab + 0.28, { p: 0.02 }],                       // chin up on the straighten
      [J.set - 0.06, { p: 0.70 }], [J.set + 0.08, { p: 0.60 }],
      [0.92, { p: 0.18 }], [1.00, { p: 0.16 }],
    ]).p);
    ctx.set('AAHead_yaw', 0);

    /* while it waits for the belt it leans out to look up the line — the
       single most "kid" thing in the file */
    if (take && u < J.grab - 0.10) {
      const w = win(u, 0.0, J.grab - 0.10, 0.10);
      ctx.add('Head_pitch', -0.16 * w);
      lookAt(ctx, yaw, headingTo(p.x, p.z, -0.4, 0.85), 0.75 * w);
    }
    // and after it sends the cube away it watches it go
    if (!take && u > J.set + 0.06) {
      const w = smooth(clamp01((u - (J.set + 0.06)) / 0.14));
      lookAt(ctx, yaw, headingTo(p.x, p.z, -0.4, 0.85), 0.8 * w);
    }
  }

  const holding = job.kind !== 'idle' && job.u >= job.J.grab && job.u < job.J.set;
  if (holding) ctx.holdProp(); else ctx.noProp();

  ctx.moveTo(p.x + shift * Math.cos(yaw), p.z - shift * Math.sin(yaw));
  ctx.face(yaw);
  ctx.tilt(0, 0.008);

  if (ctx.reducedMotion) {
    ctx.set('AAHead_yaw', 0);
    ctx.set('Head_pitch', 0.12);
    ctx.set('Left_Hip_Roll', 0); ctx.set('Right_Hip_Roll', 0);
    ctx.tilt(0, 0);
  }

  const busy = job.kind === 'idle' ? 0 : win(job.u, 0.04, 0.94, 0.06);
  regard(ctx, p.x, p.z, yaw, busy * 0.85);
}

/* ================= walking ================= */
function walking(ctx, t, p) {
  const phi = (p.s * ctx.mps) / params.advance;
  for (const [side, off] of [['left', 0], ['right', 0.5]]) {
    const f = footAt(phi + off, params.stand);
    leg(ctx, side, f.fx, f.fz, 0);
  }
  const sh = Math.sin(phi * TAU);
  const quiet = ctx.reducedMotion ? 0 : 1;

  ctx.set('ALeft_Shoulder_Pitch', -0.30 - 0.34 * sh);
  ctx.set('ARight_Shoulder_Pitch', -0.30 + 0.34 * sh);
  ctx.set('Left_Shoulder_Roll', -1.24);
  ctx.set('Right_Shoulder_Roll', 1.24);
  ctx.set('Left_Elbow_Pitch', -0.34);
  ctx.set('Right_Elbow_Pitch', -0.34);
  ctx.set('Head_pitch', 0.10);
  ctx.set('AAHead_yaw', 0.10 * Math.sin(phi * Math.PI) * quiet);

  ctx.moveTo(p.x, p.z);
  ctx.face(p.heading);
  /* No waist on this rig, so the whole lateral weight shift has to live in the
     body tilt — and it is EXPENSIVE. The grounding push happens before the tilt
     in the transform chain, so a tilted body slides its own contact offset
     along the deck by dy*sin(tilt), and for this robot dy is the 0.33m Trunk
     height. Measured exchange rate: 0.030 rad of roll costs 11.6% of foot
     slip, which is over budget on its own. 0.012 is what the walk can afford.
     The shift that is missing from the hips is paid back in the arms and head
     below, which touch nothing. */
  ctx.tilt(-0.012 * sh * quiet, 0.012);
  ctx.add('ALeft_Shoulder_Pitch', 0.10 * sh);
  ctx.add('ARight_Shoulder_Pitch', -0.10 * sh);
  ctx.noProp();

  if (ctx.entering) {
    const n = win(p.u, 0.28, 0.60, 0.14);
    if (n > 0) {
      lookAt(ctx, p.heading, headingTo(p.x, p.z, p.x, p.z + 3), n * 0.9);
      ctx.add('Head_pitch', -0.18 * n);
    }
  }
  regard(ctx, p.x, p.z, p.heading, 0.4);
}

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

function body(ctx, t) {
  const p = path(t);
  if (p.moving) walking(ctx, t, p); else working(ctx, t, p);
}

export function entrance(ctx, t) { body(ctx, t); }
export function work(ctx, t) { body(ctx, t); }

/* ---- reactions -----------------------------------------------------------
   Quicker and springier than the H2's, and one of them is frankly showing off.
   Each starts and ends on exactly neutral: the runtime drops the nudge the
   instant a reaction expires, so a residual lean would snap back in one frame. */
export const reactions = [
  {
    /* A fast little bow — too fast, and it bobs back up. No waist on this rig,
       so it is all hips and a whole-body pitch. */
    name: 'bob',
    duration: 1.10,
    update(ctx, t) {
      const b = smooth(clamp01(t / 0.18)) - smooth(clamp01((t - 0.52) / 0.28));
      ctx.add('Left_Hip_Pitch', -0.40 * b); ctx.add('Right_Hip_Pitch', -0.40 * b);
      ctx.add('Left_Knee_Pitch', 0.22 * b); ctx.add('Right_Knee_Pitch', 0.22 * b);
      ctx.add('Left_Ankle_Pitch', 0.20 * b); ctx.add('Right_Ankle_Pitch', 0.20 * b);
      ctx.add('Head_pitch', 0.40 * b);
      ctx.add('ALeft_Shoulder_Pitch', -0.24 * b); ctx.add('ARight_Shoulder_Pitch', -0.24 * b);
      // the bounce back out: one small overshoot, gone by the end
      const pop = Math.sin(clamp01((t - 0.55) / 0.35) * Math.PI) * (1 - clamp01(t)) ** 0.5;
      ctx.nudge({ rotZ: -0.11 * b + 0.05 * pop });
    },
  },
  {
    /* Both arms up. Not a wave — a greeting with the whole body, which is what
       you do when you are the smallest one here and somebody finally looked. */
    name: 'hail',
    duration: 1.30,
    update(ctx, t) {
      const w = win(t, 0.0, 1.0, 0.20);
      for (const side of ['left', 'right']) {
        const sgn = side === 'left' ? -1 : 1;
        ctx.add('A' + S(side) + '_Shoulder_Pitch', -1.50 * w);
        ctx.add(S(side) + '_Shoulder_Roll', -sgn * 0.30 * w);
        ctx.add(S(side) + '_Elbow_Pitch', 0.50 * w);
      }
      const flap = Math.sin(t * Math.PI * 6.2) * w;
      ctx.add('Left_Elbow_Pitch', 0.22 * flap);
      ctx.add('Right_Elbow_Pitch', -0.22 * flap);
      ctx.add('Head_pitch', -0.26 * w);
      // up on its toes for the middle of it
      ctx.add('Left_Ankle_Pitch', -0.18 * w); ctx.add('Right_Ankle_Pitch', -0.18 * w);
      ctx.nudge({ posY: 0.030 * w, rotZ: 0.04 * w });
    },
  },
  {
    /* The showing-off one: a quick spin on the spot, arms tucked, landing
       square and immediately pretending nothing happened. Ends on a whole
       extra turn, which the upright check correctly reads as neutral. */
    name: 'spin',
    duration: 1.25,
    update(ctx, t, dir) {
      const load = clamp01(t / 0.14);
      const turn = smooth(clamp01((t - 0.12) / 0.62));
      const settle = clamp01((t - 0.78) / 0.22);
      const sgn = dir >= 0 ? 1 : -1;
      const tuck = win(t, 0.05, 0.86, 0.14);
      ctx.add('ALeft_Shoulder_Pitch', -0.60 * tuck); ctx.add('ARight_Shoulder_Pitch', -0.60 * tuck);
      ctx.add('Left_Elbow_Pitch', 0.70 * tuck); ctx.add('Right_Elbow_Pitch', 0.70 * tuck);
      ctx.add('Left_Knee_Pitch', 0.30 * Math.sin(load * Math.PI) + 0.16 * Math.sin(settle * Math.PI));
      ctx.add('Right_Knee_Pitch', 0.30 * Math.sin(load * Math.PI) + 0.16 * Math.sin(settle * Math.PI));
      ctx.add('Head_pitch', -0.12 * tuck);
      ctx.nudge({
        rotY: sgn * TAU * turn,
        posY: 0.022 * Math.sin(turn * Math.PI),
        rotZ: 0.03 * Math.sin(load * Math.PI),
      });
    },
  },
];

export default { key: 'k1', params, roam, ground, period, entryEnd, entrance, work, reactions };
