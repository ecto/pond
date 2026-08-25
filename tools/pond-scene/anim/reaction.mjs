/* SHARED — do not edit from a character module.

   The reaction lifecycle: when a click-triggered reaction starts, what `t` its
   module sees on each frame, and when it is handed back.

   This lives in its own file so the runtime and the selftest can exercise the
   SAME code. It used to be three lines inlined in scene.js, and it carried a
   bug that no offline tool could see:

     onClick stamped  start = performance.now() / 1000        (absolute)
     the frame loop   render(performance.now() / 1000 - t0)   (scene-relative)

   and then subtracted one from the other. The module was therefore evaluated at
   t ~= -t0 — a large NEGATIVE number, growing with however long the page had
   been alive before the scene booted (and with every Mintlify client-side
   navigation, since performance.now() keeps counting). Two things followed:

     * `t >= 1` never became true, so the reaction never expired; and
     * the module was called far outside its documented 0..1 domain, where its
       curves are not defined. pond-bot's `shimmy` has an envelope of
       (1 - t)^1.6, which at t = -35 is ~570x, so it produced a body scale of
       -10 — a NEGATIVE Y scale, which mirrors the mesh. That is the frog that
       ended up resting on its back, permanently, until the page was reloaded.

   The contract in INTERFACE.md is "a reaction's `t` is normalised 0..1 across
   its own `duration`". `phaseOf` makes that true by construction rather than
   by everyone remembering, so a module is never asked for a pose outside the
   window it was authored for. */

/** One clock for the whole scene: seconds since the scene started. Both the
    frame loop and the click handler must read time from here. */
export function makeClock(nowMs) {
  const t0 = (nowMs === undefined ? performance.now() : nowMs) / 1000;
  return () => performance.now() / 1000 - t0;
}

/** Begin a reaction. `now` MUST come from the scene clock above. */
export function beginReaction(list, now, rnd = Math.random) {
  if (!list || !list.length) return null;
  return {
    R: list[(rnd() * list.length) | 0],
    start: now,
    // each play is a little faster or slower, so repeats do not read as a loop
    vary: 0.82 + rnd() * 0.36,
    dir: rnd() < 0.5 ? -1 : 1,
  };
}

/** Where a running reaction is, as a fraction of its own (varied) duration.
    Clamped at the bottom so a module is never evaluated before its own start;
    left free above 1 so the caller can detect expiry. */
export function phaseOf(react, now) {
  const u = (now - react.start) / (react.R.dur * react.vary);
  return u > 0 ? u : 0;
}

/** True once the reaction has run its course and should be handed back. */
export function isExpired(react, now) {
  return phaseOf(react, now) >= 1;
}

/** The per-frame body channel, seeded from the work loop and then overlaid by
    a running reaction. Exactly what scene.js writes into its nodes.
      body.rot.y is ADDED to the character's heading;
      rot.x / rot.z / pos.y / scl REPLACE the work loop's tilt and squash. */
export function bodyChannel(work, react, now, out) {
  const tl = work.tilt || {};
  const b = out || { rot: { x: 0, y: 0, z: 0 }, pos: { y: 0 }, scl: { x: 1, y: 1 } };
  b.rot.x = tl.pitch || 0;
  b.rot.y = 0;
  b.rot.z = tl.roll || 0;
  b.pos.y = 0;
  b.scl.x = 1;
  b.scl.y = work.squash || 1;
  if (react && react.R.body) {
    const u = phaseOf(react, now);
    if (u < 1) react.R.body(b, u, react.dir);
  }
  return b;
}
