/* pond-bot — the host. No joints of its own, so its work is social and its
   locomotion is ballistic.
   OWNED BY THE POND-BOT SPECIALIST. Everything this file imports is shared and
   must not be edited from here. See INTERFACE.md. */

import { clamp01, smooth, mix, TAU } from './schedule.mjs';

export const params = {
  hop: 0.62,        // flight time, seconds
  settle: 2.6,      // between hops, seconds
  arc: 0.14,        // apex, stage units
  vicinity: 1.10,   // pointer-attention radius, stage units
};
const CYCLE = params.hop + params.settle;

/* Well downstage of the Go2, so the two left-hand characters separate
   vertically on screen instead of stacking on the same floor line, and clear
   of the Z1's reach on the right. */
const SPOTS = [
  { x: -1.42, z: 0.68 }, { x: -1.30, z: 0.80 },
  { x: -1.36, z: 0.66 }, { x: -1.33, z: 0.78 },
];
/* who it turns to watch at each spot */
const WATCH = [1.15, 0.72, 1.58, 0.95];
const OFFSTAGE = { x: -1.40, z: 2.40 };

/* Roam region — see INTERFACE.md, "Moving a character". */
export const roam = {
  side: 'left',
  halfWidth: 0.46,
  work: { x: [-1.42, -1.30], z: [0.66, 0.80] },
  entry: { x: [-1.42, -1.30], z: [0.66, 2.40] },
};
export const ground = [];              // it leaves the floor, so nothing is pinned
export const period = CYCLE * SPOTS.length;
export const entryEnd = CYCLE;

function body(ctx, t) {
  const n = SPOTS.length;
  let i, u, from, to;
  if (t < CYCLE) {
    i = 0; u = clamp01(t / CYCLE); from = OFFSTAGE; to = SPOTS[0];
  } else {
    const k = Math.floor((t - CYCLE) / CYCLE);
    u = ((t - CYCLE) % CYCLE) / CYCLE;
    i = (k + 1) % n;
    from = SPOTS[k % n];
    to = SPOTS[i];
  }
  const flyFrac = params.hop / CYCLE;
  const fly = clamp01(u / flyFrac);
  const air = Math.sin(fly * Math.PI);
  const e = smooth(fly);
  const settled = clamp01((u - flyFrac) / (1 - flyFrac));
  const watch = Math.sin(t * 1.25);

  ctx.moveTo(mix(from.x, to.x, e), mix(from.z, to.z, e));
  ctx.face(mix(WATCH[(i + n - 1) % n], WATCH[i], e) + watch * 0.07);
  ctx.lift(air * params.arc);
  // leans into the hop, levels out on landing
  ctx.tilt(-air * 0.16 + watch * 0.02, Math.sin(t * 0.8) * 0.03);
  // squashes at takeoff, stretches at apex, absorbs the landing
  ctx.squash(1 + air * 0.09 - Math.max(0, Math.sin(fly * Math.PI * 2)) * 0.05
    - Math.exp(-settled * 14) * 0.07);
  ctx.noProp();
}

export function entrance(ctx, t) { body(ctx, t); }
export function work(ctx, t) { body(ctx, t); }

export const reactions = [
  {
    name: 'flip',
    duration: 1.0,
    update(ctx, t, v) { ctx.nudge({ rotX: t * TAU, posY: Math.sin(t * Math.PI) * 0.55 * v }); },
  },
  {
    name: 'boing',
    duration: 0.70,
    update(ctx, t, v) {
      const p = Math.sin(t * Math.PI * 2.5) * (1 - t);
      ctx.nudge({ sclY: 1 + p * 0.2 * v, sclX: 1 - p * 0.13 * v });
    },
  },
  {
    name: 'shimmy',
    duration: 0.80,
    update(ctx, t, v) { ctx.nudge({ rotY: Math.sin(t * Math.PI * 6) * 0.34 * (1 - t) * v }); },
  },
  {
    name: 'hop',
    duration: 0.62,
    update(ctx, t, v) {
      const s = Math.sin(t * Math.PI);
      ctx.nudge({ posY: s * 0.34 * v, sclY: 1 + s * 0.13, sclX: 1 - s * 0.08 });
    },
  },
];

export default { key: 'pondbot', params, roam, ground, period, entryEnd, entrance, work, reactions };
