/* Booster T1 — carry and inspect, with a slow two-step shuffle.
   OWNED BY THE T1 SPECIALIST. Everything this file imports is shared and must
   not be edited from here. See INTERFACE.md. */

import { legIK } from './kinematics.mjs';
import { plan, follow, track, TAU, arc } from './schedule.mjs';

export const params = {
  L1: 0.2363, L2: 0.2920,   // hip->knee, knee->foot, metres
  stand: 0.472,             // hip above foot while carrying
  crouch: 0.322,            // hip above foot at the bottom of the squat
  stance: 0.150,            // ground per stance — small and careful
  duty: 0.80,               // long double support: it is carrying something
  lift: 0.045,
  speed: 0.085,             // stage units per second
  entrySpeed: 0.30,
  workDur: 15.0,            // seconds of crate cycle at each spot
  vicinity: 1.40,           // pointer-attention radius, stage units
};
params.advance = params.stance / params.duty;

/* T1 has no torso-pitch joint — its "Waist" is a yaw that turns the LEGS — so
   the squat is the only way down, which is why the crate is tall and gripped
   at its top rim. */
export const RELEASE_U = 0.42, REGRASP_U = 0.76;

const P1 = { x: 1.63, z: -0.44 }, P2 = { x: 1.72, z: -0.30 };
const OFFSTAGE = { x: 3.60, z: -0.44 };

const sched = plan(
  // arrives at a brisk walk, then shuffles slowly once it is at work
  [{ from: OFFSTAGE, to: P1, speed: params.entrySpeed }, { hold: params.workDur, at: P1, yaw: -1.90 }],
  [
    { from: P1, to: P2 }, { hold: params.workDur, at: P2, yaw: -1.30 },
    { from: P2, to: P1 }, { hold: params.workDur, at: P1, yaw: -1.90 },
  ], params.speed);

/* Roam region — see INTERFACE.md, "Moving a character". */
export const roam = {
  side: 'right',
  halfWidth: 0.49,
  work: { x: [1.63, 1.72], z: [-0.44, -0.30] },
  entry: { x: [1.63, 3.70], z: [-0.44, -0.30] },
};
export const ground = ['left_foot_link', 'right_foot_link'];
export const period = sched.loop.dur;
export const entryEnd = sched.entry.dur;

const HOLD_ARMS = {
  Left_Shoulder_Pitch: -1.00, Right_Shoulder_Pitch: -1.00,
  Left_Shoulder_Roll: -1.15, Right_Shoulder_Roll: 1.15,
  Left_Elbow_Pitch: -0.40, Right_Elbow_Pitch: -0.40,
  Left_Elbow_Yaw: 0.20, Right_Elbow_Yaw: -0.20,
};
const REACH_ARMS = {
  Left_Shoulder_Pitch: -0.62, Right_Shoulder_Pitch: -0.62,
  Left_Shoulder_Roll: -1.30, Right_Shoulder_Roll: 1.30,
  Left_Elbow_Pitch: -0.25, Right_Elbow_Pitch: -0.25,
  Left_Elbow_Yaw: 0.10, Right_Elbow_Yaw: -0.10,
};
const OPEN_ARMS = {
  Left_Shoulder_Pitch: -0.12, Right_Shoulder_Pitch: -0.12,
  Left_Shoulder_Roll: -1.46, Right_Shoulder_Roll: 1.46,
  Left_Elbow_Pitch: -0.16, Right_Elbow_Pitch: -0.16,
  Left_Elbow_Yaw: 0, Right_Elbow_Yaw: 0,
};

/** one leg from the IK, sole kept flat on the deck */
function leg(ctx, side, fx, fz) {
  const ik = legIK(fx, fz, params.L1, params.L2, +1);
  ctx.set(side + '_Hip_Pitch', ik.hip);
  ctx.set(side + '_Knee_Pitch', ik.knee);
  ctx.set(side + '_Ankle_Pitch', -(ik.hip + ik.knee));
}

function body(ctx, t) {
  const p = follow(sched, t);

  if (p.moving) {
    // walking: hug the crate, take slow small steps with a long double support
    const phi = (p.s * ctx.mps) / params.advance;
    for (const [side, off] of [['Left', 0], ['Right', 0.5]]) {
      const q = (phi + off) % 1;
      let fx, fz;
      if (q < params.duty) { fx = params.stance * (0.5 - q / params.duty); fz = -params.stand; }
      else {
        const b = (q - params.duty) / (1 - params.duty);
        fx = params.stance * (-0.5 + b);
        fz = -params.stand + params.lift * Math.sin(b * Math.PI);
      }
      leg(ctx, side, fx, fz);
    }
    // The lateral chain is one rotational DOF per joint, so hip roll cannot
    // shift the pelvis without dragging the planted foot sideways with it —
    // measured at ~15% of body speed, which reads as a skate. The whole weight
    // shift therefore lives in the body tilt, which pivots about the
    // character's floor point and leaves the feet where they were.
    const sh = Math.sin(phi * TAU);
    // "Waist" sits between the trunk and the LEGS, so any waist yaw swings both
    // feet across the deck; while walking it has to stay tiny
    ctx.set('Waist', 0.010 * sh);
    ctx.set('AAHead_yaw', 0.12 * Math.sin(phi * Math.PI));
    ctx.set('Head_pitch', 0.10);
    ctx.setAll(HOLD_ARMS);
    ctx.moveTo(p.x, p.z);
    ctx.face(p.heading);
    ctx.tilt(0.02, -0.085 * sh);
    ctx.holdProp();
    return;
  }

  // parked at a work spot: run the crate cycle
  const u = p.u;
  const hip = track(u, [
    [0.00, { h: params.stand }], [0.30, { h: params.stand }],
    [0.40, { h: params.crouch }], [0.46, { h: params.crouch }],
    [0.56, { h: params.stand }], [0.68, { h: params.stand }],
    [0.76, { h: params.crouch }], [0.82, { h: params.crouch }],
    [0.92, { h: params.stand }], [1.00, { h: params.stand }],
  ]).h;
  const arms = track(u, [
    [0.00, HOLD_ARMS], [0.30, HOLD_ARMS],
    [0.40, REACH_ARMS], [0.46, REACH_ARMS],
    [0.54, OPEN_ARMS], [0.70, OPEN_ARMS],
    [0.78, REACH_ARMS], [0.84, REACH_ARMS],
    [0.92, HOLD_ARMS], [1.00, HOLD_ARMS],
  ]);
  const carrying = u < RELEASE_U || u >= REGRASP_U;

  const sway = Math.sin(t * 0.62) * (carrying ? 1 : 0.4);
  const h = hip + sway * 0.010;
  leg(ctx, 'Left', 0.004, -h);
  leg(ctx, 'Right', 0.004, -h);

  const inspecting = u > 0.5 && u < 0.72;
  ctx.setAll(arms);
  ctx.set('Waist', Math.sin(t * 0.44) * 0.045);   // see the note in the walking branch
  ctx.set('AAHead_yaw', inspecting ? -0.12 : Math.sin(u * TAU * 1.5 + 1.2) * 0.5);
  ctx.set('Head_pitch', inspecting ? 0.62 : 0.10 + Math.sin(t * 0.9) * 0.06);

  ctx.moveTo(p.x, p.z);
  ctx.face(p.heading != null ? p.heading : -1.90);
  ctx.tilt(0, sway * 0.02);
  if (carrying) ctx.holdProp(); else ctx.dropProp();
}

export function entrance(ctx, t) { body(ctx, t); }
export function work(ctx, t) { body(ctx, t); }

export const reactions = [
  {
    name: 'bow',
    duration: 1.15,
    update(ctx, t) {
      const p = arc(t);
      ctx.add('Left_Hip_Pitch', -0.52 * p); ctx.add('Right_Hip_Pitch', -0.52 * p);
      ctx.add('Left_Knee_Pitch', 0.22 * p); ctx.add('Right_Knee_Pitch', 0.22 * p);
      ctx.add('Left_Ankle_Pitch', 0.26 * p); ctx.add('Right_Ankle_Pitch', 0.26 * p);
      ctx.add('Head_pitch', 0.34 * p); ctx.add('AAHead_yaw', -0.1 * p);
      ctx.add('Left_Shoulder_Pitch', -0.3 * p); ctx.add('Right_Shoulder_Pitch', -0.3 * p);
    },
  },
  {
    name: 'twist',
    duration: 1.0,
    update(ctx, t) {
      const s = Math.sin(t * Math.PI * 2) * (1 - t * 0.4);
      ctx.add('Waist', 0.42 * s);
      ctx.add('AAHead_yaw', 0.5 * s);
      ctx.add('Left_Shoulder_Roll', -0.2 * s); ctx.add('Right_Shoulder_Roll', -0.2 * s);
    },
  },
  {
    name: 'shimmy',
    duration: 0.80,
    update(ctx, t, v) { ctx.nudge({ rotY: Math.sin(t * Math.PI * 6) * 0.34 * (1 - t) * v }); },
  },
];

export default { key: 't1', params, roam, ground, period, entryEnd, entrance, work, reactions };
