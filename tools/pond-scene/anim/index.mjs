/* SHARED — do not edit from a character module.

   Assembles the four character modules into the animation layer the runtime
   and the offline tools consume. Character modules write through a context;
   this file builds that context, enforces the composition invariants on the
   way out, and hands back a plain state object.

   Adding a character: import it, add it to CHARACTERS, give it a roam box in
   its own module, and add its ground links. Nothing else here is per-character. */

import pondbot from './pondbot.mjs';
import go2 from './go2.mjs';
import t1 from './t1.mjs';
import z1 from './z1.mjs';
import { createContext, boundsExcursion } from './context.mjs';
import { legIK } from './kinematics.mjs';
import { NO_POINTER } from './pointer.mjs';

export const CHARACTERS = { pondbot, go2, t1, z1 };
export const ORDER = ['pondbot', 'go2', 't1', 'z1'];

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
  t1: { hipLink: 'Hip_Pitch_Left', footLink: 'left_foot_link', hipJoint: 'Left_Hip_Pitch', kneeJoint: 'Left_Knee_Pitch', kneeSign: +1 },
};
export const GAIT = {
  go2: { L1: go2.params.L, L2: go2.params.L, advance: go2.params.advance, stand: go2.params.stand, ...GAIT_LINKS.go2 },
  t1: { L1: t1.params.L1, L2: t1.params.L2, advance: t1.params.advance, stand: t1.params.stand, ...GAIT_LINKS.t1 },
};

export { legIK, boundsExcursion };
export { createPointerState, updatePointer, pointerFor, NO_POINTER } from './pointer.mjs';

/* prop timing a couple of tools need in order to freeze parked props */
export { GRASP_U as Z1_GRASP_U, RELEASE_U as Z1_RELEASE_U } from './z1.mjs';
export { RELEASE_U as T1_RELEASE_U, REGRASP_U as T1_REGRASP_U } from './t1.mjs';
