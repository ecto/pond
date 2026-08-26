/* Unitree Z1 — the craftsman. Bolted down; everything it says, it says with
   reach, timing and touch.

   OWNED BY THE Z1 SPECIALIST. Everything this file imports is shared and must
   not be edited from here. See INTERFACE.md.

   ---------------------------------------------------------------------------
   The three ideas this file is built on
   ---------------------------------------------------------------------------

   1. AUTHOR IN CARTESIAN, NOT IN ANGLES. The work loop keyframes where the
      TOOL is — a base yaw, a reach radius and a height above the deck — and a
      closed-form arm IK turns that into joint2/3/4. Keyframing angles makes an
      arm swim; keyframing the point it is holding makes it look like it means
      something. It also means "the cube sits on the deck" is a number in this
      file rather than a thing to eyeball.

   2. NO JOINT MOVES IN LOCKSTEP. Each channel reads the clock at its own
      offset — the base yaw a sixth of a second AHEAD of the reach, the wrist
      pitch behind it, the tool roll behind that — so a move starts at the
      shoulder and arrives at the fingertips. That single stagger is most of
      what separates a manipulator from a marionette.

   3. THE LOOP IS FOUR CYCLES, NOT ONE. Three plain pick-and-places and then a
      longer fourth where it lifts the work up toward the camera and looks at
      it. `period` covers all four so the offline extent/limit checks see the
      signature beat too — a beat the tools never sample is a beat that ships
      unverified.

   ---------------------------------------------------------------------------
   Geometry, read straight off z1.urdf (metres, robot frame: +x forward, +z up)
   ---------------------------------------------------------------------------
     joint1 @ (0,0,0.0585)  +z   base yaw
     joint2 @ (0,0,0.0450)  +y   shoulder      => pivot sits 0.1035 up
     joint3 @ (-0.35,0,0)   +y   elbow         => upper arm 0.35 long
     joint4 @ (0.218,0,0.057) +y wrist pitch   => forearm hypot() = 0.22532,
                                                  canted by atan2(.057,.218)
     joint5 @ (0.07,0,0)    +z   wrist yaw
     joint6 @ (0.0492,0,0)  +x   tool roll
   and the crate rides at link06 + 0.015 along the tool axis, so its CENTRE is
   0.1342 out from the wrist pivot. That last number is the one that matters:
   author the crate's centre, ask for 0.035 (its half-height), and the crate is
   on the deck by construction instead of by adjustment.

   joint3's limit is [-2.88, 0] — the elbow on this arm folds NEGATIVE, and the
   IK below lands there on its own (q3 = beta - acos(...) is <= 0.255 always,
   and the reach clamp keeps it off the straight-arm end). An earlier version of
   this file keyframed +1.7..+1.9 by hand, which the runtime silently clamped to
   0. Solving instead of guessing is the durable fix for that class of bug. */

import { clamp01, mix, smooth, EASE } from './schedule.mjs';
import { MASTER, STATIONS, PALLET, PLINTH, CUBE, BACK_AT_BAY, H2_PRESENT, BELT_CARRY_Y, masterPhase } from './world.mjs';

export const params = {
  cycle: 11.0,      // seconds for one plain pick-and-place
  inspect: 2.6,     // extra seconds the 4th cycle gets, to hold the work up
  rise: 2.2,        // seconds to rise into place and wake up
  face: 0.78,       // base yaw the work is centred on, radians
  spread: 0.24,     // half the angle between the two spots, radians
  vicinity: 1.30,   // pointer-attention radius, stage units
};

/* ---------------------------------------------------------------------------
   Arm geometry and IK
   --------------------------------------------------------------------------- */

const SHOULDER = 0.1035;      // shoulder pivot height above the deck
const L1 = 0.35;              // shoulder -> elbow
const L2 = 0.225325;          // elbow -> wrist pivot (hypot of .218, .057)
const BETA = 0.255368;        // the forearm's built-in cant, atan2(.057, .218)
const TOOL = 0.1342;          // wrist pivot -> crate centre, along the tool axis
const REACH = L1 + L2 + TOOL; // 0.709 fully straight; we never go near it

const TAU = Math.PI * 2;
const PI = Math.PI;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* eases the work loop leans on. `smooth` and `EASE` come from schedule.mjs;
   these are the shapes that particular beats need and nothing else does. */
const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outQuint = (p) => 1 - Math.pow(1 - p, 5);   // long, patient deceleration
const inQuad = (p) => p * p;                      // a move gathering itself up
const outQuad = (p) => 1 - (1 - p) * (1 - p);

/**
 * Closed-form IK for the arm's sagittal plane.
 *
 *   r      reach out from the base axis, metres
 *   h      crate-centre height above the deck, metres
 *   pitch  world pitch of the tool axis; PI/2 points it straight down
 *
 * Derivation: rotating about +y sends (x,z) to (x cos a + z sin a, -x sin a +
 * z cos a), i.e. a plain 2-D rotation by -a. So the upper arm points at
 * (pi - q2), the forearm at (beta - q2 - q3) and the tool at -(q2+q3+q4), and
 * the chain collapses to a two-link problem between the shoulder and the wrist
 * pivot. Both branch signs solve it; the one below is the elbow-up posture the
 * keyposes have always used, and it is the branch that puts q3 in [-2.88, 0].
 *
 * Verified against the old hand-authored keyposes: LOW (2.50, -1.56, 0.60)
 * inverts to r = 0.459, h = 0.0363 — which is where its crate used to park.
 */
function armIK(r, h, pitch) {
  // wrist pivot: back off along the tool axis from the point we actually want
  const wx = r - TOOL * Math.cos(pitch);
  const wz = h - TOOL * -Math.sin(pitch) - SHOULDER;
  let d = Math.hypot(wx, wz);
  // Keep off both singularities. The far clamp matters most: at full stretch
  // the elbow straightens, q3 walks toward 0 and the pose stops reading as an
  // arm. 0.965 leaves a visible bend at the very edge of the workspace.
  const lo = Math.abs(L1 - L2) + 0.02, hi = (L1 + L2) * 0.965;
  const s = d < 1e-6 ? 1 : clamp(d, lo, hi) / d;
  const ux = wx * s, uz = wz * s;
  d = Math.hypot(ux, uz);

  const a1 = Math.acos(clamp((d * d + L1 * L1 - L2 * L2) / (2 * d * L1), -1, 1));
  const a2 = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const psi = Math.atan2(uz, ux);

  const q2 = PI - (psi + a1);
  const q3 = BETA - a2;
  const q4 = pitch - q2 - q3;
  return { joint2: q2, joint3: q3, joint4: q4 };
}

/** the full arm pose for a tool target, base yaw included */
const armPose = (yaw, r, h, pitch) => {
  const a = armIK(r, h, pitch);
  a.joint1 = yaw;
  return a;
};

/* ---------------------------------------------------------------------------
   Timing: per-channel tracks in seconds, each reading the clock at its own lead
   --------------------------------------------------------------------------- */

/**
 * A scalar keyframe track in SECONDS: [[t, value, ease?], ...]. Per-key easing
 * is the point — a descent wants a long tail and a lift wants a short one, and
 * one global curve cannot be both.
 */
function seq(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, a] = keys[i], [tb, b, e] = keys[i + 1];
    if (t <= tb) return tb <= ta ? b : mix(a, b, (e || smooth)(clamp01((t - ta) / (tb - ta))));
  }
  return keys[keys.length - 1][1];
}

/* How far AHEAD of the reach each channel reads the clock. Positive leads, so
   the base has already committed to the turn before the shoulder follows and
   the wrist is still finishing the last one. These four numbers are the whole
   "staggered joint timing" idea; they are small on purpose — a tenth of a
   second either way is the difference between a machine and a mechanism. */
const LEAD_YAW = 0.17;
const LEAD_REACH = 0.0;
const LEAD_PITCH = -0.15;
const LEAD_TOOL = -0.27;

/* ---------------------------------------------------------------------------
   The station: where the work happens
   --------------------------------------------------------------------------- */

/* Where this arm works, and what it reaches for.

   It has MOVED BAND — it used to be bolted downstage right; the relay puts the
   loading bay on the left, next to the Go2's route (see anim/world.mjs). The
   arm itself is unchanged: same IK, same staggered leads, same line-ups. Only
   the targets are new, and they are derived from the world stations rather than
   authored as reach/yaw pairs, so moving a station moves the arm with it. */
const AT = STATIONS.z1;

/* Facing. It now reaches for FOUR things — its pallet, the dog's back, the
   flagship's presented hands and the head of the belt — at stage bearings
   +0.77, +0.27, -0.41 and -0.87. Facing the middle of that fan puts the whole
   job inside +-0.82 rad of base yaw, a symmetric swing either side of straight
   ahead, and keeps the arm broadside to camera for all four. */
const YAW = -0.05;

/** a stage station and a WORLD height -> this arm's own (base yaw, reach, height)

   The height is taken relative to the arm's own base, which sits on top of the
   plinth. Everything downstream of here — the IK, the tracks, the hover and
   carry heights — is in the arm's frame, so this is the one place the plinth
   has to be subtracted. Forget it and every target is 0.25 too high. */
function aim(st, h) {
  const dx = st.x - AT.x, dz = st.z - AT.z;
  return { yaw: wrapPi(Math.atan2(-dz, dx) - YAW), r: Math.hypot(dx, dz), h: h - PLINTH.h };
}
const wrapPi = (a) => a - TAU * Math.round(a / TAU);

/* Heights, all honest metres now. The old H_DECK was a millimetre-level fit
   against a swept box baked into a payload that has since been rebuilt twice;
   with true scale and a real pallet the number is just geometry: the pallet is
   12 mm thick and the cube is 50 mm, so its centre rests at 37 mm. */
const H_DECK = PALLET.h + CUBE / 2;          // 0.037, cube resting on the pallet
const H_BACK = BACK_AT_BAY.y;                // cube centre on the Go2's back
const HOVER = 0.085;                         // the air it lines up in
const H_CARRY = 0.285;                       // travelling clear of everything
const R_HOME = 0.346;                        // ready pose: drawn in and up
const H_HOME = 0.304;
/* Tool "straight down" is 1.50, not PI/2. The pallet moved out to 0.417 when
   the arm was re-based to reach the belt, and at that radius a truly vertical
   tool needs more wrist pitch than joint4 has (limit +-1.52). 1.50 is
   indistinguishable by eye and inside the limit at every reach the arm uses. */
const DOWN = 1.42;

const PALLET_AIM = aim(STATIONS.z1Pallet, H_DECK);
const BELT_AIM = aim(STATIONS.beltHead, BELT_CARRY_Y);
const H2_AIM = aim(H2_PRESENT, H2_PRESENT.y);
/* Aim at the cube's real resting place on the back, not at the dog's stance
   centre. The two differ by 110mm — the carry point is forward of the body
   centre and rotates with the dog's heading — and 110mm is a miss. */
const BACK_AIM = aim(BACK_AT_BAY, H_BACK);

/* Bolted down: the region is a point. See INTERFACE.md, "Moving a character". */
export const roam = {
  side: 'left',
  halfWidth: 0.40,            // true swept half-extent, metres
  work: { x: [AT.x, AT.x], z: [AT.z, AT.z] },
};
export const ground = ['link00'];
/* bolted to a plinth: placed by its mounting face, not by its swept box */
export const mounted = true;

/* Phase-locked to the world task. Every character's period is now the master
   period, so the extent, keep-out and joint-limit sweeps cover one whole
   circuit rather than one private loop, and the four can no longer drift out
   of step with each other. */
export const period = MASTER;
export const entryEnd = params.rise;
/* ---------------------------------------------------------------------------
   The shift: this arm's part of the world task
   ---------------------------------------------------------------------------
   The score (anim/world.mjs) gives this arm both ends of the circuit and 66
   seconds of nothing in between. Rather than scatter that across the master
   clock, the whole of its work is one contiguous SHIFT on a shifted clock:

     w = (master - 84) mod 96

   which runs the two picks and two places back to back from w = 0 to w = 30,
   and leaves w = 30..88 for the idle the arm already knew how to do.

     w  0.0   reach out over where the Go2 is arriving
     w  8.0   pressed onto its back        GRASP   (master 92: go2 -> z1)
     w 12.0   set down on the pallet       RELEASE (master 96/0: z1 -> parked)
     w 18.0   pressed onto the pallet      GRASP   (master 6: parked -> z1)
     w 30.0   set down on the Go2's back   RELEASE (master 18: z1 -> go2)

   The four grasp/release instants are the ONLY numbers shared with the score,
   and they are asserted: the selftest samples the cube either side of every
   ownership change and requires its world position to be continuous. If this
   arm is not where the score says at those instants, the cube teleports and
   the build fails. */
const SHIFT0 = 85;                       // master second the shift begins at
const GRAB_BELT = 4.0, DROP_PALLET = 11.0, GRAB_PALLET = 17.0,
      DROP_BACK = 29.0, GRAB_HAND = 44.0, DROP_BELT = 57.0;
const SHIFT_LEN = 60;                    // and how long the work runs

/** shift-local seconds, 0..96 (only 0..60 is work) */
function shiftAt(t) {
  return masterPhase(t - SHIFT0);
}

/* The four channels, as keyframe tracks in SHIFT seconds. Same shape as before
   — a station-to-station move is an arrival ABOVE the target, a line-up, a
   descent that decelerates the whole way, a press, then a lift with conviction
   — but there are three of those moves now instead of two, and one of them is
   a hand-off from another robot rather than a pick off a surface. */
const B = BACK_AIM, P = PALLET_AIM, BE = BELT_AIM, H = H2_AIM;

const yawTrack = [
  [0.0, BE.yaw], [2.0, BE.yaw], [4.0, BE.yaw], [5.5, BE.yaw],
  [8.0, P.yaw, inOut], [11.0, P.yaw], [14.0, P.yaw], [17.0, P.yaw], [19.5, P.yaw],
  [25.0, B.yaw, inOut], [29.0, B.yaw], [32.0, B.yaw],
  [40.0, H.yaw, inOut], [44.0, H.yaw], [47.0, H.yaw],
  [53.0, BE.yaw, inOut], [57.0, BE.yaw], [60.0, BE.yaw],
  [64.0, 0], [96.0, 0],
];
const reachTrack = [
  [0.0, BE.r], [2.0, BE.r], [4.0, BE.r], [5.5, BE.r],
  [8.0, P.r, inOut], [11.0, P.r], [12.5, P.r], [14.0, P.r], [17.0, P.r], [19.5, P.r],
  [25.0, B.r, inOut], [29.0, B.r], [32.0, B.r],
  [40.0, H.r, inOut], [44.0, H.r], [47.0, H.r],
  [53.0, BE.r, inOut], [57.0, BE.r], [60.0, BE.r],
  [64.0, R_HOME, inOut], [96.0, R_HOME],
];
const heightTrack = [
  [0.0, BE.h + HOVER], [2.0, BE.h + HOVER],            // lined up over the belt
  [3.4, BE.h + 0.006, outQuint],                        // descend, decelerating
  [4.0, BE.h, outQuad],                                 // the press: GRASP
  [4.4, BE.h + 0.004, outQuad],
  [5.6, H_CARRY, inQuad], [6.2, H_CARRY, outQuad],      // lift, then settle
  [8.2, P.h + HOVER, inOut],
  [10.7, P.h + 0.020, outQuad], [11.0, P.h, outQuint],  // last centimetres slowest
  [12.0, P.h],                                          // RELEASE happens in here
  [12.8, P.h + HOVER, outQuad], [15.0, P.h + HOVER],    // back off and look at it
  [16.4, P.h + 0.006, outQuint], [17.0, P.h, outQuad],  // down again: GRASP
  [17.4, P.h + 0.004, outQuad],
  [19.0, H_CARRY, inQuad], [19.8, H_CARRY, outQuad],
  [25.0, H_CARRY],
  [27.0, B.h + HOVER, inOut], [28.0, B.h + HOVER],
  [28.4, B.h + 0.020, outQuad], [29.0, B.h, outQuint],  // set down: RELEASE
  [30.0, B.h],
  [31.5, B.h + HOVER, outQuad],
  [34.0, H_CARRY, inOut], [40.0, H_CARRY],
  /* the take from the flagship's hands. No hover-and-descend here: you do not
     lower a gripper onto something a colleague is holding out, you come in
     level and meet it. */
  [42.5, H.h, inOut], [44.0, H.h], [45.0, H.h],
  [47.0, H.h + 0.05, outQuad],
  [50.0, H_CARRY, inOut], [53.0, H_CARRY],
  [55.5, BE.h + 0.020, inOut], [57.0, BE.h, outQuint],  // lay it on the belt
  [58.0, BE.h],
  [59.5, BE.h + HOVER, outQuad],
  [64.0, H_HOME, inOut], [96.0, H_HOME],
];
/* Tool pitch. Straight down over the pallet and over the belt — you set a thing
   on a surface from above — but only 0.35 rad below horizontal over the Go2's
   back, and that is geometry rather than taste. The back is 0.49 up and 0.44
   out; with the tool pointing down, TOOL (0.134) pushes the WRIST another 0.134
   higher again and the target falls outside (L1+L2)*0.965. Coming in shallower
   keeps the wrist low enough to reach, and reads better anyway: you place onto
   a shelf from the side, not by hovering over it. Taking from the flagship's
   hands is shallower still — level, because that is how you meet a hand. */
const P_BACK = 0.55;
const P_HAND = 0.10;
/* Over the belt the tool comes in at 1.30 rather than straight down. The belt
   sits 0.433 out and only 0.113 up, and pointing the tool fully down there
   costs the wrist more pitch than joint4 has (limit +-1.52) — the runtime was
   clamping it by 0.101 rad, which quietly moved where the cube was laid. */
const P_BELT = 1.16;
const pitchTrack = [
  [0.0, P_BELT], [5.0, P_BELT],
  [8.5, DOWN], [12.0, DOWN], [17.5, DOWN], [19.5, DOWN],
  [25.0, P_BACK, inOut], [29.0, P_BACK], [32.0, P_BACK],
  [40.0, P_HAND, inOut], [44.0, P_HAND], [47.0, P_HAND],
  [53.0, P_BELT, inOut], [57.0, P_BELT], [60.0, P_BELT],
  [64.0, 1.30, inOut], [96.0, 1.30],
];

/** is the arm holding the cube, at shift time w */
const gripping = (w) => (w >= GRAB_BELT && w < DROP_PALLET) || (w >= GRAB_PALLET && w < DROP_BACK) || (w >= GRAB_HAND && w < DROP_BELT);

/**
 * The line-up: two to three shrinking corrections, ~120 ms of motion each with
 * a beat of stillness between, converging on zero. This is the craftsman
 * squaring up to the work, and it is deliberately the only place in the loop
 * where anything moves in a straight cut rather than an ease.
 */
function lineUp(ct, t0, steps) {
  let dr = 0, dy = 0;
  for (let i = 0; i < steps.length; i++) {
    const a = t0 + i * 0.22;
    const w = smooth(clamp01((ct - a) / 0.12));
    dr += steps[i][0] * w;
    dy += steps[i][1] * w;
  }
  // and unwind whatever is left as the descent begins
  const off = smooth(clamp01((ct - (t0 + steps.length * 0.22 + 0.10)) / 0.30));
  return { dr: dr * (1 - off), dy: dy * (1 - off) };
}

/* ---------------------------------------------------------------------------
   Idle: never actually still
   --------------------------------------------------------------------------- */

/* A point in the middle of the rest of the cast, in stage units. The Z1 is
   bolted to the right-hand edge and the other three work to its left, so an
   occasional glance that way reads as "something over there made a noise".
   Kept as a stage point and run through the same transform the pointer uses,
   rather than as a raw joint angle, so it stays meaningful if the composition
   is ever re-solved. */
const COWORKERS = { x: -0.35, z: 0.35 };

/** stage point -> this arm's own frame, in metres. See INTERFACE.md §3. */
function toLocal(sx, sy, sz, mps) {
  const dx = sx - AT.x, dz = sz - AT.z;
  const c = Math.cos(YAW), s = Math.sin(YAW);
  return { x: (dx * c - dz * s) * mps, y: (-dx * s - dz * c) * mps, z: sy * mps };
}

/* ---------------------------------------------------------------------------
   Pointer awareness — the most tactile of the four
   ---------------------------------------------------------------------------
   Near the pointer the tool DRIFTS toward it inside a safe envelope: never full
   extension, never below 10 cm off the deck, and never at the cost of the job.
   Two rules make it feel magnetic rather than servo'd:

   * per-channel weights. Base yaw gets w, reach and height w^1.4, the wrist
     w^1.9. Distal joints therefore arrive later than proximal ones for exactly
     the same reason they do in the work loop, and the arm bends toward the
     pointer before it points at it. This is the spring lag; it is expressed as
     a weight curve rather than an integrator because everything here has to be
     a pure function of time (INTERFACE.md §1) and an integrator is not.
   * a freedom envelope. Attention is only allowed to move the arm when the arm
     is not busy: full while returning to and sitting at the ready pose, zero
     through the descents, the grasp and the release. Mid-carry the envelope
     drops to a wrist-only sliver, so it acknowledges the pointer with a tilt
     and the crate never goes anywhere.                                       */

/* The envelope. Worth being careful with, because NOTHING OFFLINE CHECKS IT:
   the frame-edge and keep-out sweeps evaluate the loop with no pointer, so a
   generous envelope is a way to push this arm out of frame that no tool would
   ever catch. Swept over the whole loop against a grid of pointer positions,
   these bounds cost 6.7 mm of extra height and 7.9 mm of extra width over the
   work loop's own silhouette — about 1.4 mm in stage units, against 2.8% of
   frame-edge slack. Widen them and re-measure, or do not widen them. */
/* All four are in the ARM's frame, which now starts on top of the plinth. The
   height bounds therefore carry the plinth with them — `0.10 off the deck` is
   0.10 - PLINTH.h in the arm's own coordinates. Leaving them floor-relative
   made the lower bound a FLOOR the work pose could not get under, and since
   this clamp is applied to the blended pose rather than only to the pointer's
   contribution, it quietly lifted the arm off every target it reaches down to
   even with the pointer nowhere near it. */
const ENV_MIN_H = 0.10 - PLINTH.h;   // never below ten centimetres off the deck
const ENV_MAX_R = 0.44;              // inside the pick radius: no new silhouette width
const ENV_MIN_R = 0.20;
const ENV_MAX_H = 0.40;

/** how much licence the work loop is willing to give the pointer, 0..1 */
function freedom(ct, carrying) {
  if (carrying) return 0;                     // wrist-only; handled separately
  // dead steady over the work, free once the shift is done and before it starts
  return smooth(clamp01((ct - 62) / 2.5));
}

/* ---------------------------------------------------------------------------
   The work loop
   --------------------------------------------------------------------------- */

function workPose(ctx, t) {
  const w = shiftAt(t);

  /* --- the four channels, each still reading the clock at its own lead --- */
  let yaw = seq(w + LEAD_YAW, yawTrack);
  let r = seq(w + LEAD_REACH, reachTrack);
  let h = seq(w + LEAD_REACH, heightTrack);
  let pitch = seq(w + LEAD_PITCH, pitchTrack);

  /* Bow the two transfers. A planner's end-effector path between stations is a
     shallow arc, not a chord: it swings a little wide and a little high. Two
     lines, and it is the difference between "moved" and "carried". */
  const bow = (a, b) => Math.sin(PI * clamp01((w - a) / (b - a)));
  h += 0.030 * bow(5.6, 8.8);             // off the belt, onto the pallet
  h += 0.038 * bow(19.0, 26.5);           // off the pallet, across to the back
  r += 0.010 * bow(19.0, 26.5);
  h += 0.034 * bow(47.0, 55.0);           // out of the flagship's hands, to the belt
  r += 0.010 * bow(47.0, 55.0);

  /* Line-ups: shrinking corrections converging on zero, ~120ms of motion each
     with a beat of stillness between. The craftsman squaring up to the work.
     Three over a pick (it is committing to a grip), one over a place (it
     already knows where this goes). All excursions INBOARD — the working
     radius is the widest this silhouette ever gets. */
  const ups = [
    lineUp(w, 1.60, [[-0.024, 0.017], [0.011, -0.010], [-0.005, 0.004]]),   // pick off the belt
    lineUp(w, 10.10, [[-0.013, 0.009]]),                                     // place on the pallet
    lineUp(w, 14.60, [[-0.024, 0.017], [0.011, -0.010], [-0.005, 0.004]]),   // pick off the pallet
    lineUp(w, 27.90, [[-0.013, 0.009]]),                                     // place on the back
    lineUp(w, 42.00, [[-0.018, 0.012], [0.008, -0.007]]),                    // meet the hand
    lineUp(w, 55.00, [[-0.013, 0.009]]),                                     // lay it on the belt
  ];
  for (const u of ups) { r += u.dr; yaw += u.dy; }

  /* The settle: having set something down it lets one small oscillation die out
     of the wrist — the arm relaxing, not the arm wobbling. Once per place. */
  for (const s0 of [11.0, 29.0, 57.0]) {
    const st = clamp01((w - s0) / 0.55);
    if (st > 0 && st < 1) pitch += Math.sin(st * PI * 2.6) * 0.020 * (1 - st) * (1 - st);
  }

  /* The signature beat, kept: on the long carry it brings the cube up toward
     the lens and turns it over — the maker holding the work to the light. It
     lives on the pallet-to-back leg, which is the only span long enough to
     spend six seconds on a look without the handoff waiting for it. */
  let roll = 0, wristYaw = 0;
  const ins = clamp01((w - 21.0) / 4.4);
  if (ins > 0 && ins < 1) {
    const g = smooth(clamp01(ins / 0.24)) * (1 - smooth(clamp01((ins - 0.78) / 0.22)));
    const held = smooth(clamp01((ins - 0.22) / 0.14)) * (1 - smooth(clamp01((ins - 0.68) / 0.16)));
    // the drama is the reach drawing IN and the tool turning over, not altitude:
    // you bring work toward your eye, you do not hoist it
    yaw = mix(yaw, mix(P.yaw, B.yaw, 0.5) + 0.10, g);
    r = mix(r, 0.300, g);
    h = mix(h, 0.330, g);
    pitch = mix(pitch, 1.06, g);
    roll += Math.sin(held * PI * 0.85) * 0.62 * held;
    wristYaw += Math.sin(held * PI) * 0.14;
  }

  /* --- clamp into the envelope, solve, write ---
     The reach ceiling is the silhouette budget, not the arm's limit: the
     working radius is the widest this character ever gets and the frame-edge
     check is solved on it. 0.56 is what the Go2's back needs — it sits 0.525
     out — and the extents tool is the thing that says whether that is
     affordable. It was 0.50, which silently held the gripper 26mm short of the
     back and turned the handoff into a miss. */
  r = clamp(r, 0.16, 0.60);
  /* The height clamp is in the ARM's frame, so it has to be measured from the
     top of the plinth. It used to read `clamp(h, 0.028, 0.52)` — floor-mounted
     numbers — and the moment the arm went up on a plinth that floor became a
     ceiling 0.25 too high: every reach DOWN, to the pallet at 0.037 and to the
     belt at 0.113, silently clamped to the same 0.293 and the arm hovered
     above all four of its targets holding nothing. */
  h = clamp(h, 0.028 - PLINTH.h, 0.52);
  const pose = armPose(yaw, r, h, pitch);
  ctx.setAll(pose);
  ctx.set('joint5', wristYaw);
  ctx.set('joint6', roll);

  ctx.moveTo(AT.x, AT.z);
  ctx.face(YAW);
  ctx.tilt(0, 0);

  const carrying = gripping(w);
  return { ct: w, carrying, r, h, yaw, pitch };
}

/* ---------------------------------------------------------------------------
   Overlays: idle life, and the pointer
   --------------------------------------------------------------------------- */

function overlays(ctx, t, w) {
  const { ct, carrying } = w;

  /* Idle life. Two incommensurate periods so it never lands on a beat, and
     everything scaled by how free the arm is, so the tool is dead steady over
     the crate and only breathes once the job is done. Gated on reduced motion:
     the runtime freezes the loop at one instant for those viewers, and an
     ornament evaluated at a frozen instant is just an offset pose. */
  if (!ctx.reducedMotion) {
    /* Fade the idle in over the first second of the loop. The entrance has no
       drift on it — it is a machine booting, not a machine waiting — so
       switching the drift on at full amplitude the instant `work` takes over
       is a visible tick at the handoff. */
    const wake = smooth(clamp01((t - entryEnd) / 1.1));
    const idle = freedom(ct, carrying) * wake;
    ctx.add('joint5', Math.sin(t * 0.83) * 0.030 * idle);
    ctx.add('joint6', Math.sin(t * 0.61 + 1.4) * 0.055 * idle);
    ctx.add('joint4', Math.sin(t * 0.47 + 0.6) * 0.022 * idle);
    // the whole chain settling a hair under its own weight while it waits
    ctx.add('joint2', Math.sin(t * 0.39) * 0.012 * idle);
    ctx.add('joint3', Math.sin(t * 0.39 - 0.5) * 0.009 * idle);

    /* A glance at the coworkers, on cycles the inspection does not own — the
       schedule already gives the fourth cycle a held beat, and two special
       moments in one cycle is one too many. */
    /* A glance at the coworkers, during the long idle rather than on a cycle
       boundary — the shift is one block of work now, and the arm has 58
       seconds afterwards in which looking up is the only thing it does. */
    {
      const g = Math.sin(clamp01((ct - 40) / 14) * PI);
      if (g > 0) {
        const L = toLocal(COWORKERS.x, 0.22, COWORKERS.z, ctx.mps);
        const want = Math.atan2(L.y, L.x);
        /* A look, not a turn — and HARD capped, because the coworkers are
           behind this arm's shoulder. The bare "a fifth of the way there"
           worked out to 0.7 rad, which reads as the whole machine wheeling
           round rather than an ear pricking up. 0.16 rad is about nine
           degrees: enough to notice, not enough to abandon the bench. */
        ctx.add('joint1', clamp((want - ctx.get('joint1')) * 0.20, -0.16, 0.16) * g);
        ctx.add('joint4', -0.08 * g);
      }
    }
  }

  /* Pointer. Overlay, never replacement — blend toward, never write over.
     ctx.pointer is already NO_POINTER under reduced motion, so this switches
     itself off without a second check. */
  const p = ctx.pointer;
  if (!p.present || p.attention <= 0.001) return;

  /* Curiosity, not obedience: a slow drag is followed closely, a flick barely
     at all. Capped below 1 so the work pose always reads underneath. */
  const curiosity = 1 / (1 + p.speed * 1.1);
  const base = clamp01(p.attention) * (0.45 + 0.55 * curiosity);

  if (carrying) {
    /* Mid-carry the acknowledgement is a wrist tilt and nothing else: the base,
       shoulder and elbow are not touched, so the crate stays on the carry path
       and the grip is never re-solved. The crate is bolted to link06, so a
       wrist tilt does swing it — by about 8 mm at full attention, a fifth of
       the crate's own width and around 1.5 mm once the stage scale is applied.
       That is the tilt being visible on the thing it is holding, which is
       correct; anything larger starts to read as fumbling. */
    const L = toLocal(p.atMyDepth.x, p.atMyDepth.y, AT.z, ctx.mps);
    const want = Math.atan2(L.y, L.x);
    const off = Math.atan2(Math.sin(want - ctx.get('joint1')), Math.cos(want - ctx.get('joint1')));
    ctx.add('joint5', clamp(off, -1, 1) * 0.22 * base);
    ctx.add('joint6', clamp(off, -1, 1) * 0.26 * base);
    ctx.add('joint4', -0.05 * base);
    return;
  }

  const w2 = base * freedom(ct, false);
  if (w2 <= 0.001) return;

  /* The safe envelope. atMyDepth is where the ray crosses this arm's own depth
     plane, which is the right target for "reach toward it": the floor hit would
     have it grinding the tool along the deck. */
  const L = toLocal(p.atMyDepth.x, p.atMyDepth.y, AT.z, ctx.mps);
  const wantYaw = clamp(Math.atan2(L.y, L.x), -0.55, 1.45);
  const wantR = clamp(Math.hypot(L.x, L.y), ENV_MIN_R, ENV_MAX_R);
  const wantH = clamp(L.z, ENV_MIN_H, ENV_MAX_H);
  // tool tips from straight-down toward horizontal as the target rises
  const wantP = mix(DOWN, 0.55, clamp01((wantH - ENV_MIN_H) / 0.28));

  /* Per-channel lag: base first, arm next, wrist last. */
  const wy = w2, wr = Math.pow(w2, 1.4), wp = Math.pow(w2, 1.9);
  const cur = { j1: ctx.get('joint1') };
  const yaw = mix(cur.j1, wantYaw, wy * 0.85);
  const r = mix(w.r, wantR, wr * 0.80);
  const h = mix(w.h, wantH, wr * 0.80);
  const pitch = mix(w.pitch, wantP, wp * 0.85);

  ctx.setAll(armPose(yaw, clamp(r, 0.16, ENV_MAX_R), clamp(h, ENV_MIN_H, 0.44), pitch));
  // a hair of tool roll toward it, so the flange faces what it is looking at
  ctx.add('joint6', clamp((wantYaw - yaw) * 1.2, -0.5, 0.5) * wp);
}

/* ---------------------------------------------------------------------------
   Entrance — the instrument coming online
   ---------------------------------------------------------------------------
   Folded up small, then unfolding DISTALLY-TO-PROXIMALLY REVERSED: the base
   settles its heading first, the shoulder follows, the elbow after that, and
   the wrist is still waking up when everything else has arrived. It finishes
   with a small flourish — one decaying turn of the tool roll — which is the
   only unnecessary thing this character does all loop, and is the point.

   Authored in joint space rather than through the IK on purpose: the beat is
   "joints coming online one at a time", which is a statement about joints. */

/* The folded pose. Worth stating plainly, because it is the opposite of what
   the joint table suggests: on this arm joint3 near ZERO is the tightly folded
   elbow and joint3 near its -2.88 limit is the STRAIGHT one. The two-link
   solution has d^2 = L1^2 + L2^2 - 2*L1*L2*cos(BETA - q3), so pushing q3
   negative opens the elbow out. A first pass at this file curled the arm with
   joint3 = -2.62 and got a fully extended arm lying across the deck.

   At q2 = 2.75 the upper arm points down and forward, q3 = -0.15 folds the
   forearm back over it, and q4 = 0.90 tucks the tool up against the base:
   elbow 0.24 m, wrist 0.08 m, tool 0.12 m. Small, closed, asleep. */
const CURL = { joint1: 0.10, joint2: 2.75, joint3: -0.15, joint4: 0.90, joint5: -0.62, joint6: -1.15 };

export function entrance(ctx, t) {
  const R = params.rise;
  const u = clamp01(t / R);
  ctx.lift(PLINTH.h);
  // the base plate arrives first and the arm is still folded on top of it
  ctx.rise(smooth(clamp01(t / (R * 0.45))));

  const p = (a, b, e) => (e || smooth)(clamp01((u - a) / (b - a)));
  const home = armPose(params.face, R_HOME, H_HOME, 1.30);

  /* Proximal to distal, each overlapping the one before by about half. The
     wrist is still arriving when everything else has settled, which is the
     whole read: an instrument bringing itself up one axis at a time. */
  ctx.set('joint1', mix(CURL.joint1, home.joint1, p(0.05, 0.46, inOut)));
  ctx.set('joint2', mix(CURL.joint2, home.joint2, p(0.16, 0.66, inOut)));
  ctx.set('joint3', mix(CURL.joint3, home.joint3, p(0.28, 0.80, inOut)));
  ctx.set('joint4', mix(CURL.joint4, home.joint4, p(0.40, 0.94, inOut)));
  ctx.set('joint5', mix(CURL.joint5, 0, p(0.48, 1.00, outQuad)));

  /* the flourish: the tool unwinds and rings down, ending exactly at zero */
  const f = clamp01((u - 0.55) / 0.45);
  ctx.set('joint6', mix(CURL.joint6, 0, EASE(f)) + Math.sin(f * PI * 2.4) * 0.36 * (1 - f) * (1 - f));

  ctx.moveTo(AT.x, AT.z);
  ctx.face(YAW);
  ctx.tilt(0, 0);
}

export function work(ctx, t) {
  const w = workPose(ctx, t);
  overlays(ctx, t, w);
  ctx.rise(1);
  ctx.lift(PLINTH.h);          // it is bolted to a plinth, not to the floor
}

/* ---------------------------------------------------------------------------
   Reactions — layered on top of whatever the loop was doing
   ---------------------------------------------------------------------------
   A reaction is a BLIND additive delta. index.mjs runs each one against a fresh
   empty context, so `ctx.get()` inside an update returns zero and there is no
   way to read what the work loop just posed — which means every delta here has
   to be safe against EVERY pose in the loop, including the ones with the tool
   already resting on the deck and joint4 already at 1.30 of its 1.52.

   Two signs are worth stating, because both read backwards and both were wrong
   in a first pass, and neither the selftest nor the extent sweep looks at
   reactions at all:

     +joint2 swings the arm DOWN and out, -joint2 lifts it.
     +joint3 (toward its 0 limit) FOLDS the elbow in, -joint3 straightens it.

   So an "anticipation dip" written as +joint2 drove the gripper 69 mm through
   the floor whenever the click landed mid-place, and a "bashful retract" as
   +joint2/-joint3 was an arm reaching further away, 110 mm underground. The
   deltas below are all net-upward and all lean on joint4's roomy negative side.
   Worst case over the whole loop is now 2 mm under the deck, which is the work
   pose's own floor and not the reaction's doing.                              */

export const reactions = [
  {
    /* A proper wave. Wrist-led: the arm lifts and opens to give the flange room
       first, then the wave itself is three oscillations of joint5 decaying to
       nothing, with joint6 trailing a quarter period behind so the tool flops
       rather than tracks. Overlapping action is the whole trick. */
    name: 'wave',
    duration: 1.75,
    update(ctx, t) {
      const raise = Math.sin(clamp01(t * 1.18) * PI) ** 0.8;
      ctx.add('joint2', -0.42 * raise);
      ctx.add('joint3', 0.34 * raise);
      ctx.add('joint4', -0.30 * raise - 0.10 * Math.sin(clamp01(t * 5) * PI));  // a nod on the way up
      const swing = clamp01((t - 0.18) / 0.82);
      const decay = (1 - swing) * (1 - swing);
      ctx.add('joint5', Math.sin(swing * PI * 5.4) * 0.68 * decay);
      ctx.add('joint6', Math.sin(swing * PI * 5.4 - 0.9) * 0.40 * decay);
    },
  },
  {
    /* Tada. Anticipation down, then up and open with the tool presented, a
       held beat, a double flourish of the roll, and one overshoot on the way
       back — proud, and slightly pleased with itself. */
    name: 'tada',
    duration: 1.55,
    update(ctx, t) {
      // anticipation is a small reach OUT rather than a dip down: same coil,
      // and it cannot bury the tool when the click lands over the deck
      const set = Math.sin(clamp01(t / 0.17) * PI) * 0.16;
      const up = smooth(clamp01((t - 0.10) / 0.34)) * (1 - smooth(clamp01((t - 0.86) / 0.62)));
      ctx.add('joint3', -set + 0.46 * up);
      ctx.add('joint2', -0.60 * up);
      ctx.add('joint4', -0.34 * up);
      ctx.add('joint6', Math.sin(clamp01((t - 0.24) / 0.66) * PI * 2) * 0.55 * up);
      // the overshoot as it comes back down, on the elbow rather than the
      // shoulder — again so the recovery cannot overshoot into the floor
      const back = clamp01((t - 0.90) / 0.65);
      ctx.add('joint3', Math.sin(back * PI * 1.6) * 0.10 * (1 - back));
    },
  },
  {
    /* Bashful: a quick fold away from you, a pause, then it unfolds about
       halfway and tips the tool over as if peeking round the side of its own
       forearm, before going back to work.

       Note the sign on joint3. It reads backwards and it is not: POSITIVE
       joint3 (toward its 0 limit) closes this elbow up and draws the arm IN,
       negative opens it out toward the straight-arm end. A first pass here
       used -0.30 to "retract" and produced an arm reaching further away, which
       is roughly the opposite of bashful. */
    name: 'peek',
    duration: 1.95,
    update(ctx, t) {
      const hide = smooth(clamp01(t / 0.20)) * (1 - smooth(clamp01((t - 1.30) / 0.62)));
      ctx.add('joint2', -0.26 * hide);     // draw up...
      ctx.add('joint3', 0.66 * hide);      // ...and fold the elbow right in
      ctx.add('joint4', -0.18 * hide);     // tool swung back over the forearm
      const peek = Math.sin(clamp01((t - 0.46) / 0.66) * PI) * (t < 1.24 ? 1 : 0);
      ctx.add('joint3', -0.26 * peek);     // lean out from behind it...
      ctx.add('joint4', -0.30 * peek);     // ...and tip the tool round to look
      ctx.add('joint5', 0.52 * peek);
      ctx.add('joint6', -0.36 * peek);
    },
  },
  {
    /* Kept from the original cast: a whole-body squash on the nudge channel.
       It costs one line and it is the only reaction that reads at thumbnail
       size, which is where most of these get seen. */
    name: 'boing',
    duration: 0.70,
    update(ctx, t, v) {
      const p = Math.sin(t * PI * 2.5) * (1 - t);
      ctx.nudge({ sclY: 1 + p * 0.2 * v, sclX: 1 - p * 0.13 * v });
    },
  },
];

export default { key: 'z1', params, roam, ground, mounted, period, entryEnd, entrance, work, reactions };
