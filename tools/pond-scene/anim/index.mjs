/* SHARED — do not edit from a character module.

   Assembles the four character modules into the animation layer the runtime
   and the offline tools consume. Character modules write through a context;
   this file builds that context, enforces the composition invariants on the
   way out, and hands back a plain state object.

   Adding a character: import it, add it to CHARACTERS, give it a roam box in
   its own module, and add its ground links. Nothing else here is per-character.

   The cast is a size gradient — Z1 0.51, Go2 0.46, K1 0.94, H2 1.83 — and the
   H2 is the host. ORDER is the payload order too, so changing it re-packs
   mesh-data.js. */

import h2 from './h2.mjs';
import k1 from './k1.mjs';
import go2 from './go2.mjs';
import z1 from './z1.mjs';
import { createContext, boundsExcursion } from './context.mjs';
import { legIK } from './kinematics.mjs';
import { NO_POINTER } from './pointer.mjs';

export const CHARACTERS = { h2, k1, go2, z1 };
export const ORDER = ['h2', 'k1', 'go2', 'z1'];

/**
 * Evaluate one character at time t.
 *   opts.mps            metres per stage unit (gaits are authored in the robot's units)
 *   opts.pointer        this character's pointer view (see pointer.mjs)
 *   opts.limits         joint name -> [lo, hi], for ctx.limit()
 *   opts.reducedMotion  true to neutralise the pointer overlay
 * Returns { j, place, lift, tilt, squash, rise, prop, nudge }.
 */
export function evaluate(key, t, opts = {}) {
  const def = CHARACTERS[key];
  const entering = t < def.entryEnd;
  const ctx = createContext(def, t, {
    mps: opts.mps,
    limits: opts.limits,
    entrance: entering,
    reducedMotion: opts.reducedMotion,
    pointer: opts.reducedMotion ? NO_POINTER : (opts.pointer || NO_POINTER),
  });
  (entering ? def.entrance : def.work)(ctx, t);
  return ctx._state;
}

/* legacy call shape: WORK[key](t, { mps }) */
export const WORK = Object.fromEntries(
  ORDER.map((k) => [k, (t, opts) => evaluate(k, t, opts || {})])
);

/* one full behaviour loop, used to sample swept extents and to pick the frozen
   reduced-motion pose */
export const PERIOD = Object.fromEntries(ORDER.map((k) => [k, CHARACTERS[k].period]));
/* how long each character's entrance runs before its loop takes over */
export const ENTRY_END = Object.fromEntries(ORDER.map((k) => [k, CHARACTERS[k].entryEnd]));
/* the roam box each character is clamped into */
export const ROAM = Object.fromEntries(ORDER.map((k) => [k, CHARACTERS[k].roam]));

/* Which link origins rest on the floor. The URDF root is the trunk, so bending
   the legs lifts the FEET rather than lowering the body; every frame the
   character is re-grounded by pushing it down until the lowest of these links
   is back on the deck. With locomotion this is the invariant, not a fix-up. */
export const GROUND = Object.fromEntries(ORDER.map((k) => [k, CHARACTERS[k].ground]));

/* ---------------- reactions ----------------
   A module authors a reaction as update(ctx, t, dir). The runtime wants joint
   deltas and a body nudge separately, so each one is wrapped here. Reactions
   are per character, so two specialists may both ship a "shimmy" without
   colliding. */
function wrapReaction(def, r) {
  const run = (t, v) => {
    const ctx = createContext(def, t, {});
    r.update(ctx, t, v === undefined ? 1 : v);
    return ctx._state;
  };
  return {
    name: r.name,
    dur: r.duration,
    joints: (t, v) => run(t, v).j,
    body: (o, t, v) => {
      const n = run(t, v).nudge;
      if (!n) return;
      o.rot.x = n.rotX; o.rot.y = n.rotY; o.rot.z = n.rotZ;
      o.pos.y = n.posY; o.scl.x = n.sclX; o.scl.y = n.sclY;
    },
  };
}

export const REACTIONS_BY_KEY = Object.fromEntries(
  ORDER.map((k) => [k, CHARACTERS[k].reactions.map((r) => wrapReaction(CHARACTERS[k], r))])
);
/** flat name -> reaction, for tools that do not care whose it is */
export const REACTIONS = {};
for (const k of ORDER) for (const r of REACTIONS_BY_KEY[k]) REACTIONS[r.name] = r;

/* ---------------- gait constants the selftest re-derives from the URDFs ---- */
const GAIT_LINKS = {
  go2: { hipLink: 'FL_thigh', footLink: 'FL_foot', hipJoint: 'FL_thigh_joint', kneeJoint: 'FL_calf_joint', kneeSign: -1 },
  h2: { hipLink: 'left_hip_yaw_link', footLink: 'left_ankle_pitch_link', hipJoint: 'left_hip_pitch_joint', kneeJoint: 'left_knee_joint', kneeSign: +1 },
  k1: { hipLink: 'Left_Hip_Yaw', footLink: 'left_foot_link', hipJoint: 'Left_Hip_Pitch', kneeJoint: 'Left_Knee_Pitch', kneeSign: +1 },
};
export const GAIT = {
  go2: { L1: go2.params.L, L2: go2.params.L, advance: go2.params.advance, stand: go2.params.stand, ...GAIT_LINKS.go2 },
  h2: { L1: h2.params.L1, L2: h2.params.L2, advance: h2.params.advance, stand: h2.params.stand, ...GAIT_LINKS.h2 },
  k1: { L1: k1.params.L1, L2: k1.params.L2, advance: k1.params.advance, stand: k1.params.stand, ...GAIT_LINKS.k1 },
};

export { legIK, boundsExcursion };
export { createPointerState, updatePointer, pointerFor, NO_POINTER } from './pointer.mjs';

/* Prop timing used to be exported per character, because each one owned its
   own prop. There is one cube now and the score owns it: see anim/world.mjs. */
export * as world from './world.mjs';
