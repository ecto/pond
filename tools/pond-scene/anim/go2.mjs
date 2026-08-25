/* Unitree Go2 — sentry patrol, on a real crawl gait.
   OWNED BY THE GO2 SPECIALIST. Everything this file imports is shared and must
   not be edited from here. See INTERFACE.md. */

import { legIK } from './kinematics.mjs';
import { plan, follow, clamp01, TAU, arc } from './schedule.mjs';

export const params = {
  L: 0.2130,          // both leg links, metres
  stand: 0.335,       // hip above foot, metres
  stance: 0.130,      // ground covered per stance, metres
  duty: 0.75,         // three feet down at a time: a crawl
  lift: 0.055,        // swing apex, metres
  speed: 0.30,        // stage units per second
  hold: 4.2,          // seconds parked at each waypoint
  entrySpeed: 0.42,
  scan: 0.30,         // trunk sweep amplitude while parked, radians
  vicinity: 1.30,     // pointer-attention radius, stage units
};
params.advance = params.stance / params.duty;   // metres per full gait cycle

/* crawl sequence: left-front, right-hind, right-front, left-hind */
const LEGS = [['FL', 0], ['RR', 0.25], ['FR', 0.5], ['RL', 0.75]];
const HIP = { FL: 0.04, RL: 0.04, FR: -0.04, RR: -0.04 };

/* waypoints, in the left band. Shallow and mostly in depth: the screen-x of a
   world point drifts with viewport aspect through its depth, so a deep patrol
   would make the horizontal composition move between viewports. */
const A = { x: -1.90, z: -0.64 }, B = { x: -1.74, z: -0.40 };
const C = { x: -1.88, z: -0.58 }, D = { x: -1.79, z: -0.46 };
const OFFSTAGE = { x: -3.60, z: -0.64 };

const sched = plan(
  [{ from: OFFSTAGE, to: A, speed: params.entrySpeed }, { hold: params.hold, at: A }],
  [
    { from: A, to: B }, { hold: params.hold, at: B },
    { from: B, to: C }, { hold: params.hold, at: C },
    { from: C, to: D }, { hold: params.hold, at: D },
    { from: D, to: A }, { hold: params.hold, at: A },
  ], params.speed);

/* Roam region. Shared code clamps ctx.moveTo() into this, so a waypoint moved
   outside it simply does not take effect. It is deliberately tight: the layout
   currently has almost no horizontal slack (see INTERFACE.md, "Moving a
   character"). Tune motion freely; relocating needs the composition owner. */
export const roam = {
  side: 'left',
  halfWidth: 0.80,            // widest horizontal half-extent, world units
  work: { x: [-1.90, -1.74], z: [-0.64, -0.40] },
  entry: { x: [-3.70, -1.74], z: [-0.64, -0.40] },
};
export const ground = ['FL_foot', 'FR_foot', 'RL_foot', 'RR_foot'];
export const period = sched.loop.dur;
export const entryEnd = sched.entry.dur;

/** the whole body: walking legs or a standing sentry, plus the trunk scan */
function body(ctx, t) {
  const p = follow(sched, t);
  const phi = (p.s * ctx.mps) / params.advance;   // gait phase, driven by distance

  for (const [leg, off] of LEGS) {
    let fx, fz;
    if (p.moving) {
      const q = (phi + off) % 1;
      if (q < params.duty) {                      // stance: the foot tracks the ground
        fx = params.stance * (0.5 - q / params.duty);
        fz = -params.stand;
      } else {                                    // swing: lift, carry forward, plant
        const b = (q - params.duty) / (1 - params.duty);
        fx = params.stance * (-0.5 + b);
        fz = -params.stand + params.lift * Math.sin(b * Math.PI);
      }
      fz += 0.006 * Math.sin(phi * TAU * 2);      // a little vertical life
    } else {
      // standing sentry: a slow weight rock, and one foot re-plants now and then
      const s = Math.sin(p.u * TAU);
      fx = (leg[0] === 'F' ? 0.012 : -0.012) + 0.010 * s;
      fz = -params.stand + (leg[1] === 'L' ? 1 : -1) * 0.006 * s;
      const stepAt = { FL: 0.30, RR: 0.62 }[leg];
      if (stepAt != null) {
        const b = (p.u - stepAt) / 0.10;
        if (b > 0 && b < 1) fz += params.lift * 0.8 * Math.sin(b * Math.PI);
      }
    }
    const ik = legIK(fx, fz, params.L, params.L, -1);
    ctx.set(leg + '_thigh_joint', ik.hip);
    ctx.set(leg + '_calf_joint', ik.knee);
    ctx.set(leg + '_hip_joint', HIP[leg]);
  }

  // the trunk is the neck here — the Go2 has no neck joint, so the scan has to
  // come from the body
  const scan = p.moving ? 0 : Math.sin(clamp01((p.u - 0.15) / 0.85) * TAU * 1.5 + 0.4) * params.scan;
  ctx.moveTo(p.x, p.z);
  ctx.face((p.heading || 0) + scan);
  ctx.tilt(p.moving ? -0.03 : -0.01, p.moving ? Math.sin(phi * TAU) * 0.025 : 0);
  ctx.noProp();
  return p;
}

export function entrance(ctx, t) { body(ctx, t); }
export function work(ctx, t) { body(ctx, t); }

export const reactions = [
  {
    name: 'playbow',
    duration: 1.25,
    update(ctx, t) {
      const p = arc(t);
      ctx.add('FL_thigh_joint', 0.95 * p); ctx.add('FR_thigh_joint', 0.95 * p);
      ctx.add('FL_calf_joint', -0.62 * p); ctx.add('FR_calf_joint', -0.62 * p);
      ctx.add('RL_thigh_joint', -0.30 * p); ctx.add('RR_thigh_joint', -0.30 * p);
      ctx.add('RL_calf_joint', 0.20 * p); ctx.add('RR_calf_joint', 0.20 * p);
      ctx.nudge({ rotZ: -arc(t) * 0.06 });
    },
  },
  {
    name: 'wag',
    duration: 0.9,
    update(ctx, t) {
      const s = Math.sin(t * Math.PI * 5) * (1 - t);
      ctx.add('RL_hip_joint', 0.16 * s); ctx.add('RR_hip_joint', 0.16 * s);
      ctx.add('FL_hip_joint', -0.12 * s); ctx.add('FR_hip_joint', -0.12 * s);
    },
  },
  {
    name: 'hop',
    duration: 0.62,
    update(ctx, t, v) {
      const s = Math.sin(t * Math.PI);
      ctx.nudge({ posY: s * 0.34 * v, sclY: 1 + s * 0.13, sclX: 1 - s * 0.08 });
    },
  },
  {
    name: 'shimmy',
    duration: 0.80,
    update(ctx, t, v) { ctx.nudge({ rotY: Math.sin(t * Math.PI * 6) * 0.34 * (1 - t) * v }); },
  },
];

export default { key: 'go2', params, roam, ground, period, entryEnd, entrance, work, reactions };
