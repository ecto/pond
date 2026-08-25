/* pond-bot — the host.

   One rigid body: no joints, no limbs, nothing to articulate. Every ounce of
   performance therefore lives in the placement channels — where it stands,
   which way it looks, how it loads, leaves the ground, and lands. The whole
   character is built out of four verbs: face, lift, tilt, squash.

   The plan of attack, in animation terms:

     * a hop is three acts, not one curve — LOAD (crouch, ~0.2s), FLIGHT (a
       true ballistic parabola with the horizontal at constant speed), and
       LANDING (impact compression, two decaying rebounds, a settle).
     * turning happens in the air, where a real hopper can turn: the yaw runs
       on a damped-spring step that takes off just after the feet leave and
       overshoots into the landing.
     * between hops the body is never still — a slow breath, a weight shift,
       and scheduled glances at whichever coworker is worth watching.
     * nothing repeats on the same interval; every dwell is authored to a
       different length so the loop never reads as a metronome.

   OWNED BY THE POND-BOT SPECIALIST. Everything this file imports is shared and
   must not be edited from here. See INTERFACE.md. */

import { clamp01, smooth, mix, TAU } from './schedule.mjs';

export const params = {
  arc: 0.20,        // nominal hop apex, stage units (the body is 0.44 tall)
  stretch: 0.20,    // how much the body stretches at take-off and touchdown
  crouch: 0.21,     // how deep the anticipation compresses it
  vicinity: 1.55,   // pointer-attention radius, stage units
  pursuit: 0.92,    // how far it commits to turning toward a dwelling pointer
};

/* ---------------------------------------------------------------- easing --
   Deliberately a small vocabulary of curves with different weights, so that
   nothing in the performance is eased the same way as the thing next to it. */

const easeInQuad = (u) => u * u;
const easeOutCubic = (u) => 1 - (1 - u) ** 3;
/** 0 at both ends, 1 in the middle — one beat of something, in and out */
const bell = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI) ** 2);
/** unit step response of a damped spring: 0 at s<=0, one overshoot, settles at 1 */
const spring = (s, w, z) => {
  if (s <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s));
};
/** a decaying ring: +1 at s=0, alternating, gone by ~4/k. Impacts live here. */
const ring = (s, w, k) => (s <= 0 ? 0 : Math.exp(-k * s) * Math.cos(w * s));
/** shortest way round the circle */
const wrapPi = (a) => a - TAU * Math.round(a / TAU);

/* ---------------------------------------------------- where it looks ------
   Standard heading, same as the other three: INTERFACE.md's atan2(-dz, dx).

   This used to be atan2(dx, dz) — "the pond-bot mesh faces stage +z, a quarter
   turn off the URDF forward". That quarter turn was not a property of the
   model, it was the symptom of a broken base transform: the GLB was being
   imported as Y-up when it is a Z-up CAD export, which laid the frog on its
   back AND left its forward axis a quarter turn out. build.js now bakes the
   frame straight, so the special case is gone and every character in the cast
   uses one heading rule. Everything below is derived, so moving a coworker
   moves the gaze. */
const heading = (dx, dz) => Math.atan2(-dz, dx);

const HOME = { x: -1.36, z: 0.73 };
/* the rest of the cast, plus the camera and a patch of open water downstage */
const CAST = {
  camera: { x: 0.00, z: 7.60 },     // the visitor
  z1: { x: 1.66, z: 0.60 },         // the arm, at the same depth, far right
  t1: { x: 1.67, z: -0.37 },        // the humanoid, upstage right
  go2: { x: -1.82, z: -0.52 },      // the dog, upstage left — a near half turn
  water: { x: -2.40, z: 1.80 },     // nothing in particular, downstage left
};
const LOOK = {};
for (const k of Object.keys(CAST)) LOOK[k] = heading(CAST[k].x - HOME.x, CAST[k].z - HOME.z);

/* Standing spots, all inside the roam box. The box is 0.12 x 0.14 stage units
   — see INTERFACE.md, "Moving a character" — so travel is nearly a detail and
   the hop has to be sold vertically. It still matters: a hop that lands on the
   exact millimetre it left from reads as a bounce, not a hop. */
const SPOT = {
  a: { x: -1.38, z: 0.70 },
  b: { x: -1.31, z: 0.67 },
  c: { x: -1.41, z: 0.715 },
  d: { x: -1.34, z: 0.725 },
  e: { x: -1.42, z: 0.66 },
};

/* Roam region — see INTERFACE.md, "Moving a character". Unchanged: the
   composition owns these numbers, this file owns the motion inside them. */
export const roam = {
  side: 'left',
  halfWidth: 0.46,
  work: { x: [-1.42, -1.30], z: [0.66, 0.80] },
  entry: { x: [-1.42, -1.30], z: [0.66, 2.40] },
};
export const ground = [];              // it leaves the floor, so nothing is pinned

/* ------------------------------------------------------------- the score --
   A beat is one hop and the pause that follows it: load, flight, dwell. Every
   dwell is a different length and no two flights match, which is what keeps
   the loop from ticking. `look` is what it turns to watch on the way down;
   `glances` are the small re-orients it makes while parked, in seconds after
   touchdown, as [when, how far, how long]. */
const BEATS = [
  // it starts parked at 'a' facing the visitor, where the entrance left it
  { to: 'b', look: 'z1', load: 0.17, fly: 0.44, arc: 0.78, dwell: 1.90,
    glances: [[1.05, -0.20, 0.60]] },
  { to: 'c', look: 't1', load: 0.22, fly: 0.58, arc: 1.30, dwell: 2.40,
    glances: [[0.85, 0.16, 0.55], [1.80, -0.11, 0.45]] },
  { to: 'd', look: 'camera', load: 0.19, fly: 0.47, arc: 0.90, dwell: 3.00,
    glances: [[1.20, 0.22, 0.70], [2.30, -0.13, 0.50]] },
  { to: 'e', look: 'go2', load: 0.16, fly: 0.42, arc: 0.72, dwell: 1.40,
    glances: [] },
  { to: 'c', look: 'water', load: 0.20, fly: 0.50, arc: 0.95, dwell: 1.70,
    glances: [[0.75, 0.18, 0.55]] },
  { to: 'a', look: 'camera', load: 0.23, fly: 0.60, arc: 1.35, dwell: 2.90,
    glances: [[1.45, -0.24, 0.75]] },
];

/** turn a list of beats into hop records with absolute times and headings */
function route(beats, start, startYaw) {
  const hops = [];
  let t = 0, from = start, yaw = startYaw;
  for (const b of beats) {
    const to = b.at || SPOT[b.to];
    const yaw1 = b.yaw != null ? b.yaw : LOOK[b.look];
    hops.push({
      t0: t, t1: t + b.load + b.fly + b.dwell,
      A: b.load, F: b.fly, D: b.dwell,
      from, to, yaw0: yaw, yaw1,
      h: params.arc * b.arc,
      /* the bigger the hop, the harder it loads and the harder it lands */
      pow: Math.min(1.35, 0.72 + 0.55 * b.arc),
      glances: b.glances || [],
    });
    t += b.load + b.fly + b.dwell;
    from = to; yaw = yaw1;
  }
  return { hops, dur: t };
}

const LOOP = route(BEATS, SPOT.a, LOOK.camera);

/* ------------------------------------------------------------- entrance --
   Exuberant arrival: two quick eager hops in from below the frame, then a
   bigger one that carries it home, spinning past the camera and settling back.
   It travels straight upstage, so it holds a three-quarter facing on the way
   in rather than showing the viewer its back for three seconds. */
const OFFSTAGE = { x: -1.33, z: 2.36 };
const ENTRY = route([
  { at: { x: -1.38, z: 1.80 }, yaw: 1.05 - Math.PI / 2, load: 0.18, fly: 0.44, arc: 0.80, dwell: 0.30 },
  { at: { x: -1.31, z: 1.22 }, yaw: 0.72 - Math.PI / 2, load: 0.14, fly: 0.46, arc: 0.92, dwell: 0.26 },
  // the big one: lands home, overshoots the turn, then settles onto the visitor
  { at: SPOT.a, yaw: LOOK.camera, load: 0.28, fly: 0.66, arc: 1.70, dwell: 1.05,
    glances: [[0.02, -0.34, 0.62]] },
], OFFSTAGE, 1.30);

export const period = LOOP.dur;
export const entryEnd = ENTRY.dur;

/* -------------------------------------------------------------- posing ---
   Idle life runs on absolute time at frequencies that divide the loop, so it
   is continuous across the loop wrap and across the entrance handover. */
const K = TAU / LOOP.dur;
const HARM = (sec) => Math.max(1, Math.round(LOOP.dur / sec)) * K;
const W_BREATH = HARM(2.9), W_SWAY = HARM(4.3), W_TICK = HARM(1.7);

/** the two small rebounds after a landing, in stage units */
function rebound(d, h) {
  if (d < 0) return 0;
  if (d < 0.19) { const u = d / 0.19; return 4 * (h * 0.115) * u * (1 - u); }
  if (d < 0.30) { const u = (d - 0.19) / 0.11; return 4 * (h * 0.032) * u * (1 - u); }
  return 0;
}

/**
 * One hop, from the load through the settle, written into ctx.
 * Returns how much of the body's weight is off the ground (0..1) so the
 * pointer overlay knows not to fight a body that is mid-air.
 */
function poseRoute(ctx, R, s, t) {
  const H = R.hops;
  let i = H.length - 1;
  for (let k = 0; k < H.length; k++) if (s < H[k].t1) { i = k; break; }
  const h = H[i];
  const sl = s - h.t0;
  const load = clamp01(sl / h.A);                   // 0..1 through the crouch
  const u = clamp01((sl - h.A) / h.F);              // 0..1 through the flight
  const d = sl - h.A - h.F;                         // seconds since touchdown
  const airborne = sl >= h.A && d < 0;

  /* ---- travel: the load drifts a hair backwards, the flight is linear.
     Constant horizontal speed is what makes an arc read as ballistic; easing
     the position (as a smoothstep would) reads as a slide. */
  let k = 0;
  if (airborne) k = u;
  else if (d >= 0) k = 1;
  else k = -0.06 * bell(load);                      // anticipation pulls back
  const px = mix(h.from.x, h.to.x, k);
  const pz = mix(h.from.z, h.to.z, k);

  /* ---- height: a true parabola in the air, two small rebounds after */
  const lift = airborne ? 4 * h.h * u * (1 - u) : rebound(d, h.h);
  const air = clamp01(lift / Math.max(1e-4, h.h * 0.35));

  /* ---- squash: load down, snap out through take-off, ride the arc stretched
     at the fast ends, then take the impact and ring it out. The load-to-flight
     handover is a fast ramp rather than a cut so the extension has an edge to
     it without popping between frames. */
  const S = params.stretch * h.pow;
  const lo = 1 - params.crouch * h.pow * smooth(clamp01(load * 1.3));
  let q;
  if (d >= 0) {
    // it is still stretched when it touches, so the ring starts positive and
    // the first thing it does is drive the body hard into the deck
    q = 1 + S * ring(d, 21, 4.8) * Math.exp(-d * 1.2);
  } else if (airborne) {
    const v = Math.abs(1 - 2 * u);                  // 1 at the ends, 0 at apex
    const flight = 1 + S * v ** 1.5 + 0.035 * (1 - v);
    q = mix(lo, flight, clamp01(u / 0.12));
  } else {
    q = lo;
  }

  /* ---- facing: the turn is a damped spring that fires just after the feet
     leave the ground, overshoots on the way down and settles in the dwell —
     a hopper cannot pivot while planted, so it does it in the air. */
  const swing = wrapPi(h.yaw1 - h.yaw0);
  let yaw = h.yaw0 + swing * spring(sl - h.A - 0.10 * h.F, 8.6, 0.40);
  yaw -= swing * 0.06 * bell(load);                 // winds up against the turn
  for (const [at, amt, dur] of h.glances) yaw += amt * bell((d - at) / dur);

  /* ---- lean: rocks back into the load, noses up leaving the ground and down
     into the landing, banks into the turn, then rings the impact out. */
  let pitch = 0;
  if (d >= 0) pitch = 0.15 * h.pow * ring(d, 10.5, 5.2);
  else if (airborne) pitch = 0.20 * h.pow * (u - 0.34);
  else pitch = -0.07 * h.pow * easeInQuad(load);
  let roll = -0.10 * Math.max(-1, Math.min(1, swing)) * (airborne ? Math.sin(u * Math.PI) : 0);
  if (d >= 0) roll += 0.04 * ring(d, 8.0, 4.0) * Math.sign(swing || 1);

  /* ---- living stillness: a breath, a slow weight shift and a hint of drift
     underfoot, all cut while the body is off the ground, where there is no
     weight to shift. The three periods are mutual non-multiples, so the idle
     never lands on the same pose twice inside one loop. */
  const grounded = 1 - air;
  q += 0.026 * Math.sin(W_BREATH * t + 0.4) * grounded;
  roll += (0.042 * Math.sin(W_SWAY * t) + 0.018 * Math.sin(W_TICK * t + 1.9)) * grounded;
  pitch += 0.020 * Math.sin(W_BREATH * t + 1.7) * grounded;
  yaw += (0.045 * Math.sin(W_SWAY * t + 2.4) + 0.016 * Math.sin(W_TICK * t + 0.6)) * grounded;
  const shift = 0.007 * Math.sin(W_SWAY * t + 1.2) * grounded;

  /* A lean pivots the whole body about its floor point, and with nothing in
     `ground` there is no re-grounding to catch it — so a tilted body digs its
     low corner into the deck. Ride up by roughly the sagitta of the lean and
     it pivots on its feet instead of through them. */
  const perch = 0.32 * (Math.abs(pitch) + Math.abs(roll));

  ctx.moveTo(px + shift, pz + shift * 0.6);
  ctx.face(yaw);
  ctx.lift(lift + perch);
  ctx.tilt(pitch, roll);
  ctx.squash(q);
  ctx.noProp();
  return { air, px: px + shift, pz: pz + shift * 0.6, yaw, pitch, roll, q, lift: lift + perch };
}

/* ------------------------------------------------------- pointer overlay --
   The host greets whoever turns up. Layered on top of the work pose exactly
   the way INTERFACE.md §6 asks: blend toward the pointer by a weight, never
   overwrite. Under reduced motion shared code hands us NO_POINTER and the
   whole block switches itself off.

   Three things make it read as a creature choosing to look rather than a
   servo tracking a target:
     * it commits gradually (attention), and commits less to a pointer that is
       moving fast — you cannot follow a whipping cursor, and the resulting
       trail is the lag.
     * dwell time drives a small transient overshoot, so the first look lands
       slightly past the pointer and eases back.
     * a pointer that turns up far to one side gets an eager hop-adjust: one
       bump, fired by a window on dwell time rather than by a stopwatch, so it
       happens once per arrival. */
function greet(ctx, base) {
  const p = ctx.pointer;
  if (!p.present || !p.stagePos) return;

  const settle = clamp01(p.dwellMs / 380);
  const chase = mix(1, 0.42, clamp01(p.speed / 2.6));       // fast pointer, loose follow
  const w = clamp01(p.attention * 1.2) * params.pursuit * chase;
  if (w < 1e-3) return;

  const want = heading(p.stagePos.x - base.px, p.stagePos.z - base.pz);
  // wrap ONCE, here: the shortest way round is a property of where the pointer
  // is, not of the overshoot. Wrapping after scaling would let a big turn plus
  // its overshoot cross pi and snap the head the other way.
  const delta = wrapPi(want - base.yaw);
  const over = 1 + 0.13 * bell(settle);          // the first look lands slightly past
  ctx.face(base.yaw + delta * over * w);

  // leans in, and tips its face up toward a pointer held high in the frame
  const high = p.atMyDepth ? clamp01((p.atMyDepth.y - 0.25) / 1.4) : 0;
  const pitch = base.pitch - (0.09 + 0.10 * high) * w;
  const roll = base.roll + 0.025 * Math.max(-1, Math.min(1, delta)) * w;
  ctx.tilt(pitch, roll);
  // keep the same pivot-on-its-feet correction the work loop applies
  const perch = 0.32 * (Math.abs(pitch) + Math.abs(roll)) - 0.32 * (Math.abs(base.pitch) + Math.abs(base.roll));

  /* the eager little hop-adjust: only when the pointer arrived well off to one
     side, only while the body is actually on the ground, once per arrival */
  const wide = clamp01((Math.abs(delta) - 0.75) / 0.85);
  const bump = wide * bell(clamp01((p.dwellMs - 220) / 340)) * (1 - base.air) * clamp01(p.attention * 1.4);
  ctx.lift(base.lift + perch + 0.070 * bump);
  ctx.squash(base.q * (1 + 0.13 * bump + 0.022 * w));       // perks up, attentive
}

export function entrance(ctx, t) {
  poseRoute(ctx, ENTRY, Math.min(t, ENTRY.dur - 1e-4), t);
}

export function work(ctx, t) {
  const s = (t - entryEnd) % LOOP.dur;
  const base = poseRoute(ctx, LOOP, s < 0 ? s + LOOP.dur : s, t);
  greet(ctx, base);
}

/* ------------------------------------------------------------ reactions --
   The runtime hands the nudge straight into the body node, and it REPLACES the
   work loop's tilt and squash for the duration (see index.mjs wrapReaction), so
   each of these has to carry its own weight from neutral and return to neutral.
   `v` is +-1 so a reaction can be mirrored; the runtime also scales each
   duration by 0.82..1.18, so nothing here depends on an exact clock.

   Every one of them is on a squash-and-stretch spine: load, go, land, settle.
   None of them is linear, and every one starts and ends on exactly neutral —
   the runtime drops the nudge the instant a reaction expires, so any residual
   lean or scale left at t=1 would snap back in a single frame. (A whole extra
   turn is not a residual: -TAU reads as zero.) */
const OUT = (t) => (1 - clamp01(t)) ** 2;   // guarantees a clean hand-back

export const reactions = [
  {
    /* the backflip — the pond-bot's party trick. Rot X is the flip axis for
       this mesh (its forward is +z), and negative takes the nose up first. */
    name: 'flip',
    duration: 1.15,
    update(ctx, t) {
      const load = clamp01(t / 0.15);
      const u = clamp01((t - 0.15) / 0.60);           // the flight
      const d = (t - 0.75) / 0.25;                    // the landing, 0..1
      const air = 4 * 0.92 * u * (1 - u);
      // slow off the ground, fast through the top, slow into the landing
      const spin = u < 1 ? -TAU * smooth(clamp01((u - 0.06) / 0.90)) : -TAU;
      const crouch = t < 0.15 ? 1 - 0.24 * smooth(load) : 1;
      const stretch = t >= 0.15 && u < 1 ? 1 + 0.20 * Math.abs(1 - 2 * u) ** 1.5 : 1;
      const land = d > 0 ? 0.22 * ring(d * 0.25, 20, 6) * OUT(t * 1.02) : 0;
      ctx.nudge({
        rotX: spin,
        posY: air,
        sclY: crouch * stretch * (1 + land),
        sclX: 1 / Math.sqrt(crouch * stretch * (1 + land)),
        rotZ: -0.05 * bell(clamp01(t)),
      });
    },
  },
  {
    /* delighted double hop, half a turn on each — comes back facing forward */
    name: 'twirl',
    duration: 1.35,
    update(ctx, t, v) {
      const hop = t < 0.56 ? 0 : 1;                   // two beats, the 2nd longer
      const u = hop === 0 ? clamp01(t / 0.56) : clamp01((t - 0.56) / 0.44);
      const rest = hop === 1 ? clamp01((t - 1.0) / 0.35) : 0;
      // each beat: 22% load, 62% air, the rest landing
      const load = clamp01(u / 0.22);
      const fly = clamp01((u - 0.22) / 0.62);
      const down = clamp01((u - 0.84) / 0.16);
      const air = rest > 0 ? 0 : 4 * (hop ? 0.58 : 0.44) * fly * (1 - fly);
      const spinTo = hop === 0 ? Math.PI : TAU;
      const spun = rest > 0 ? TAU : spinTo - (hop === 0 ? Math.PI : Math.PI) * (1 - easeOutCubic(fly));
      const q = rest > 0
        ? 1 + 0.16 * ring(rest * 0.35, 19, 6) * OUT(t * 1.02)
        : u < 0.22 ? 1 - 0.20 * smooth(load)
          : u < 0.84 ? 1 + 0.19 * Math.abs(1 - 2 * fly) ** 1.5
            : 1 - 0.17 * bell(down * 0.5 + 0.5);
      ctx.nudge({
        rotY: spun * v,
        posY: air,
        sclY: q,
        sclX: 1 / Math.sqrt(q),
        rotX: 0.16 * fly * (1 - fly) * 4 * (rest > 0 ? 0 : 1),
      });
    },
  },
  {
    /* coy: turns slowly away, thinks about it, then whips back and looks
       straight at you. The pause is the joke; the snap sells it. */
    name: 'coy',
    duration: 1.50,
    update(ctx, t, v) {
      const away = smooth(clamp01(t / 0.40));                     // slow turn out
      const hold = clamp01((t - 0.40) / 0.22);                    // a beat of nothing
      const back = clamp01((t - 0.62) / 0.38);
      // the return is a spring: fast, past the front, and eased back — rated so
      // it is fully settled before the reaction hands the body back
      const snap = spring((t - 0.62) * 1.5, 13, 0.46);
      const home = 1 - smooth(clamp01((t - 0.86) / 0.14));   // kill the last degree
      const yaw = (away * -1.30 + (t > 0.62 ? 1.30 * snap : 0)) * v * home;
      const peek = 0.20 * bell(hold) * v;                         // glances back mid-hold
      const hopUp = 0.26 * bell(back);
      const q = t < 0.62
        ? 1 - 0.09 * away + 0.03 * bell(hold)
        : 1 + 0.15 * bell(back) - 0.11 * bell(clamp01((t - 0.80) / 0.20));
      ctx.nudge({
        rotY: yaw + peek,
        posY: hopUp,
        sclY: q,
        sclX: 1 / Math.sqrt(q),
        rotZ: (-0.10 * away * home + 0.07 * bell(back)) * v,
        rotX: -0.06 * bell(hold),
      });
    },
  },
  {
    /* shimmy — the amplitude decays AND the frequency slows, which is what
       makes a wobble read as losing energy rather than being faded out */
    name: 'shimmy',
    duration: 0.85,
    update(ctx, t, v) {
      const e = (1 - t) ** 1.6;
      const phase = (t * 7.4 - t * t * 2.2) * Math.PI;
      const q = 1 + 0.07 * Math.sin(phase * 0.5) * e;
      ctx.nudge({
        rotY: Math.sin(phase) * 0.38 * e * v,
        rotZ: Math.sin(phase * 0.92) * 0.10 * e * v,
        posY: 0.05 * bell(clamp01(t * 1.6)),
        sclY: q,
        sclX: 1 / Math.sqrt(q),
      });
    },
  },
  {
    /* boing — a pure squash-and-stretch pump, for when a whole move is too
       much. Volume is preserved, so it reads as rubber rather than as scale. */
    name: 'boing',
    duration: 0.72,
    update(ctx, t) {
      const load = clamp01(t / 0.10);
      const p = t < 0.10
        ? -0.25 * smooth(load)
        : 0.30 * ring(t - 0.10, 17, 4.6) * OUT(t * 1.02);
      const q = 1 + p;
      ctx.nudge({
        sclY: q,
        sclX: 1 / Math.sqrt(q),
        posY: 0.20 * Math.max(0, p),
        rotX: 0.05 * p,
      });
    },
  },
];

export default { key: 'pondbot', params, roam, ground, period, entryEnd, entrance, work, reactions };
