/* Unitree Z1 — bolted down, picking and placing.
   OWNED BY THE Z1 SPECIALIST. Everything this file imports is shared and must
   not be edited from here. See INTERFACE.md. */

import { track, smooth, arc } from './schedule.mjs';

export const params = {
  cycle: 9.5,       // seconds per pick-and-place
  rise: 1.1,        // seconds to rise into place on arrival
  face: 0.78,       // base yaw the work is centred on, radians
  spread: 0.22,     // half the angle between the two spots, radians
  vicinity: 1.20,   // pointer-attention radius, stage units
};

/* All three keyposes live on one "arm extended" manifold (elbow near 1.9 rad):
   folding the elbow in instead drives link04 straight through link02. */
const HOME = [1.30, 1.72, -1.30, 0.10, 0];
const LOW = [0.70, 1.90, -1.00, 0.06, 0];
const HIGH = [1.10, 1.90, -1.40, 0.08, 0];
const AT = { x: 1.66, z: 0.60 }, YAW = -0.75;

export const GRASP_U = 0.24, RELEASE_U = 0.66;

/* Bolted down: the region is a point. See INTERFACE.md, "Moving a character". */
export const roam = {
  side: 'right',
  halfWidth: 0.73,
  work: { x: [1.66, 1.66], z: [0.60, 0.60] },
};
export const ground = ['link00'];
export const period = params.cycle;
export const entryEnd = params.rise;

const pose = (yaw, o) => ({ joint1: yaw, joint2: o[0], joint3: o[1], joint4: o[2], joint5: o[3] || 0, joint6: o[4] || 0 });

function body(ctx, t) {
  const tt = Math.max(0, t);
  const k = Math.floor(tt / params.cycle);
  const u = (tt / params.cycle) % 1;
  // the cube ping-pongs: each cycle runs the other way
  const flip = k % 2 === 1;
  const A = params.face - params.spread, B = params.face + params.spread;
  const src = flip ? B : A, dst = flip ? A : B;
  const mid = (src + dst) * 0.5;

  const j = track(u, [
    [0.00, pose(mid, HOME)],
    [0.16, pose(src, HIGH)],
    [0.22, pose(src, LOW)],
    [0.30, pose(src, LOW)],
    [0.40, pose(src, HIGH)],
    [0.54, pose(dst, HIGH)],
    [0.62, pose(dst, LOW)],
    [0.70, pose(dst, LOW)],
    [0.80, pose(dst, HIGH)],
    [1.00, pose(mid, HOME)],
  ]);
  ctx.setAll(j);
  ctx.set('joint6', Math.sin(t * 1.7) * 0.10);
  ctx.add('joint5', Math.sin(t * 1.1) * 0.05);

  const carrying = u >= GRASP_U && u < RELEASE_U;
  ctx.moveTo(AT.x, AT.z);
  ctx.face(YAW);
  ctx.tilt(0, 0);
  if (carrying) ctx.holdProp(); else ctx.dropProp(u < GRASP_U ? 'src' : 'dst');
}

/** bolted down, so it arrives by rising into place rather than walking on */
export function entrance(ctx, t) {
  body(ctx, t);
  ctx.rise(smooth(t / params.rise));
}
export function work(ctx, t) {
  body(ctx, t);
  ctx.rise(smooth(t / params.rise));
}

export const reactions = [
  {
    name: 'wave',
    duration: 1.4,
    update(ctx, t) {
      const on = Math.sin(Math.min(1, t * 1.2) * Math.PI);
      ctx.add('joint2', -0.55 * on);
      ctx.add('joint3', 0.45 * on);
      ctx.add('joint4', -0.25 * on);
      ctx.add('joint5', Math.sin(t * Math.PI * 6) * 0.55 * on);
      ctx.add('joint6', Math.sin(t * Math.PI * 6 + 1) * 0.35 * on);
    },
  },
  {
    name: 'lean',
    duration: 0.95,
    update(ctx, t) {
      const p = arc(t);
      ctx.add('joint1', 0.42 * p);
      ctx.add('joint2', 0.22 * p);
      ctx.add('joint4', -0.3 * p);
    },
  },
  {
    name: 'boing',
    duration: 0.70,
    update(ctx, t, v) {
      const p = Math.sin(t * Math.PI * 2.5) * (1 - t);
      ctx.nudge({ sclY: 1 + p * 0.2 * v, sclX: 1 - p * 0.13 * v });
    },
  },
];

export default { key: 'z1', params, roam, ground, period, entryEnd, entrance, work, reactions };
