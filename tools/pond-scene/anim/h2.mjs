/* Unitree H2 — the flagship, and the host of the scene.

   The whole character is one idea: DELIBERATE POWER. This is the biggest thing
   on the stage by half a metre, and nothing it does is quick. It takes its time
   getting where it is going, it plants before it lifts, and when it bends down
   to a machine a fifth of its height it does so all the way, with its whole
   body, because that is what having that much body costs. Motion that costs
   effort is slow to start and careful to finish; a glance costs nothing and is
   quick. The contrast between those two is the character.

   It is also the HOST. It is the one that notices you: the pointer overlay here
   is the most generous in the cast (the frog used to have this job), but it is
   generous in a large, unhurried way — it turns its head, then its chest, and
   only rarely does more. A 1.83m machine that snapped around to look at a
   cursor would be alarming rather than welcoming.

   OWNED BY THE H2 SPECIALIST. Everything this file imports is shared and must
   not be edited from here. See INTERFACE.md.

   Three rig facts drive most of the choices below:

     - The legs are an exact two-link planar chain, L1 = 0.4415, L2 = 0.4970,
       knee sign +1, whole leg 0.9385m. Sole flat means ankle = -(hip+knee)-lean.
       L1 is measured from the HIP_PITCH axis to the knee, which is the joint
       the IK actually drives — NOT from hip_yaw, even though hip_yaw is the
       link the thigh visually starts at. The two differ by 0.12m (the pitch
       axis sits above the roll and yaw joints), and using the hip_yaw figure
       put 20% of foot slip into the walk: the IK solved a thigh shorter than
       the one it was driving, so the stance foot crept forward under the body
       every step. If the gait ever starts skating, check this first.
     - It CAN bend. Unlike the T1 this replaces, the H2 has a waist_pitch
       (-0.44 .. 0.52) on top of the hip hinge, and the two together are the
       only reason a machine this tall can put a cube on a 0.11m conveyor. The
       measured fold is in FOLD below; each one was solved through the real
       transform chain (node solve-fold.js h2) rather than guessed.
     - The elbow's zero is a FORWARD forearm, not a hanging one: at the zero
       pose the hand sits 0.31m in front of the elbow. Positive elbow swings it
       down, and +1.57 hangs it straight. Every arm pose here is written with
       that in mind and it is the single easiest thing to get backwards. */

import { legIK, cantedHip } from './kinematics.mjs';
import { plan, follow, track, clamp01, smooth, mix, TAU, arc } from './schedule.mjs';
import {
  MASTER, STATIONS, BELT, CUBE, makeRoute, routeAt, masterPhase, beltPoint,
} from './world.mjs';

export const params = {
  L1: 0.31976, L2: 0.49695, // thigh (hip_yaw->knee) and shank (knee->ankle), metres
  a0: 0.03225, a1: -0.03663, // the angles those segments sit at when the joints read zero
  cant: -0.5236,            // the hip-pitch origin's roll. THE trap on this rig.
  stand: 0.760,             // hip above foot at work — soft knees, not locked
  standTall: 0.792,         // fully upright: the breath at the top, and the survey
  stance: 0.290,            // ground per stance. Long legs, long steps.
  duty: 0.74,               // it is not carrying anything, so a shorter double support
  lift: 0.062,              // swing apex
  give: 0.016,              // knee compliance on each touchdown, metres
  speed: 0.115,             // stage units per second at work
  entrySpeed: 0.26,         // walking on: unhurried, but it covers ground
  vicinity: 2.10,           // pointer-attention radius, stage units. The host's is wide.
  regard: 0.90,             // pointer-attention CAP. It is the greeter; it may commit.
};
params.advance = params.stance / params.duty;   // metres of travel per gait cycle

/* ---- the two folds -------------------------------------------------------
   MEASURED, not authored. Each of these was solved through the real transform
   chain against a target cube height and is accurate to a tenth of a
   millimetre; the handoff-continuity assertion in the selftest is what keeps
   them honest. Re-solve with `node solve-fold.js h2 <targetY>` if a height
   moves.

     BELT   puts the carried cube at y = 0.145 — the 0.12m conveyor deck plus
            half a cube. This is the deepest thing the character does: a 1.83m
            machine folded down to put something on a knee-high line.
     DOG    puts it at y = 0.278, the cube sitting on the crouched Go2's back.

   `footX` is the part that is easy to miss. Folding slides the planted feet
   backward in the body's own frame, and the runtime only ever grounds
   VERTICALLY — so the module has to translate its own root forward by the same
   amount or the feet skate across the deck as it bends. `rootShift()` below is
   that correction, and it is why the foot-slip check still passes through the
   deepest bend in the scene. */
export const FOLD = {
  stand: { stand: params.stand, lean: 0, waist: 0.04, shoulder: -0.10, elbow: 1.05, roll: 0.12, footX: 0 },
  belt: { stand: 0.366, lean: -0.45, waist: 0.52, shoulder: -0.45, elbow: 1.40, roll: 0.12, footX: 0.1092 },
  dog: { stand: 0.3660, lean: 0, waist: 0.44, shoulder: -0.15, elbow: 0.80, roll: 0.30, footX: 0.0053 },
};
/** how far in front of the body root the carried cube sits, per fold */
const FOLD_REACH = { stand: 0.30, belt: 0.3167, dog: 0.3402 };

/* The entrance walks in at its WORKING DEPTH, not toward it.

   This used to start at z = 0.10 while the roam box begins at z = 0.36, so
   ctx.moveTo() clamped the body to a straight line at z = 0.36 while the gait
   went on counter-moving its feet along the unclamped heading. The forward
   component cancelled and the lateral one did not: the planted foot slid 17mm
   sideways per step, which is 17% of body speed and reads as a skate. The
   clamp is a guard rail, not a path — if a route starts outside the box, the
   walk and the feet are solving different problems. */
const OFFSTAGE = { x: -3.40, z: STATIONS.h2.z };
const HOME = STATIONS.h2;

/* Facings. It works between two things that are in different directions: the
   dog comes up on its left, and the belt head is downstage of it. Turning
   between the two IS the performance — a body this size does not reach across
   itself, it turns to face what it is working on. */
const YAW_BELT = -1.30;
const YAW_DOG = -1.75;
const YAW_REST = -1.30;

/* Roam region — see INTERFACE.md, "Moving a character".

   halfWidth is the TRUE swept half-extent, 0.44, measured off the rendered
   frames rather than guessed. It was 0.55, which is a fifth too wide, and an
   over-stated halfWidth is not the safe direction it looks like: feasibleX
   shrinks the band from BOTH sides, so it pinned the flagship upstage of
   z = 0.7 for no physical reason — and the belt it has to reach down to goes
   where its hands go. Correcting it is what let the whole conveyor move
   downstage into the part of the corridor that is actually tall enough. */
export const roam = {
  side: 'left',
  halfWidth: 0.44,
  work: { x: [-1.72, -1.52], z: [0.50, 0.66] },
  entry: { x: [-3.50, -1.52], z: [0.50, 0.66] },
};
export const ground = ['left_ankle_pitch_link', 'right_ankle_pitch_link'];
export const period = MASTER;          // phase-locked to the world task
export const roleKey = 'h2';

/* This character's part of the world task (anim/world.mjs):

     26..34   takes the cube off the crouched dog and sets it on the belt head
     34..47   watches it go, then goes back to standing its ground
     80..87   takes it off the returning belt and puts it back on the dog

   Both gestures are the same three moves in a different order — turn, fold,
   and the slow careful straighten — which is what makes them read as one
   character doing its job twice rather than two animations. */
const ROUTE = makeRoute([
  { t: 0, ...HOME, yaw: YAW_REST }, { t: 96, ...HOME, yaw: YAW_REST },
]);

/* the entrance: it walks on from offstage left and takes its position */
const sched = plan(
  [{ from: OFFSTAGE, to: HOME, speed: params.entrySpeed },
    { hold: 2.4, at: HOME, yaw: YAW_REST }],
  [{ from: HOME, to: HOME }], params.speed);

export const entryEnd = sched.entry.dur;

const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** a smooth 0->1->0 window over [a, b] with `e` of ramp at each end */
const win = (u, a, b, e) => clamp01(Math.min(smooth((u - a) / e), smooth((b - u) / e)));
/** stage heading from (x, z) toward (tx, tz) — see INTERFACE.md §3 */
const headingTo = (x, z, tx, tz) => Math.atan2(-(tz - z), tx - x);
/** shortest-arc blend between two headings */
const mixYaw = (a, b, w) => a + (((b - a + Math.PI * 3) % TAU) - Math.PI) * w;

/** one leg from the IK, sole kept flat on the deck through any body lean */
/* ---- the canted hip, solved properly ------------------------------------
   The two joint origins between the hip-pitch axis and the hip-yaw axis are
   TRANSLATIONS as well as rotations, so as the hip turns they carry the whole
   leg sideways. `cantedHip()` gets the leg's ORIENTATION exactly right and
   this term is what it does not know about — and it is not small: ignoring it
   slid the planted foot 63mm sideways across a single step, which is 20% of
   body speed and reads as a skate.

   These are the two origins, straight out of the URDF. The offset they produce
   depends on the hip angle, and the hip angle depends on the offset, so the
   solve below is a three-pass fixed point. It converges immediately — the
   correction is centimetres and its derivative is small — and it brings the
   planted foot's drift across a full stance down to 5.8mm, or 2.0% of body
   speed. */
const HIP_P1 = [0.04177, 0.06350, -0.01900];   // hip_pitch_link -> hip_roll
const HIP_P2 = [-0.02819, -0.00950, -0.07370]; // hip_roll_link  -> hip_yaw
const CANT = 0.5236;

const rx3 = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
const ry3 = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };

/** where the hip-yaw axis has been carried to, for a sagittal hip angle */
function hipOffset(theta, cant) {
  const q = cantedHip(theta, cant);
  const sgn = cant < 0 ? 1 : -1;
  let a = ry3(HIP_P1, q.pitch); a = rx3(a, -sgn * CANT);
  let b = rx3(HIP_P2, sgn * CANT + q.roll); b = ry3(b, q.pitch); b = rx3(b, -sgn * CANT);
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** one leg from the IK, sole kept flat on the deck through any body lean */
function leg(ctx, side, fx, fz, lean) {
  /* the fold rotates the foot target into the torso's frame and takes the lean
     back out of the ankle, so the sole stays flat on the ground no matter how
     far the body is folded over it */
  const c = Math.cos(lean), s = Math.sin(lean);
  const tx = fx * c - fz * s, tz = fx * s + fz * c;
  const cant = side === 'left' ? params.cant : -params.cant;

  let theta = 0, knee = 0, T = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const ik = legIK(tx - T[0], tz - T[2], params.L1, params.L2, +1);
    theta = ik.hip - params.a0;
    knee = ik.knee + params.a0 - params.a1;
    T = hipOffset(theta, cant);
  }
  const q = cantedHip(theta, cant);
  ctx.set(side + '_hip_pitch_joint', q.pitch);
  ctx.set(side + '_hip_roll_joint', q.roll);
  ctx.set(side + '_hip_yaw_joint', q.yaw);
  ctx.set(side + '_knee_joint', knee);
  ctx.set(side + '_ankle_pitch_joint', -(theta + knee) - lean);
}

/** where a foot sits at gait phase q, in the hip frame, metres */
function footAt(q, stand) {
  const p = ((q % 1) + 1) % 1;
  if (p < params.duty) {
    // Stance: travel backward at exactly body speed, so not-skating is a
    // property of the construction rather than something to tune.
    const a = p / params.duty;
    const sink = params.give * Math.sin(clamp01(a / 0.34) * Math.PI) * (a < 0.34 ? 1 : 0);
    return { fx: params.stance * (0.5 - a), fz: -stand + sink };
  }
  const b = (p - params.duty) / (1 - params.duty);
  return { fx: params.stance * (-0.5 + b), fz: -stand + params.lift * Math.sin(b * Math.PI) };
}

/** blend two folds */
function mixFold(A, B, w) {
  const out = {};
  for (const k of Object.keys(A)) out[k] = mix(A[k], B[k], w);
  return out;
}

/**
 * Write a fold into ctx and return the root shift it requires.
 * The shift is in the body's own forward direction, in metres.
 */
function applyFold(ctx, F, sway) {
  leg(ctx, 'left', 0.006, -F.stand, F.lean);
  leg(ctx, 'right', 0.006, -F.stand, F.lean);
  ctx.set('waist_pitch_joint', F.waist);
  for (const [side, sgn] of [['left', 1], ['right', -1]]) {
    ctx.set(side + '_shoulder_pitch_joint', F.shoulder);
    ctx.set(side + '_shoulder_roll_joint', sgn * F.roll);
    ctx.set(side + '_elbow_joint', F.elbow);
  }
  // the lateral weight shift lives in the waist ROLL, which the H2 has and the
  // T1 did not — so it costs the anti-skate invariant nothing at all
  ctx.set('waist_roll_joint', clampTo(sway * 0.055, -0.52, 0.52));
  return -F.footX;
}

/* who it might look at between jobs, in stage coordinates */
const COWORKERS = [
  { x: -1.80, z: -0.10 },   // the Z1 on its pallet
  { x: -1.90, z: -0.45 },   // the Go2 on its patrol
  { x: 1.62, z: 0.38 },     // the K1, all the way across the shop
];

/* ---- the head ------------------------------------------------------------
   head_pitch is the PARENT of head_yaw on this rig (torso -> head_pitch_link
   -> head_yaw_link), which is the reverse of the T1's. It makes no difference
   to how they are driven, but it is worth knowing before going looking. */
function lookAt(ctx, bodyYaw, want, w) {
  const rel = clampTo(((want - bodyYaw + Math.PI * 3) % TAU) - Math.PI, -1.60, 1.60);
  ctx.set('head_yaw_joint', mix(ctx.get('head_yaw_joint') || 0, rel, clamp01(w)));
}

/* ---- pointer overlay -----------------------------------------------------
   THE HOST'S GREETING. This character inherited the job from the frog, and it
   cannot do what the frog did — there is no hopping toward the cursor when you
   are 1.83m and bolted to a 0.11m-wide band of feasible floor. So the greeting
   is scaled to its dignity instead of its enthusiasm:

     * the head goes first and goes furthest;
     * the chest follows it, a beat later and a fraction of the way, through
       waist_yaw — which is what turns a look into being ADDRESSED;
     * a long dwell earns a small settling nod, once;
     * and it never interrupts a fold. A machine that dropped a cube to look at
       a cursor would be a worse host, not a better one.

   Under reduced motion shared code hands us NO_POINTER and all of this
   switches itself off. */
function regard(ctx, x, z, yaw, busy) {
  const p = ctx.pointer;
  if (!p.present || !p.atMyDepth) return;
  const w = Math.min(p.attention, params.regard) * (1 - busy);
  if (w < 0.02) return;
  const want = headingTo(x, z, p.atMyDepth.x, p.atMyDepth.z);
  lookAt(ctx, yaw, want, w);

  // the chest follows the head, later and less far: being noticed, then faced
  const rel = clampTo(((want - yaw + Math.PI * 3) % TAU) - Math.PI, -1.2, 1.2);
  const chest = clamp01((p.dwellMs - 260) / 700);
  ctx.set('waist_yaw_joint', clampTo(rel * 0.32 * w * chest, -1.75, 1.75));

  // tips its face toward a pointer held high in the frame, and down to one low
  const high = clampTo((p.atMyDepth.y - 0.9) / 1.2, -1, 1);
  ctx.add('head_pitch_joint', -0.16 * high * w);

  if (p.dwellMs > 900) {
    const n = clamp01((p.dwellMs - 900) / 1000);
    ctx.add('head_pitch_joint', Math.sin(n * Math.PI * 2) * 0.13 * (1 - n) * w * 2);
  }
}

/** which beat of the day this is — used to vary the idle without any state */
function beatId(t) {
  if (t < entryEnd) return 0;
  const k = Math.floor((t - entryEnd) / period);
  const tt = (t - entryEnd) - k * period;
  return 1 + 3 * k + Math.floor(tt / (period / 3));
}

/* ================= the job ================= */
/* The two gestures, as windows on the master clock. Both are: turn to the
   thing, fold to it, hold a beat while the exchange happens, straighten, and
   turn back — and the hold is deliberately wide, because the other party
   (a dog settling, a belt arriving) is not frame-accurate. */
/* The windows are sized so the gesture's OWN beats land on the score's
   ownership instants, rather than the other way round. The H2 takes the cube
   off the dog at master 26 and releases it onto the belt at 34, so the LOAD
   window starts early (21) to give the fold somewhere to descend from and ends
   late (38) to give the straighten somewhere to go — and `take` and `place`
   are then just those two master seconds expressed as fractions. Fitting the
   window to the performance keeps the authored proportions intact. */
const span = (t0, t1, tk, pl) => ({ t0, t1, take: (tk - t0) / (t1 - t0), place: (pl - t0) / (t1 - t0) });
const LOAD = span(21, 38, 26, 34);
const UNLOAD = span(76, 91, 80, 87);

function jobAt(m) {
  if (m >= LOAD.t0 && m < LOAD.t1) return { kind: 'load', u: (m - LOAD.t0) / (LOAD.t1 - LOAD.t0), J: LOAD };
  if (m >= UNLOAD.t0 && m < UNLOAD.t1) return { kind: 'unload', u: (m - UNLOAD.t0) / (UNLOAD.t1 - UNLOAD.t0), J: UNLOAD };
  return { kind: 'idle', u: 0, J: null };
}

function working(ctx, t) {
  const m = masterPhase(t);
  const job = jobAt(m);
  const quiet = ctx.reducedMotion ? 0 : 1;
  const id = beatId(t);

  /* --- breath and weight shift --------------------------------------------
     Slow. A big machine's idle frequency is low, and this is most of what sells
     the size when it is standing still. Killed while it is folded, where a
     swaying body would drag the cube. */
  const breath = Math.sin(t * 0.38) * quiet;
  const sway = Math.sin(t * 0.23) * quiet;

  let F, yaw, shift;

  if (job.kind === 'idle') {
    /* standing its ground, and watching the shop */
    F = { ...FOLD.stand };
    F.stand += breath * 0.006;
    yaw = YAW_REST;
    shift = applyFold(ctx, F, sway);

    ctx.set('head_pitch_joint', 0.06 + breath * 0.03);
    ctx.set('head_yaw_joint', 0);
    ctx.set('waist_yaw_joint', sway * 0.06);
    // between jobs it checks on somebody — a different somebody each time
    const who = COWORKERS[id % COWORKERS.length];
    const look = win((m % 24) / 24, 0.18, 0.52, 0.10);
    lookAt(ctx, yaw, headingTo(HOME.x, HOME.z, who.x, who.z), 0.85 * look);
  } else {
    /* --- the fold ---------------------------------------------------------
       take -> carry -> place. The two ends of the gesture are different folds
       and different facings, and the character turns BETWEEN them rather than
       reaching across itself. */
    const load = job.kind === 'load';
    const u = job.u, J = job.J;
    const fromF = load ? FOLD.dog : FOLD.belt;
    const toF = load ? FOLD.belt : FOLD.dog;
    const fromYaw = load ? YAW_DOG : YAW_BELT;
    const toYaw = load ? YAW_BELT : YAW_DOG;

    /* down to the first thing, hold, up and across, down to the second, hold,
       and all the way back up. Each descent is slow at the end (a careful
       arrival) and each lift is slow at the START (taking the weight). */
    const d1 = smooth(clamp01((u - 0.04) / (J.take - 0.10)));       // fold to the giver
    const h1 = win(u, J.take, J.take + 0.10, 0.03);                  // the exchange
    const up = smooth(clamp01((u - (J.take + 0.10)) / 0.14));        // straighten with it
    const d2 = smooth(clamp01((u - (J.place - 0.20)) / 0.16));       // fold to the belt
    const rec = smooth(clamp01((u - (J.place + 0.10)) / 0.18));      // and all the way up

    // fold: stand -> from -> stand -> to -> stand
    const wDown1 = Math.max(0, d1 - up);
    const wDown2 = Math.max(0, d2 - rec);
    F = mixFold(FOLD.stand, fromF, wDown1);
    F = mixFold(F, toF, wDown2);
    /* A beat of settle at the bottom of each fold — but never deeper than the
       solved pose, which sits right on the knee limit. Without the floor this
       dip drove the knee and the canted hip's roll past their limits and the
       runtime clamped them, so the pose that shipped was not the pose that was
       measured, and the handoff moved. */
    F.stand = Math.max(F.stand - 0.008 * h1, Math.min(FOLD.belt.stand, FOLD.dog.stand));

    yaw = mixYaw(fromYaw, toYaw, smooth(clamp01((u - (J.take + 0.08)) / 0.26)));
    shift = applyFold(ctx, F, sway * (1 - Math.max(wDown1, wDown2)));

    /* the head leads: it is looking at the thing before the hands get there,
       and it stays on the cube all the way to the belt. This is the single
       most important line in the file — a machine that looks first reads as
       deciding, one that does not reads as being driven. */
    ctx.set('head_pitch_joint', track(u, [
      [0.00, { p: 0.10 }], [0.10, { p: 0.62 }],
      [J.take, { p: 0.70 }], [J.take + 0.12, { p: 0.55 }],
      [J.place, { p: 0.68 }], [J.place + 0.10, { p: 0.50 }],
      [0.90, { p: 0.08 }], [1.00, { p: 0.06 }],
    ]).p);
    ctx.set('head_yaw_joint', 0);
    ctx.set('waist_yaw_joint', 0);

    /* and once it has let go, it watches the line take the cube away — the
       satisfied beat. Without it the character just stands up and forgets. */
    if (load && u > J.place + 0.06) {
      const w = smooth(clamp01((u - (J.place + 0.06)) / 0.16));
      const b = beltPoint(0.22);
      lookAt(ctx, yaw, headingTo(HOME.x, HOME.z, b.x, b.z), 0.8 * w);
    }
  }

  /* the root shift that keeps the feet planted through the fold, applied along
     the body's own forward axis */
  ctx.moveTo(HOME.x + shift * Math.cos(yaw), HOME.z - shift * Math.sin(yaw));
  ctx.face(yaw);
  if (job.kind === 'idle' || job.u < 0.06 || job.u > 0.94) ctx.tilt(0, 0.010);
  else ctx.tilt(0, 0);

  if (ctx.reducedMotion) {
    ctx.set('head_yaw_joint', 0);
    ctx.set('head_pitch_joint', 0.08);
    ctx.set('waist_yaw_joint', 0);
    ctx.set('waist_roll_joint', 0);
    ctx.tilt(0, 0);
  }

  // the cube is in its hands for the middle of each gesture
  const holding = job.kind !== 'idle' && job.u >= job.J.take && job.u < job.J.place;
  if (holding) ctx.holdProp(); else ctx.noProp();

  // pointer last, and it waits for the hands to be free
  const busy = job.kind === 'idle' ? 0 : win(job.u, 0.06, 0.94, 0.08);
  regard(ctx, HOME.x, HOME.z, yaw, busy * 0.9);
}

/* ================= walking on ================= */
function walking(ctx, t, p) {
  const phi = (p.s * ctx.mps) / params.advance;
  for (const [side, off] of [['left', 0], ['right', 0.5]]) {
    const f = footAt(phi + off, params.stand);
    leg(ctx, side, f.fx, f.fz, 0);
  }
  const sh = Math.sin(phi * TAU);
  const quiet = ctx.reducedMotion ? 0 : 1;

  // arms swing in opposition to the legs — the H2's are long and heavy, and a
  // biped this size that does not swing them reads as a statue on a conveyor
  ctx.set('left_shoulder_pitch_joint', -0.10 - 0.30 * sh);
  ctx.set('right_shoulder_pitch_joint', -0.10 + 0.30 * sh);
  ctx.set('left_shoulder_roll_joint', 0.12);
  ctx.set('right_shoulder_roll_joint', -0.12);
  ctx.set('left_elbow_joint', 1.05 + 0.16 * clamp01(sh));
  ctx.set('right_elbow_joint', 1.05 + 0.16 * clamp01(-sh));
  ctx.set('waist_pitch_joint', 0.06);
  ctx.set('waist_yaw_joint', -0.05 * sh * quiet);
  ctx.set('waist_roll_joint', 0.04 * sh * quiet);
  ctx.set('head_pitch_joint', 0.06);

  ctx.moveTo(p.x, p.z);
  ctx.face(p.heading);
  ctx.tilt(0, 0.014);
  ctx.noProp();

  /* clocking in: one long look out at the viewer on the way across. The host
     acknowledges the room before it starts work. */
  if (ctx.entering) {
    const n = win(p.u, 0.30, 0.66, 0.16);
    if (n > 0) {
      lookAt(ctx, p.heading, headingTo(p.x, p.z, p.x, p.z + 3), n * 0.95);
      ctx.add('head_pitch_joint', -0.10 * n);
    }
  }
  regard(ctx, p.x, p.z, p.heading, 0.5);
}

function path(t) {
  if (t < sched.entry.dur) return follow(sched, t);
  const a = routeAt(ROUTE, t);
  return { x: a.x, z: a.z, s: a.s + sched.entry.dist, moving: false, u: 0, heading: YAW_REST };
}

function body(ctx, t) {
  const p = path(t);
  if (p.moving) walking(ctx, t, p); else working(ctx, t);
}

export function entrance(ctx, t) { body(ctx, t); }
export function work(ctx, t) { body(ctx, t); }

/* ---- reactions -----------------------------------------------------------
   A reaction's `nudge` REPLACES the work pose's body tilt for as long as it
   runs, so anything that nudges at all has to carry its own lean and hand the
   body back exactly neutral. rotZ is the fore-aft pitch (positive leans BACK)
   and rotX is the lateral roll.

   All three are scaled to the body: big, slow, and with a settle at the end.
   A 1.83m machine that snaps has broken something. */
export const reactions = [
  {
    /* A full bow from the waist and hips. The H2 can actually bend, which the
       T1 could not, so this is a real bow rather than a whole-body tip — and
       the head arrives and leaves a fraction late, which is the entire
       difference between a bow and a nod. */
    name: 'bow',
    duration: 1.90,
    update(ctx, t) {
      const b = smooth(clamp01(t / 0.30)) - smooth(clamp01((t - 0.74) / 0.26));
      ctx.add('waist_pitch_joint', 0.44 * b);
      ctx.add('left_hip_pitch_joint', -0.30 * b); ctx.add('right_hip_pitch_joint', -0.30 * b);
      ctx.add('left_knee_joint', 0.16 * b); ctx.add('right_knee_joint', 0.16 * b);
      ctx.add('left_ankle_pitch_joint', 0.14 * b); ctx.add('right_ankle_pitch_joint', 0.14 * b);
      const late = smooth(clamp01((t - 0.08) / 0.30)) - smooth(clamp01((t - 0.80) / 0.26));
      ctx.add('head_pitch_joint', 0.30 * late);
      // the arms hang forward as the chest comes down, and settle back
      ctx.add('left_shoulder_pitch_joint', -0.26 * b); ctx.add('right_shoulder_pitch_joint', -0.26 * b);
      ctx.add('left_elbow_joint', -0.18 * b); ctx.add('right_elbow_joint', -0.18 * b);
      ctx.nudge({ rotZ: -0.05 * b });
    },
  },
  {
    /* The host's wave. Big and slow, from the shoulder rather than the wrist,
       with the chest turned into it — the whole machine says hello, which is
       the only way a wave reads at this size. */
    name: 'wave',
    duration: 1.75,
    update(ctx, t, dir) {
      const w = win(t, 0.0, 1.0, 0.28);
      const right = dir >= 0;
      const near = right ? 'right' : 'left';
      const sgn = right ? -1 : 1;
      ctx.add(near + '_shoulder_pitch_joint', -1.35 * w);
      ctx.add(near + '_shoulder_roll_joint', sgn * 0.55 * w);
      ctx.add(near + '_elbow_joint', -0.35 * w);
      const flap = Math.sin(t * Math.PI * 4.0) * w;
      ctx.add(near + '_wrist_roll_joint', 0.42 * flap);
      ctx.add(near + '_shoulder_yaw_joint', 0.20 * flap);
      ctx.add('waist_yaw_joint', -sgn * 0.22 * w);
      ctx.add('head_yaw_joint', -sgn * 0.30 * w);
      ctx.add('head_pitch_joint', -0.10 * w);
      ctx.nudge({ rotZ: 0.02 * w });
    },
  },
  {
    /* "Noted." A slow half-turn of the chest toward you with one hand opening
       outward, and back. The most in-character answer this machine has to
       being spoken to: it does not perform, it acknowledges. */
    name: 'regard',
    duration: 1.55,
    update(ctx, t, dir) {
      const w = win(t, 0.0, 1.0, 0.32);
      const sgn = dir >= 0 ? 1 : -1;
      const near = dir >= 0 ? 'right' : 'left';
      ctx.add('waist_yaw_joint', sgn * 0.34 * w);
      ctx.add('head_yaw_joint', sgn * 0.26 * w);
      ctx.add('head_pitch_joint', -0.08 * w);
      // one hand turns palm-out at hip height: an open, unhurried gesture
      ctx.add(near + '_shoulder_pitch_joint', -0.42 * w);
      ctx.add(near + '_shoulder_roll_joint', -sgn * 0.30 * w);
      ctx.add(near + '_elbow_joint', -0.30 * w);
      ctx.add(near + '_wrist_yaw_joint', sgn * 0.30 * w);
      ctx.nudge({ rotY: sgn * 0.05 * w, rotZ: 0.015 * w });
    },
  },
];

export default { key: 'h2', params, roam, ground, period, entryEnd, entrance, work, reactions };
