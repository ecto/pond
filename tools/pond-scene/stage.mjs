/* The stage: one floor, one camera, four characters that walk around on it.
   Shared by the browser runtime (scene.js) and the offline stage preview
   (preview.js) so the framing you check offline is the framing that ships. */

export const FOV = 30;
const TAN_HALF = Math.tan((FOV * Math.PI) / 180 / 2);

/* On-screen height of each character, in stage units. These carry the sizing
   the landing page already had (the old per-character `px` heights, over a
   300px reference) — the cast reads at roughly equal size regardless of the
   robots' true scale, which is what makes the composition work. */
/* pond-bot and the Z1 are much WIDER than they are tall, so matching everyone
   on height alone gives them far too much visual mass on a shared stage; both
   are trimmed until the four silhouettes balance. */
export const HEIGHT = { pondbot: 0.52, go2: 0.92, t1: 1.07, z1: 0.62 };

/* Framing.

   The camera is LEVEL — no tilt — sitting camY above a floor at y=0 and looking
   down -Z. That puts the horizon exactly at screen centre, so a character
   further back stands higher up the frame and the ground reads as receding
   without any of the keystoning a tilted camera would introduce.

   The floor under the stage centre lands FLOOR_FRAC up from the bottom edge,
   and the design framing shows VH_BASE stage units of height. At narrow
   (portrait-ish) viewports the stage's own width takes over and the camera
   pulls back, so nothing is ever cropped sideways.

   X_MAX / Z_MAX are the swept world extents of the whole cast over its full
   behaviour loops, geometry and props included. They are produced by
   `node preview.js solve` and verified by `node preview.js extents`; the
   runtime just applies them, so it needs no kinematics at load time. */
export const VH_BASE = 3.05;
export const FLOOR_FRAC = 0.30;
export const MARGIN_FRAC = 0.025;   // clear margin required, as a fraction of the viewport
export const X_MAX = 1.930;
export const Z_MAX = 0.906;

/**
 * Solve the camera for a viewport aspect.
 *
 * A swept point (x, z) lands at screen fraction
 *   sx = 0.5 + x / ((vh - 2*z*tanHalf) * aspect)
 * so keeping the whole cast inside [m, 1-m] needs
 *   vh >= X_MAX / ((0.5-m)*aspect) + 2*Z_MAX*tanHalf.
 */
export function cameraFor(aspect) {
  const need = X_MAX / ((0.5 - MARGIN_FRAC) * aspect) + 2 * Z_MAX * TAN_HALF;
  const vh = Math.max(VH_BASE, need);
  return {
    vh,
    vw: vh * aspect,
    dist: vh / (2 * TAN_HALF),
    camY: (0.5 - FLOOR_FRAC) * vh,
    fov: FOV,
  };
}

/**
 * Project a stage point to normalised screen coordinates (0..1 from the
 * top-left), for the swept-extent checks. Mirrors the level camera above.
 */
export function project(p, cam) {
  const d = cam.dist - p.z;
  const half = d * TAN_HALF;
  return {
    x: 0.5 + p.x / (2 * half * (cam.vw / cam.vh)),
    y: 0.5 - (p.y - cam.camY) / (2 * half),
    d,
  };
}
