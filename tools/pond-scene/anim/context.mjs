/* SHARED — do not edit from a character module.

   The authoring context. A character module never returns a state object; it
   writes through this, and shared code assembles the result and enforces the
   composition invariants on the way out.

   The point of the indirection: a specialist tuning one robot physically
   cannot break the page layout, because the clamps live out here. */

import { NO_POINTER } from './pointer.mjs';


const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createContext(def, t, opts = {}) {
  const box = opts.entrance ? (def.roam.entry || def.roam.work) : def.roam.work;
  const state = {
    j: {},
    place: { x: 0, z: 0, yaw: 0 },
    lift: 0,
    tilt: { pitch: 0, roll: 0 },
    squash: 1,
    rise: undefined,
    prop: null,
    nudge: null,
  };

  const ctx = {
    /* ---- read-only ---- */
    t,
    key: def.key,
    params: def.params,
    /** metres per stage unit, so gaits can be authored in the robot's own units */
    mps: opts.mps == null ? 1 : opts.mps,
    /** true while the entrance is running */
    entering: !!opts.entrance,
    /** true when the viewer asked for reduced motion; pointer is already neutered */
    reducedMotion: !!opts.reducedMotion,
    pointer: opts.pointer || NO_POINTER,
    /** the box this character is allowed to stand in, for reference */
    bounds: box,

    /* ---- joints, in radians ---- */
    set(name, rad) { state.j[name] = rad; return ctx; },
    add(name, rad) { state.j[name] = (state.j[name] || 0) + rad; return ctx; },
    setAll(pose) { Object.assign(state.j, pose); return ctx; },
    get(name) { return state.j[name] || 0; },
    /** the URDF limit pair for a joint, or null if the payload had none */
    limit(name) { return (opts.limits && opts.limits[name]) || null; },

    /* ---- placement on the floor ----
       Clamped into this character's roam region. The region is declared as a
       SCREEN-X band plus a depth range, not a world box: the safe area is a
       diagonal wedge in world space (moving downstage magnifies a character,
       so it has to move inward to stay in its band), and solving in screen
       space makes the region aspect-independent. A specialist can therefore
       put a waypoint anywhere in the band and the composition still holds. */
    moveTo(x, z) {
      const zc = clampTo(z, box.z[0], box.z[1]);
      const [lo, hi] = box.x;
      state.place.x = clampTo(x, lo, hi);
      state.place.z = zc;
      return ctx;
    },
    face(yaw) { state.place.yaw = yaw; return ctx; },
    /** stage units off the deck — the ONLY thing that may leave the floor */
    lift(v) { state.lift = v; return ctx; },
    tilt(pitch, roll) { state.tilt.pitch = pitch; state.tilt.roll = roll; return ctx; },
    squash(s) { state.squash = s; return ctx; },
    /** 0..1 arrival scale, for characters that rise into place instead of walking on */
    rise(v) { state.rise = v; return ctx; },

    /* ---- props ---- */
    holdProp() { state.prop = { held: true }; return ctx; },
    dropProp(park) { state.prop = park === undefined ? { held: false } : { held: false, park }; return ctx; },
    noProp() { state.prop = null; return ctx; },

    /* ---- reaction channel: a whole-body nudge layered over the work pose ---- */
    nudge(o) {
      state.nudge = Object.assign(state.nudge || { rotX: 0, rotY: 0, rotZ: 0, posY: 0, sclX: 1, sclY: 1 }, o);
      return ctx;
    },

    _state: state,
  };
  return ctx;
}

/** how far outside its region a character tried to stand, for diagnostics */
export function boundsExcursion(def, place, entrance) {
  const box = entrance ? (def.roam.entry || def.roam.work) : def.roam.work;
  const [lo, hi] = box.x || feasibleX(def.key, def.roam.side, def.roam.halfWidth, place.z);
  return Math.max(lo - place.x, place.x - hi, box.z[0] - place.z, place.z - box.z[1], 0);
}
