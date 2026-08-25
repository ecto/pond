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
import { MASTER, STATIONS, CARRY, BACK_AT_HANDOFF, HAND_AT_REACH, masterPhase } from './world.mjs';

export const params = {
  arc: 0.095,       // nominal hop apex, metres — about one body height (0.097)
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

const HOME = STATIONS.frogHome;
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
  a: { x: -0.97, z: 2.18 },
  b: { x: -0.90, z: 2.14 },
  c: { x: -1.00, z: 2.24 },
  d: { x: -0.93, z: 2.26 },
  e: { x: -1.01, z: 2.10 },
};

/* Roam region — see INTERFACE.md, "Moving a character". Unchanged: the
   composition owns these numbers, this file owns the motion inside them. */
/* halfWidth is the TRUE swept half-extent now: 64mm, measured, not the 0.46
   left over from when every character was normalised to a common size. A
   stale halfWidth makes feasibleX solve the wrong composition, which is the
   guard rail quietly lying. */
/* The courier's region is the whole width of the stage, because its job is to
   cross it. It is the only character allowed to be horizontally inside the copy
   column, and that is legal ONLY because of its height and its depth: the
   height-aware keep-out assertion in the selftest is what proves it, not this
   box. halfWidth is its true swept half-extent, 75mm. */
export const roam = {
  side: 'left',
  halfWidth: 0.075,
  work: { x: [-1.50, 1.40], z: [0.45, 2.40] },
  entry: { x: [-1.50, 1.40], z: [0.45, 3.40] },
};
export const ground = [];              // it leaves the floor, so nothing is pinned

/* ------------------------------------------------------------- the score --
   THE COURIER.

   This is the only character in the cast that can cross the middle of the
   frame. The landing copy is a 544px column the machines may never touch, and
   at 1280x700 nothing taller than about 150mm fits underneath it — the Go2 and
   the Z1 never clear it at any depth that is still on screen, and the T1 clears
   it at only one viewport of four. A 97mm frog clears it from z = 1.32.

   So the relay hands it the middle leg. The arm loads the dog, the dog carries
   it as far as the copy, and then the frog takes it underneath and up the other
   side to the humanoid. Nothing about that is a workaround; it is what a cast
   at true scale is FOR.

   Its round, in master seconds:

      0..22   home, downstage left, watching the arm and the dog work
     22..31   out to the transfer point
     31..37   THE SNATCH — one big hop whose apex is exactly on master 34,
              where the cube is sitting on the lying dog's back at 305mm. Its
              own back is 124mm off the deck, so it has to leave the ground by
              181mm to meet it: nearly two body heights, which is a modest leap
              for a frog and the single most alive moment in the scene.
     37..44   down into the corridor and across, UNDER the copy
     44..49   up to the humanoid and present (T1 takes it at 49)
     49..66   watches the humanoid work, from underfoot
     66..77   the same road back, the long way, with the cube again
     77..83   the return snatch, apex on master 77, onto the dog's back
     83..88   home

   The hop machinery below is untouched: three acts (load, ballistic flight,
   landing rebound), the yaw spring that fires just after the feet leave, the
   glances, the breath. Only the route is new, and it is generated from the
   score rather than authored, because the score sets arrival SECONDS and a hop
   list has to be made to fit them. */

/** the frog's own carry point, metres above the deck when it is standing */
const CARRY_H = CARRY.pondbot.offset[2];

/* Hop sizing. A frog's jump is many times its body length; 0.34m is about
   three and a half, which crosses the stage in a dozen unhurried hops rather
   than forty frantic ones. */
const HOP_LEN = 0.34;

/** split a straight run into whole hops that fill [t0, t1] exactly */
function hopsAlong(out, from, to, t0, t1, yaw1, arc) {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  const n = Math.max(1, Math.round(d / HOP_LEN));
  const per = (t1 - t0) / n;
  let prev = from;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / n;
    const p = { x: mix(from.x, to.x, k), z: mix(from.z, to.z, k) };
    const t = t0 + i * per;
    const A = per * 0.26, F = per * 0.52, D = per - A - F;
    out.push({
      t0: t, t1: t + per, A, F, D, from: prev, to: p,
      yaw0: 0, yaw1: yaw1 == null ? heading(p.x - prev.x, p.z - prev.z) : yaw1,
      h: (arc == null ? params.arc : arc) * (0.7 + 0.5 * (d / n) / HOP_LEN),
      pow: 1.0,
      glances: [],
    });
    prev = p;
  }
  return prev;
}

/** a beat spent in one place: small hops on the spot, or simply waiting */
function dwellAt(out, at, t0, t1, look, hops) {
  const n = hops || 1;
  const per = (t1 - t0) / n;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * per;
    const jitter = { x: at.x + (i % 2 ? 0.045 : -0.03), z: at.z + (i % 2 ? -0.025 : 0.035) };
    const to = i === n - 1 ? at : jitter;
    out.push({
      t0: t, t1: t + per, A: per * 0.16, F: per * 0.30, D: per * 0.54,
      from: i === 0 ? at : out[out.length - 1].to, to,
      yaw0: 0, yaw1: look, h: params.arc * 0.30, pow: 0.75,
      glances: [[per * 0.62, (i % 2 ? 0.18 : -0.15), per * 0.30]],
    });
  }
}

/* the corridor: the depth it crosses at, and the two ends of the crossing */
const CROSS_Z = STATIONS.frogCross.z;
const SNATCH = { x: BACK_AT_HANDOFF.x, z: BACK_AT_HANDOFF.z };
const DELIVER = STATIONS.frogDeliver;
const WEST = { x: -1.10, z: CROSS_Z };
const EAST = { x: 1.10, z: CROSS_Z };

/* The snatch hop is built backwards from the moment it has to happen: apex on
   the handoff second, at the cube, high enough that the frog's back meets it. */
/* How high it has to leave the deck: the difference between the cube on the
   dog's back and its own back. Less the 31mm of `perch` — the ride-up that
   keeps a leaning body pivoting on its feet rather than through them — which is
   already lifting it at the top of the arc. Measured through the real chain;
   the handoff assertion is what keeps it honest. */
const SNATCH_PERCH = 0.031;
const SNATCH_H = BACK_AT_HANDOFF.y - CARRY_H - SNATCH_PERCH;
/* the exchange with the humanoid is the same move, a little lower: its hands
   come down to 0.294 rather than the dog's back at 0.305 */
const HAND_H = HAND_AT_REACH.y - CARRY_H - SNATCH_PERCH;
const SNATCH_F = 1.30;                             // seconds of flight
const SNATCH_A = 0.34;
const SNATCH_LEAD = SNATCH_A + SNATCH_F / 2;       // take-off to apex
const SNATCH_DUR = SNATCH_A + SNATCH_F + 0.9;      // the whole hop
function snatchHop(out, from, apexAt, yaw1, target, h) {
  const A = SNATCH_A, F = SNATCH_F;
  const T = target || SNATCH;
  const t0 = apexAt - A - F / 2;                   // apex is halfway through flight
  /* The apex is the MIDDLE of the flight, not the end of it, so the hop has to
     straddle the cube rather than land on it: reflect the take-off point
     through the target and the frog passes over the dog's back at the top of
     its arc. Landing on it instead put the snatch 176mm past the cube. */
  const to = { x: 2 * T.x - from.x, z: 2 * T.z - from.z };
  out.push({
    t0, t1: t0 + A + F + 0.9, A, F, D: 0.9,
    from, to, yaw0: 0, yaw1, h: h == null ? SNATCH_H : h, pow: 1.35, glances: [],
  });
  return to;
}

/** the same leap, aimed at the humanoid's hands instead of the dog's back */
const handOverHop = (out, from, apexAt, yaw1) =>
  snatchHop(out, from, apexAt, yaw1, DELIVER, HAND_H);

const LOOP = (() => {
  const H = [];
  const lookGo2 = heading(SNATCH.x - HOME.x, SNATCH.z - HOME.z);
  /* a snatch's apex is A + F/2 into the hop, so whatever runs before it has to
     finish exactly there. One number, used four times. */
  const before = (apex) => apex - SNATCH_LEAD;
  const after = (apex) => apex - SNATCH_LEAD + SNATCH_DUR;

  dwellAt(H, HOME, 0, 24, LOOK.z1, 5);
  /* Approach and depart along the dog's LENGTH, not across it. A snatch hop is
     symmetric about its apex — it overshoots the target by exactly as far as it
     came — so approaching from the side threw the frog 0.34m further left than
     the cube, which at this depth is off the frame edge and into the copy's
     keep-out. Coming up the z axis instead keeps its x pinned to the cube's. */
  let p = hopsAlong(H, HOME, { x: SNATCH.x, z: SNATCH.z + 0.30 }, 24, before(36), null, params.arc);
  p = snatchHop(H, p, 36, lookGo2);                              // takes it off the dog
  p = hopsAlong(H, p, WEST, after(36), 41, null, params.arc);
  p = hopsAlong(H, p, EAST, 41, 47, null, params.arc * 0.45);    // UNDER the copy: flat, and loaded
  p = hopsAlong(H, p, { x: DELIVER.x, z: DELIVER.z + 0.26 }, 47, before(52), LOOK.t1, params.arc);
  p = handOverHop(H, p, 52, LOOK.t1);                            // gives it to the T1
  dwellAt(H, DELIVER, after(52), before(74), LOOK.t1, 4);
  p = handOverHop(H, DELIVER, 74, LOOK.t1);                      // takes it back
  p = hopsAlong(H, p, EAST, after(74), 79, null, params.arc);
  p = hopsAlong(H, p, WEST, 79, 83, null, params.arc * 0.45);    // UNDER the copy: flat, and loaded
  p = hopsAlong(H, p, { x: SNATCH.x, z: SNATCH.z + 0.28 }, 83, before(85), null, params.arc);
  p = snatchHop(H, p, 85, lookGo2);                              // back onto the dog
  hopsAlong(H, p, HOME, after(85), 96, LOOK.camera, params.arc);
  // hand every hop the facing the one before ended on
  for (let i = 1; i < H.length; i++) H[i].yaw0 = H[i - 1].yaw1;
  H[0].yaw0 = LOOK.camera;
  return { hops: H, dur: MASTER };
})();

/* ------------------------------------------------------------- entrance --
   Exuberant arrival: two quick eager hops in from below the frame, then a
   bigger one that carries it home, spinning past the camera and settling back.
   It travels straight upstage, so it holds a three-quarter facing on the way
   in rather than showing the viewer its back for three seconds. */
const OFFSTAGE = { x: -0.92, z: 3.30 };
const ENTRY = (() => {
  const H = [];
  const push = (from, to, t0, t1, yaw1, arc, dwell) => {
    const A = (t1 - t0) * 0.24, F = (t1 - t0) * (dwell ? 0.46 : 0.62);
    H.push({ t0, t1, A, F, D: (t1 - t0) - A - F, from, to, yaw0: 0, yaw1,
      h: params.arc * arc, pow: Math.min(1.35, 0.72 + 0.55 * arc), glances: [] });
  };
  push(OFFSTAGE, { x: -0.98, z: 2.85 }, 0, 0.92, 1.05 - Math.PI / 2, 0.80, true);
  push({ x: -0.98, z: 2.85 }, { x: -0.92, z: 2.50 }, 0.92, 1.78, 0.72 - Math.PI / 2, 0.92, true);
  // the big one: lands home, overshoots the turn, then settles onto the visitor
  push({ x: -0.92, z: 2.50 }, HOME, 1.78, 3.80, LOOK.camera, 1.70, true);
  H[H.length - 1].glances = [[0.02, -0.34, 0.62]];
  for (let i = 1; i < H.length; i++) H[i].yaw0 = H[i - 1].yaw1;
  H[0].yaw0 = 1.05 - Math.PI / 2;
  return { hops: H, dur: 3.80 };
})();

export const period = MASTER;          // phase-locked to the world task
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
  /* the route is authored in MASTER seconds, not loop-local ones: the whole
     point is that this character's clock is the same clock as everyone else's */
  const base = poseRoute(ctx, LOOP, masterPhase(t), t);
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
