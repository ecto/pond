/* SHARED — do not edit from a character module.

   Easing, keyframe tracks, and floor schedules.

   A schedule is a list of legs: walk between two waypoints, or hold at one.
   Distance is integrated along the path so a gait can be driven by how far the
   body has actually travelled rather than by wall-clock time — change a
   character's speed and its cadence changes, nothing else. The first pass runs
   an entrance that starts offstage; after that the loop repeats forever. */

export const TAU = Math.PI * 2;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
export const seg = (u, a, b) => smooth((u - a) / (b - a));
export const mix = (a, b, t) => a + (b - a) * t;
export const EASE = (t) => 1 - Math.pow(1 - t, 3);
/** a 0..1 rise-and-fall arc, front-loaded — the usual shape for a reaction */
export const arc = (t) => Math.sin(EASE(Math.min(1, t * 1.15)) * Math.PI);

export function lerpPose(A, B, t) {
  const o = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) o[k] = mix(A[k] || 0, B[k] || 0, t);
  return o;
}

/** keyframe track: [[u, pose], ...] with smooth-step between stamps */
export function track(u, keys) {
  if (u <= keys[0][0]) return { ...keys[0][1] };
  for (let i = 0; i < keys.length - 1; i++) {
    const [ua, A] = keys[i], [ub, B] = keys[i + 1];
    if (u <= ub) return ub === ua ? { ...B } : lerpPose(A, B, seg(u, ua, ub));
  }
  return { ...keys[keys.length - 1][1] };
}

/** build a two-phase schedule: an entrance run once, then a loop forever */
export function plan(entrance, loop, speed) {
  const build = (pts) => {
    const legs = [];
    let t = 0, s = 0, last = 0;
    for (const p of pts) {
      if (p.hold) {
        // a hold keeps facing whichever way the walk into it was going, unless
        // it names a facing of its own
        legs.push({ t0: t, t1: t + p.hold, s0: s, at: p.at, hold: true, yaw: p.yaw == null ? last : p.yaw });
        if (p.yaw != null) last = p.yaw;
        t += p.hold;
        continue;
      }
      const d = Math.hypot(p.to.x - p.from.x, p.to.z - p.from.z);
      const dur = d / (p.speed || speed);
      legs.push({ t0: t, t1: t + dur, s0: s, s1: s + d, from: p.from, to: p.to, hold: false });
      t += dur; s += d;
      last = Math.atan2(-(p.to.z - p.from.z), p.to.x - p.from.x);
    }
    return { legs, dur: t, dist: s };
  };
  return { entry: build(entrance), loop: build(loop) };
}

/**
 * Where the body is, and how far it has walked, at time t.
 * Returns { x, z, s, moving, u, heading } — `s` is cumulative distance (feed it
 * to a gait), `u` is progress within the current leg or hold, and `heading` is
 * a facing in the stage's convention (see below).
 *
 * Facing convention: the robots' own forward axis is URDF +x, which the Z-up
 * fix maps to stage +x. A Y rotation of `yaw` sends local +x to
 * (cos yaw, -sin yaw), so a heading toward (dx, dz) is atan2(-dz, dx).
 * Getting this wrong makes a character walk sideways, which the selftest's
 * foot-slip check catches.
 */
export function follow(sched, t) {
  let phase = sched.entry, tt = Math.max(0, t), base = 0;
  if (tt >= sched.entry.dur) {
    phase = sched.loop;
    const k = Math.floor((tt - sched.entry.dur) / sched.loop.dur);
    tt = (tt - sched.entry.dur) - k * sched.loop.dur;
    base = sched.entry.dist + k * sched.loop.dist;
  }
  const last = phase.legs[phase.legs.length - 1];
  for (const L of phase.legs) {
    if (tt > L.t1 && L !== last) continue;
    if (L.hold) {
      return { x: L.at.x, z: L.at.z, s: base + L.s0, moving: false, u: clamp01((tt - L.t0) / (L.t1 - L.t0)), heading: L.yaw };
    }
    const a = clamp01((tt - L.t0) / (L.t1 - L.t0));
    // ease only the very ends, so the middle of a leg runs at constant speed
    // and the gait stays locked to the ground
    const e = a < 0.12 ? smooth(a / 0.12) * 0.12 : a > 0.88 ? 1 - smooth((1 - a) / 0.12) * 0.12 : a;
    return {
      x: mix(L.from.x, L.to.x, e), z: mix(L.from.z, L.to.z, e),
      s: base + mix(L.s0, L.s1, e), moving: true, u: a,
      heading: Math.atan2(-(L.to.z - L.from.z), L.to.x - L.from.x),
    };
  }
  return { x: 0, z: 0, s: base, moving: false, u: 0 };
}
