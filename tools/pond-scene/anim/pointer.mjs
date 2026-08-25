/* SHARED — do not edit from a character module.

   Pointer awareness. The runtime keeps one passive listener set and hands the
   raw state here; this module turns it into the per-character `ctx.pointer`
   view. Nothing in here moves a robot — the character modules decide what to
   do with the numbers.

   The stage camera is level and unrotated (see stage.mjs), which makes the
   raycast three lines: the ray leaves (0, camY, dist) with unnormalised
   direction (ndcX*tanHalf*aspect, ndcY*tanHalf, -1). */

const TAN30 = Math.tan((30 * Math.PI) / 180 / 2);

/** neutral view handed to a character when there is no pointer (or motion is reduced) */
export const NO_POINTER = Object.freeze({
  present: false,
  isTouch: false,
  stagePos: null,
  atMyDepth: null,
  distance: Infinity,
  direction: Object.freeze({ x: 0, z: 0 }),
  speed: 0,
  dwellMs: 0,
  attention: 0,
});

/** raw pointer bookkeeping; the runtime owns one of these */
export function createPointerState() {
  return {
    active: false,          // a pointer has been seen and has not left the frame
    isTouch: false,
    ndcX: 0, ndcY: 0,       // -1..1, y up
    movedAt: 0,             // seconds
    floor: null,            // last floor hit, stage units
    prevFloor: null,
    speed: 0,               // stage units / second
    dwell: {},              // per character key: ms inside its vicinity
  };
}

/**
 * Re-project the pointer for this frame. Call once per frame, before posing.
 * `cam` is the object stage.cameraFor() returned.
 */
export function updatePointer(state, cam, now) {
  if (!state.active) { state.floor = null; state.prevFloor = null; state.speed = 0; return; }
  const aspect = cam.vw / cam.vh;
  const dir = { x: state.ndcX * TAN30 * aspect, y: state.ndcY * TAN30, z: -1 };
  // floor plane y = 0
  const floor = dir.y < 0 || dir.y > 0
    ? (() => {
      const k = cam.camY / -dir.y;           // dir.y < 0 looks down at the deck
      return k > 0 ? { x: dir.x * k, z: cam.dist + dir.z * k } : null;
    })()
    : null;
  const prev = state.floor;
  state.prevFloor = prev;
  state.floor = floor;
  if (floor && prev && state.lastAt) {
    const dt = Math.max(1e-3, now - state.lastAt);
    state.speed = Math.hypot(floor.x - prev.x, floor.z - prev.z) / dt;
  } else {
    state.speed = 0;
  }
  state.lastAt = now;
  state.cam = cam;
}

/**
 * The per-character view. `me` is { x, z, key, vicinity }.
 * `atMyDepth` is where the ray crosses the vertical plane through the
 * character's own depth — the useful target for "look at the cursor", where
 * the floor hit is the useful one for "walk toward it".
 */
export function pointerFor(state, me, now, dtMs) {
  if (!state || !state.active || !state.floor || !state.cam) {
    if (state && state.dwell) state.dwell[me.key] = 0;
    return NO_POINTER;
  }
  const cam = state.cam;
  const aspect = cam.vw / cam.vh;
  const dir = { x: state.ndcX * TAN30 * aspect, y: state.ndcY * TAN30, z: -1 };
  const k = cam.dist - me.z;                 // plane z = me.z, ray z decreases
  const atMyDepth = { x: dir.x * k, y: cam.camY + dir.y * k, z: me.z };

  const dx = state.floor.x - me.x, dz = state.floor.z - me.z;
  const distance = Math.hypot(dx, dz);
  const inv = distance > 1e-6 ? 1 / distance : 0;

  const vicinity = me.vicinity || 1;
  const dwellPrev = state.dwell[me.key] || 0;
  const dwell = distance <= vicinity ? dwellPrev + (dtMs || 0) : 0;
  state.dwell[me.key] = dwell;

  // The recommended blend weight: near and lingering reads as attention.
  // Modules are free to ignore it and use distance/dwell directly.
  const near = 1 - Math.min(1, distance / vicinity);
  const linger = Math.min(1, dwell / 260);
  return {
    present: true,
    isTouch: !!state.isTouch,
    stagePos: state.floor,
    atMyDepth,
    distance,
    direction: { x: dx * inv, z: dz * inv },
    speed: state.speed,
    dwellMs: dwell,
    attention: near * near * (0.35 + 0.65 * linger),
  };
}
