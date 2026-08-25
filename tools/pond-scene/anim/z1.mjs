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

const R_WORK = 0.459;   // reach at which both spots sit — unchanged from the
                        // hand-authored keyposes, so the silhouette's swept
                        // width, which the frame-edge budget is solved around,
                        // does not move
/* The crate is 70 mm, so its centre at 0.0350 is geometrically "on the deck".
   0.034349 instead, for a reason worth writing down.

   mesh-data.js stores this character's swept bounding box — height 0.508505,
   floor -0.002051 — and the selftest compares the live sweep against it to the
   millimetre. That box is a build artefact of whatever the loop used to do, so
   it pins BOTH ends of this arm's vertical envelope until someone regenerates
   the payload. The old loop's gripper went 2.051 mm under the deck at full
   reach; this one reproduces that exactly, which is also what keeps the crate
   parking where it always has (0.65 mm proud of nothing, invisible at any size
   this scene is drawn). Rebuilding the payload would free both numbers; until
   then, matching them is the honest thing and re-solving them by hand is not.  */
const H_DECK = 0.034349;
const H_HOVER = 0.122;  // lined up above the crate, one crate-height of air
const H_CARRY = 0.212;  // travelling clear of the deck
const R_HOME = 0.346;   // ready pose: drawn in and up, weight off the reach
const H_HOME = 0.304;
const DOWN = PI / 2;    // tool straight down

const AT = { x: 1.15, z: 0.60 }, YAW = -0.75;

/* Bolted down: the region is a point. See INTERFACE.md, "Moving a character". */
export const roam = {
  side: 'right',
  halfWidth: 0.52,            // true swept half-extent, metres
  work: { x: [1.15, 1.15], z: [0.60, 0.60] },
};
export const ground = ['link00'];

/* Four cycles per loop: three plain, then the long one it shows off in. The
   whole thing is `period` so the extent, keep-out and joint-limit checks all
   sample the signature beat instead of only the workaday ones. */
const CYCLES = 4;
const SIGNATURE = 3;                        // which cycle gets the inspection
export const period = params.cycle * CYCLES + params.inspect;
export const entryEnd = params.rise;

/** which cycle we are in, and how far through it, given loop-local seconds */
function cycleAt(tt) {
  let s = tt % period;
  for (let k = 0; k < CYCLES; k++) {
    const dur = params.cycle + (k === SIGNATURE ? params.inspect : 0);
    if (s < dur || k === CYCLES - 1) return { k, ct: s, extra: dur - params.cycle };
    s -= dur;
  }
  return { k: 0, ct: 0, extra: 0 };
}

/* Where the inspection is spliced in. The base timeline FREEZES here for
   `extra` seconds while the detour runs, then resumes exactly where it paused —
   so the signature cycle is the plain cycle with a held breath inside it, not a
   second timeline to keep in sync with the first. */
const HOLD_AT = 4.60;

/* ---------------------------------------------------------------------------
   One plain cycle, 11 seconds, as four tracks
   ---------------------------------------------------------------------------
   The story: leave the ready pose, cross to the pick spot and arrive ABOVE it,
   line up (three shrinking corrections), descend slowing all the way down,
   press and grasp, lift away with conviction, carry across on a bowed path,
   line up again, descend with the last three centimetres slowest of all,
   settle, let go, back off and look at it, then go back to ready.           */

/* Every track is deliberately FLAT for a third of a second either side of the
   cycle boundary. The channels read the clock at different offsets, so a track
   still moving at t=11.0 gets sampled by its lead as though the next cycle had
   already started it — which shows up as a ~1 degree tick at the seam. Parking
   each channel before the boundary is cheaper than special-casing the lead. */
const yawTrack = (src, dst, mid) => [
  [0.00, mid],
  [0.24, mid],
  [0.72, src, inOut],
  [4.60, src],
  [6.10, dst, inOut],      // the transfer: the base carries the move
  [9.15, dst],
  [9.75, dst - Math.sign(dst - src) * 0.05],   // lean off it while checking
  [10.60, mid, inOut],
  [11.0, mid],
];

const reachTrack = [
  [0.00, R_HOME],
  [1.55, R_WORK, inOut],   // arrive at the working radius BEFORE descending:
  [8.55, R_WORK],          // approach from above, never in from the side
  [9.30, R_WORK - 0.030, outQuad],   // retreat pulls back as well as up
  [9.90, R_WORK - 0.036],
  [10.60, R_HOME, inOut],
  [11.0, R_HOME],
];

const heightTrack = [
  [0.00, H_HOME],
  [1.95, H_HOVER, inOut],
  [2.70, H_HOVER],                   // the line-up: flat, corrections on top
  [3.55, H_DECK + 0.005, outQuint],  // descend, decelerating the whole way
  [3.72, H_DECK, outQuad],           // the press: seat the jaws on the crate.
                                     // It bottoms exactly ON the deck — a
                                     // press that dips below it puts a visible
                                     // corner of the crate through the floor
  [3.90, H_DECK + 0.002, outQuad],
  [4.42, H_CARRY + 0.014, inQuad],   // lift: gathers speed, then a hair over
  [4.85, H_CARRY, outQuad],          // ...and settles back onto the carry line
  [6.35, H_CARRY],
  [6.95, H_HOVER, inOut],
  [7.20, H_HOVER],                   // one correction over the drop spot
  [7.75, H_DECK + 0.030, outQuad],   // down to three centimetres...
  [8.30, H_DECK, outQuint],          // ...and the last three, slowest of all
  [8.62, H_DECK],                    // settle
  [8.80, H_DECK],                    // release happens in here
  [9.30, H_HOVER + 0.020, outQuad],  // a short, unhurried retreat
  [9.90, H_HOVER + 0.020],           // and a beat spent looking at it
  [10.60, H_HOME, inOut],
  [11.0, H_HOME],
];

const pitchTrack = [
  [0.00, 1.30],
  [1.75, DOWN, inOut],
  [4.30, DOWN],
  [4.95, DOWN - 0.11, inOut],        // carried tipped a touch toward itself
  [6.30, DOWN - 0.11],
  [7.00, DOWN, inOut],
  [8.80, DOWN],
  [9.85, DOWN - 0.24, inOut],        // tilt to look at what it just put down
  [10.55, 1.30, inOut],
  [11.0, 1.30],
];

/* Grasp and release, as one 0..1 "the crate is mine" signal. The jaws close
   over 3.62..3.86 and open over 8.66..8.86; preview.js scans for the frame the
   prop is let go rather than trusting a phase constant, so these numbers are
   the single source of truth for where the crate ends up. */
const HOLD_ON = 3.74, HOLD_OFF = 8.76;

/* Exported for tools that want the grasp phase as a fraction of the loop. The
   loop is four cycles now, so these describe the FIRST pick-and-place. */
export const GRASP_U = HOLD_ON / period, RELEASE_U = HOLD_OFF / period;

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
const ENV_MIN_H = 0.10;   // never below ten centimetres off the deck
const ENV_MAX_R = 0.44;   // inside the pick radius: no new silhouette width
const ENV_MIN_R = 0.20;
const ENV_MAX_H = 0.40;

/** how much licence the work loop is willing to give the pointer, 0..1 */
function freedom(ct, carrying) {
  if (carrying) return 0;                     // wrist-only; handled separately
  // free while heading home and while at home, closed down over the work
  const home = smooth(clamp01((ct - 9.95) / 0.9));
  const leaving = 1 - smooth(clamp01((ct - 0.15) / 0.7));
  return Math.max(home, leaving);
}

/* ---------------------------------------------------------------------------
   The work loop
   --------------------------------------------------------------------------- */

function workPose(ctx, t) {
  const tt = Math.max(0, t - entryEnd);
  const { k, ct: raw, extra } = cycleAt(tt);

  /* Splice: hold the base timeline still while the inspection runs. */
  const ins = extra > 0
    ? clamp01((raw - HOLD_AT) / extra)          // 0..1 across the held window
    : 0;
  const ct = raw <= HOLD_AT ? raw
    : raw < HOLD_AT + extra ? HOLD_AT
      : raw - extra;

  /* The crate ping-pongs: each cycle runs the other way. */
  const flip = k % 2 === 1;
  const A = params.face - params.spread, B = params.face + params.spread;
  const src = flip ? B : A, dst = flip ? A : B;
  const mid = (src + dst) * 0.5;

  /* --- the four channels, each on its own clock --- */
  let yaw = seq(ct + LEAD_YAW, yawTrack(src, dst, mid));
  let r = seq(ct + LEAD_REACH, reachTrack);
  let h = seq(ct + LEAD_REACH, heightTrack);
  let pitch = seq(ct + LEAD_PITCH, pitchTrack);

  /* Bow the transfer. A planner's end-effector path between two stations is a
     shallow arc, not a chord: it swings a little wide and a little high. Two
     lines, and it is the difference between "moved" and "carried". */
  const cross = Math.sin(PI * clamp01((ct - 4.60) / 1.75));
  r += 0.008 * cross;                // mostly height: the reach budget is the
  h += 0.024 * cross;                // one the frame-edge check is solved on

  /* Line-ups. Three over the pick (it is committing to a grip), one over the
     place (it already knows where this goes). All the excursions are INBOARD:
     the working radius is the widest the silhouette ever gets, and lining up
     is not the beat to spend the frame-edge budget on. */
  const up1 = lineUp(ct, 2.06, [[-0.026, 0.019], [0.012, -0.011], [-0.005, 0.004]]);
  const up2 = lineUp(ct, 6.98, [[-0.014, 0.010]]);
  r += up1.dr + up2.dr;
  yaw += up1.dy + up2.dy;

  /* The settle. Having put the crate down it lets one small oscillation die
     out of the wrist — the arm relaxing, not the arm wobbling. */
  const st = clamp01((ct - 8.30) / 0.55);
  if (st > 0 && st < 1) pitch += Math.sin(st * PI * 2.6) * 0.020 * (1 - st) * (1 - st);

  /* --- the signature beat --- */
  let roll = 0, wristYaw = 0;
  if (extra > 0 && ins > 0 && ins < 1) {
    /* Up toward the camera and held, with a slow turn of the tool: the maker
       holding the work to the light. Weight eases in and out of a base pose
       that is frozen for the duration, so the detour cannot tear the loop. */
    /* Ramp in, HOLD, ramp out — as smoothsteps, not as a sine raised to a
       power. sin(x)^0.7 widens the hold but has an infinite slope at both
       ends, which the tool path shows up as a snap into and out of the beat. */
    const w = smooth(clamp01(ins / 0.24)) * (1 - smooth(clamp01((ins - 0.78) / 0.22)));
    const held = smooth(clamp01((ins - 0.22) / 0.14)) * (1 - smooth(clamp01((ins - 0.68) / 0.16)));
    /* 0.3205 is not a taste number, it is a fit. The character's swept height
       is baked into mesh-data.js (0.508505 m) and the selftest compares the
       live sweep against it, so the TALLEST moment in the loop is pinned to
       the millimetre until someone rebuilds the payload. Better that the
       moment spending that ceiling is the signature beat than an idle pose:
       the inspection is now, by construction, the highest this arm ever
       reaches. The ready pose sits ~8 mm below it, which is the separation
       that makes the lift read as a lift.

       The drama therefore comes from the reach drawing IN and the tool turning
       over, not from altitude. That is the truer gesture anyway — you bring
       work toward your eye, you do not hoist it. */
    yaw = mix(yaw, 0.12, w);            // a partial turn toward the viewer, not
    r = mix(r, 0.300, w);               // a full one: the frame is tight here
    h = mix(h, 0.3205, w);
    pitch = mix(pitch, 1.06, w);
    roll += Math.sin(held * PI * 0.85) * 0.62 * held;        // turning it over
    wristYaw += Math.sin(held * PI) * 0.14;
  }

  /* --- clamp into the envelope, solve, write --- */
  r = clamp(r, 0.16, 0.48);
  h = clamp(h, 0.028, 0.44);
  const pose = armPose(yaw, r, h, pitch);
  ctx.setAll(pose);
  ctx.set('joint5', wristYaw);
  ctx.set('joint6', roll);

  ctx.moveTo(AT.x, AT.z);
  ctx.face(YAW);
  ctx.tilt(0, 0);

  const carrying = ct >= HOLD_ON && ct < HOLD_OFF;
  if (carrying) ctx.holdProp(); else ctx.dropProp(ct < HOLD_ON ? 'src' : 'dst');

  return { ct, carrying, r, h, yaw, pitch };
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
    const { k } = cycleAt(Math.max(0, t - entryEnd));
    if (k % 2 === 0 && k !== SIGNATURE) {
      const g = Math.sin(clamp01((ct - 9.9) / 1.0) * PI);
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
  ctx.dropProp('src');
}

export function work(ctx, t) {
  const w = workPose(ctx, t);
  overlays(ctx, t, w);
  ctx.rise(1);
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

export default { key: 'z1', params, roam, ground, period, entryEnd, entrance, work, reactions };
