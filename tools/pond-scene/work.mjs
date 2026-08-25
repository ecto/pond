/* What each character is DOING, and where on the floor it is doing it.

   Every entry is a pure function of time returning a whole character state:

     { j:{joint:rad}, place:{x,z,yaw}, lift, tilt:{pitch,roll}, squash, prop }

   `place` is a position on the shared stage floor in stage units (x across the
   frame, z toward the camera) plus a facing; `lift` raises the character off
   the floor (pond-bot's hops) and is the ONLY thing that ever does. Everything
   else stands on the deck at all times.

   Shared by the browser runtime (scene.js) and the offline stage preview
   (preview.js), so the walk you eyeball offline is the walk that ships.

   `ctx.mps` is the character's metres-per-stage-unit, so gaits can be authored
   in the robot's own units (where the IK lives) while travel is planned on the
   stage. */

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const seg = (u, a, b) => smooth((u - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;

function lerpPose(A, B, t) {
  const o = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) o[k] = mix(A[k] || 0, B[k] || 0, t);
  return o;
}
function track(u, keys) {
  if (u <= keys[0][0]) return { ...keys[0][1] };
  for (let i = 0; i < keys.length - 1; i++) {
    const [ua, A] = keys[i], [ub, B] = keys[i + 1];
    if (u <= ub) return ub === ua ? { ...B } : lerpPose(A, B, seg(u, ua, ub));
  }
  return { ...keys[keys.length - 1][1] };
}

/* ---------------- planar leg IK ----------------
   Both the Go2 and T1 legs are exact two-link planar chains in the sagittal
   plane (verified against the URDFs): with hip angle a and knee angle k,

     foot = L1*u(a) + L2*u(a+k),   u(x) = (-sin x, -cos x)

   in (x forward, z up) relative to the hip. Two unit vectors at a and a+k sum
   to 2cos(k/2) in the direction a+k/2, which makes the inverse exact and
   three lines long. `kneeSign` picks the branch: the Go2's knee folds back
   (-1), T1's folds forward (+1).

   Driving the feet by IK rather than keyframing joint angles is what keeps the
   walk from skating: during stance the foot is commanded to travel backward at
   exactly the body's forward speed. */
function legIK(fx, fz, L1, L2, kneeSign) {
  const r = Math.hypot(fx, fz);
  const lo = Math.abs(L1 - L2) + 1e-4, hi = L1 + L2 - 1e-4;
  const rc = r < lo ? lo : r > hi ? hi : r;
  let c = (rc * rc - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  c = c < -1 ? -1 : c > 1 ? 1 : c;
  const knee = kneeSign * Math.acos(c);
  const alpha = Math.atan2(-fx, -fz);
  const delta = Math.atan2(L2 * Math.sin(knee), L1 + L2 * Math.cos(knee));
  return { hip: alpha - delta, knee };
}

/* ---------------- schedules ----------------
   A schedule is a list of legs: walk between two waypoints, or hold at one.
   Distance is integrated along the path so a gait can be driven by how far the
   body has actually travelled. The first pass runs an entrance that starts
   offstage; after that the loop repeats forever. */
function plan(entrance, loop, speed) {
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

/** where the body is, and how far it has walked, at time t */
function follow(sched, t) {
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
      // the robots' own forward axis is URDF +x, which the Z-up fix maps to
      // stage +x; a Y rotation of `yaw` sends local +x to (cos yaw, -sin yaw)
      heading: Math.atan2(-(L.to.z - L.from.z), L.to.x - L.from.x),
    };
  }
  return { x: 0, z: 0, s: base, moving: false, u: 0 };
}

/* ================= Go2: sentry patrol, on a real walk ================= */
const GO2_L = 0.2130;                        // both leg links, metres
const GO2_STAND = 0.335;                     // hip above foot, metres
const GO2_STANCE = 0.130;                    // ground covered per stance, metres
const GO2_DUTY = 0.75;                       // three feet down at a time: a crawl
const GO2_ADVANCE = GO2_STANCE / GO2_DUTY;   // metres per full gait cycle
const GO2_LIFT = 0.055;
const GO2_SPEED = 0.30;                      // stage units per second
/* crawl sequence: left-front, right-hind, right-front, left-hind */
const GO2_LEGS = [['FL', 0], ['RR', 0.25], ['FR', 0.5], ['RL', 0.75]];
const GO2_HIP = { FL: 0.04, RL: 0.04, FR: -0.04, RR: -0.04 };

const GO2_A = { x: -1.14, z: -1.30 }, GO2_B = { x: -0.68, z: -0.98 };
const GO2_C = { x: -0.95, z: -1.36 }, GO2_D = { x: -1.16, z: -1.10 };
const GO2_HOLD = 4.2;
const go2Sched = plan(
  [{ from: { x: -3.00, z: -1.20 }, to: GO2_A, speed: 0.42 }, { hold: GO2_HOLD, at: GO2_A }],
  [
    { from: GO2_A, to: GO2_B }, { hold: GO2_HOLD, at: GO2_B },
    { from: GO2_B, to: GO2_C }, { hold: GO2_HOLD, at: GO2_C },
    { from: GO2_C, to: GO2_D }, { hold: GO2_HOLD, at: GO2_D },
    { from: GO2_D, to: GO2_A }, { hold: GO2_HOLD, at: GO2_A },
  ], GO2_SPEED);

function go2(t, ctx) {
  const mps = (ctx && ctx.mps) || 0.489;
  const p = follow(go2Sched, t);
  const j = {};
  const phi = (p.s * mps) / GO2_ADVANCE;      // gait phase, driven by distance

  for (const [leg, off] of GO2_LEGS) {
    let fx, fz;
    if (p.moving) {
      const q = (phi + off) % 1;
      if (q < GO2_DUTY) {                     // stance: the foot tracks the ground
        fx = GO2_STANCE * (0.5 - q / GO2_DUTY);
        fz = -GO2_STAND;
      } else {                                // swing: lift, carry forward, plant
        const b = (q - GO2_DUTY) / (1 - GO2_DUTY);
        fx = GO2_STANCE * (-0.5 + b);
        fz = -GO2_STAND + GO2_LIFT * Math.sin(b * Math.PI);
      }
      fz += 0.006 * Math.sin(phi * TAU * 2);  // a little vertical life
    } else {
      // standing sentry: a slow weight rock, and one foot re-plants now and then
      const s = Math.sin(p.u * TAU);
      fx = (leg[0] === 'F' ? 0.012 : -0.012) + 0.010 * s;
      fz = -GO2_STAND + (leg[1] === 'L' ? 1 : -1) * 0.006 * s;
      const stepAt = { FL: 0.30, RR: 0.62 }[leg];
      if (stepAt != null) {
        const b = (p.u - stepAt) / 0.10;
        if (b > 0 && b < 1) fz += GO2_LIFT * 0.8 * Math.sin(b * Math.PI);
      }
    }
    const ik = legIK(fx, fz, GO2_L, GO2_L, -1);
    j[leg + '_thigh_joint'] = ik.hip;
    j[leg + '_calf_joint'] = ik.knee;
    j[leg + '_hip_joint'] = GO2_HIP[leg];
  }

  // the trunk is the neck here: scan while parked, look where you are going
  // while walking
  const scan = p.moving ? 0 : Math.sin(clamp01((p.u - 0.15) / 0.85) * TAU * 1.5 + 0.4) * 0.30;
  return {
    j,
    place: { x: p.x, z: p.z, yaw: (p.heading || 0) + scan },
    lift: 0,
    tilt: { pitch: p.moving ? -0.03 : -0.01, roll: p.moving ? Math.sin(phi * TAU) * 0.025 : 0 },
    squash: 1,
    prop: null,
  };
}

/* ============ T1: carry and inspect, with a slow two-step shuffle ========== */
const T1_L1 = 0.2363, T1_L2 = 0.2920;   // hip->knee, knee->foot, metres
const T1_STAND = 0.472;                 // hip above foot while carrying
const T1_CROUCH = 0.322;                // hip above foot at the bottom of the squat
const T1_STANCE = 0.150;                // ground per stance — small and careful
const T1_DUTY = 0.80;                   // long double support: it is carrying something
const T1_ADVANCE = T1_STANCE / T1_DUTY;
const T1_LIFT = 0.045;
const T1_SPEED = 0.085;                 // stage units per second

const T1_P1 = { x: 0.45, z: -1.05 }, T1_P2 = { x: 0.72, z: -0.80 };
const T1_WORK = 15.0;
const t1Sched = plan(
  // arrives at a brisk walk, then shuffles slowly once it is at work
  [{ from: { x: 3.00, z: -0.90 }, to: T1_P1, speed: 0.30 }, { hold: T1_WORK, at: T1_P1, yaw: -1.90 }],
  [
    { from: T1_P1, to: T1_P2 }, { hold: T1_WORK, at: T1_P2, yaw: -1.30 },
    { from: T1_P2, to: T1_P1 }, { hold: T1_WORK, at: T1_P1, yaw: -1.90 },
  ], T1_SPEED);

const T1_HOLD_ARMS = {
  Left_Shoulder_Pitch: -1.00, Right_Shoulder_Pitch: -1.00,
  Left_Shoulder_Roll: -1.15, Right_Shoulder_Roll: 1.15,
  Left_Elbow_Pitch: -0.40, Right_Elbow_Pitch: -0.40,
  Left_Elbow_Yaw: 0.20, Right_Elbow_Yaw: -0.20,
};
const T1_REACH_ARMS = {
  Left_Shoulder_Pitch: -0.62, Right_Shoulder_Pitch: -0.62,
  Left_Shoulder_Roll: -1.30, Right_Shoulder_Roll: 1.30,
  Left_Elbow_Pitch: -0.25, Right_Elbow_Pitch: -0.25,
  Left_Elbow_Yaw: 0.10, Right_Elbow_Yaw: -0.10,
};
const T1_OPEN_ARMS = {
  Left_Shoulder_Pitch: -0.12, Right_Shoulder_Pitch: -0.12,
  Left_Shoulder_Roll: -1.46, Right_Shoulder_Roll: 1.46,
  Left_Elbow_Pitch: -0.16, Right_Elbow_Pitch: -0.16,
  Left_Elbow_Yaw: 0, Right_Elbow_Yaw: 0,
};

export const T1_RELEASE_U = 0.42, T1_REGRASP_U = 0.76;

/** both legs from the IK, soles kept flat on the deck */
function t1Leg(j, side, fx, fz) {
  const ik = legIK(fx, fz, T1_L1, T1_L2, +1);
  j[side + '_Hip_Pitch'] = ik.hip;
  j[side + '_Knee_Pitch'] = ik.knee;
  j[side + '_Ankle_Pitch'] = -(ik.hip + ik.knee);
}

function t1(t, ctx) {
  const mps = (ctx && ctx.mps) || 1.075;
  const p = follow(t1Sched, t);
  const j = {};

  if (p.moving) {
    // walking: hug the crate, take slow small steps with a long double support
    const phi = (p.s * mps) / T1_ADVANCE;
    for (const [side, off] of [['Left', 0], ['Right', 0.5]]) {
      const q = (phi + off) % 1;
      let fx, fz;
      if (q < T1_DUTY) { fx = T1_STANCE * (0.5 - q / T1_DUTY); fz = -T1_STAND; }
      else {
        const b = (q - T1_DUTY) / (1 - T1_DUTY);
        fx = T1_STANCE * (-0.5 + b);
        fz = -T1_STAND + T1_LIFT * Math.sin(b * Math.PI);
      }
      t1Leg(j, side, fx, fz);
    }
    // Weight shifts onto the support leg. The lean lives in the body tilt
    // rather than in hip roll: the tilt rotates about the character's floor
    // point, so the planted feet stay put, whereas rolling the hips would drag
    // them sideways across the deck.
    // The lateral chain is one DOF per joint and purely rotational, so hip
    // roll cannot shift the pelvis without dragging the planted foot sideways
    // with it — measured at ~15% of body speed, which reads as a skate. The
    // whole weight shift therefore lives in the body tilt, which pivots about
    // the character's floor point and leaves the feet where they were.
    const sh = Math.sin(phi * TAU);
    // T1's "Waist" joint sits between the trunk and the LEGS, so any waist yaw
    // swings both feet across the deck; while walking it has to stay tiny
    j.Waist = 0.010 * sh;
    j.AAHead_yaw = 0.12 * Math.sin(phi * Math.PI);
    j.Head_pitch = 0.10;
    Object.assign(j, T1_HOLD_ARMS);
    return {
      j,
      place: { x: p.x, z: p.z, yaw: p.heading },
      lift: 0,
      tilt: { pitch: 0.02, roll: -0.085 * sh },
      squash: 1,
      prop: { held: true },
    };
  }

  // parked at a work spot: run the crate cycle
  const u = p.u;
  const hip = track(u, [
    [0.00, { h: T1_STAND }], [0.30, { h: T1_STAND }],
    [0.40, { h: T1_CROUCH }], [0.46, { h: T1_CROUCH }],
    [0.56, { h: T1_STAND }], [0.68, { h: T1_STAND }],
    [0.76, { h: T1_CROUCH }], [0.82, { h: T1_CROUCH }],
    [0.92, { h: T1_STAND }], [1.00, { h: T1_STAND }],
  ]).h;
  const arms = track(u, [
    [0.00, T1_HOLD_ARMS], [0.30, T1_HOLD_ARMS],
    [0.40, T1_REACH_ARMS], [0.46, T1_REACH_ARMS],
    [0.54, T1_OPEN_ARMS], [0.70, T1_OPEN_ARMS],
    [0.78, T1_REACH_ARMS], [0.84, T1_REACH_ARMS],
    [0.92, T1_HOLD_ARMS], [1.00, T1_HOLD_ARMS],
  ]);
  const carrying = u < T1_RELEASE_U || u >= T1_REGRASP_U;

  const sway = Math.sin(t * 0.62) * (carrying ? 1 : 0.4);
  const h = hip + sway * 0.010;
  t1Leg(j, 'Left', 0.004, -h);
  t1Leg(j, 'Right', 0.004, -h);

  const inspecting = u > 0.5 && u < 0.72;
  Object.assign(j, arms);
  j.Waist = Math.sin(t * 0.44) * 0.045;   // see the note in the walking branch
  j.AAHead_yaw = inspecting ? -0.12 : Math.sin(u * TAU * 1.5 + 1.2) * 0.5;
  j.Head_pitch = inspecting ? 0.62 : 0.10 + Math.sin(t * 0.9) * 0.06;

  return {
    j,
    place: { x: p.x, z: p.z, yaw: p.heading != null ? p.heading : -1.90 },
    lift: 0,
    tilt: { pitch: 0, roll: sway * 0.02 },
    squash: 1,
    prop: { held: carrying },
  };
}

/* ============== pond-bot: the host, hopping between spots ================= */
const PB_HOP = 0.62;          // flight time
const PB_SETTLE = 2.6;        // between hops
const PB_ARC = 0.30;          // apex, stage units
const PB_CYCLE = PB_HOP + PB_SETTLE;
/* keeps clear of the Z1's reach on the right and the Go2's patrol upstage */
const PB_SPOTS = [
  { x: -0.42, z: 0.26 }, { x: -0.02, z: 0.58 },
  { x: 0.02, z: 0.24 }, { x: -0.32, z: 0.56 },
];
/* who it turns to watch at each spot */
const PB_WATCH = [1.15, 0.72, 1.58, 0.95];
const PB_ENTRY = { x: -0.40, z: 2.20 };

function pondbot(t) {
  const n = PB_SPOTS.length;
  let i, u, from, to;
  if (t < PB_CYCLE) {
    i = 0; u = clamp01(t / PB_CYCLE); from = PB_ENTRY; to = PB_SPOTS[0];
  } else {
    const k = Math.floor((t - PB_CYCLE) / PB_CYCLE);
    u = ((t - PB_CYCLE) % PB_CYCLE) / PB_CYCLE;
    i = (k + 1) % n;
    from = PB_SPOTS[k % n];
    to = PB_SPOTS[i];
  }
  const flyFrac = PB_HOP / PB_CYCLE;
  const fly = clamp01(u / flyFrac);
  const air = Math.sin(fly * Math.PI);
  const e = smooth(fly);
  const settled = clamp01((u - flyFrac) / (1 - flyFrac));
  const watch = Math.sin(t * 1.25);

  return {
    j: {},
    place: {
      x: mix(from.x, to.x, e),
      z: mix(from.z, to.z, e),
      yaw: mix(PB_WATCH[(i + n - 1) % n], PB_WATCH[i], e) + watch * 0.07,
    },
    lift: air * PB_ARC,
    // leans into the hop, levels out on landing
    tilt: { pitch: -air * 0.16 + watch * 0.02, roll: Math.sin(t * 0.8) * 0.03 },
    // squashes at takeoff, stretches at apex, absorbs the landing
    squash: 1 + air * 0.09 - Math.max(0, Math.sin(fly * Math.PI * 2)) * 0.05
      - Math.exp(-settled * 14) * 0.07,
    prop: null,
  };
}

/* ================= Z1: bolted down, picking and placing ================= */
const Z1_PERIOD = 9.5;
const z1Pose = (yaw, o) => ({ joint1: yaw, joint2: o[0], joint3: o[1], joint4: o[2], joint5: o[3] || 0, joint6: o[4] || 0 });
/* All three keyposes live on one "arm extended" manifold (elbow near 1.9 rad):
   folding the elbow in instead drives link04 straight through link02. */
const Z1_HOME = [1.30, 1.72, -1.30, 0.10, 0];
const Z1_LOW = [0.70, 1.90, -1.00, 0.06, 0];
const Z1_HIGH = [1.10, 1.90, -1.40, 0.08, 0];
const Z1_FACE = 0.78;
const Z1_A = Z1_FACE - 0.30, Z1_B = Z1_FACE + 0.30;
const Z1_AT = { x: 1.20, z: 0.26 }, Z1_YAW = -0.75;
const Z1_RISE = 1.1;
export const Z1_GRASP_U = 0.24, Z1_RELEASE_U = 0.66;

function z1(t) {
  const k = Math.floor(Math.max(0, t) / Z1_PERIOD);
  const u = (Math.max(0, t) / Z1_PERIOD) % 1;
  const flip = k % 2 === 1;
  const src = flip ? Z1_B : Z1_A, dst = flip ? Z1_A : Z1_B;
  const mid = (src + dst) * 0.5;

  const j = track(u, [
    [0.00, z1Pose(mid, Z1_HOME)],
    [0.16, z1Pose(src, Z1_HIGH)],
    [0.22, z1Pose(src, Z1_LOW)],
    [0.30, z1Pose(src, Z1_LOW)],
    [0.40, z1Pose(src, Z1_HIGH)],
    [0.54, z1Pose(dst, Z1_HIGH)],
    [0.62, z1Pose(dst, Z1_LOW)],
    [0.70, z1Pose(dst, Z1_LOW)],
    [0.80, z1Pose(dst, Z1_HIGH)],
    [1.00, z1Pose(mid, Z1_HOME)],
  ]);
  j.joint6 = Math.sin(t * 1.7) * 0.10;
  j.joint5 += Math.sin(t * 1.1) * 0.05;

  const carrying = u >= Z1_GRASP_U && u < Z1_RELEASE_U;
  return {
    j,
    place: { x: Z1_AT.x, z: Z1_AT.z, yaw: Z1_YAW },
    lift: 0,
    tilt: { pitch: 0, roll: 0 },
    squash: 1,
    // bolted down, so it arrives by rising into place rather than walking on
    rise: smooth(t / Z1_RISE),
    prop: { held: carrying, park: carrying ? null : (u < Z1_GRASP_U ? 'src' : 'dst') },
  };
}

/* ---------------- exports ---------------- */
export const WORK = { z1, go2, t1, pondbot };
/* one full behaviour loop, used to sample swept extents and to pick the
   frozen reduced-motion pose */
export const PERIOD = {
  z1: Z1_PERIOD,
  go2: go2Sched.loop.dur,
  t1: t1Sched.loop.dur,
  pondbot: PB_CYCLE * PB_SPOTS.length,
};
/* how long each character's entrance runs before its loop takes over */
export const ENTRY_END = {
  z1: Z1_RISE, go2: go2Sched.entry.dur, t1: t1Sched.entry.dur, pondbot: PB_CYCLE,
};

/* Which link origins rest on the floor. The URDF root is the trunk, so bending
   the legs lifts the FEET rather than lowering the body; every frame the
   character is re-grounded by pushing it down until the lowest of these links
   is back on the deck. With locomotion this is the invariant, not a fix-up. */
export const GROUND = {
  t1: ['left_foot_link', 'right_foot_link'],
  go2: ['FL_foot', 'FR_foot', 'RL_foot', 'RR_foot'],
  z1: ['link00'],
  pondbot: [],
};

/* gait constants the selftest re-derives from the URDFs */
export const GAIT = {
  go2: { L1: GO2_L, L2: GO2_L, kneeSign: -1, advance: GO2_ADVANCE, stand: GO2_STAND, hipLink: 'FL_thigh', footLink: 'FL_foot', hipJoint: 'FL_thigh_joint', kneeJoint: 'FL_calf_joint' },
  t1: { L1: T1_L1, L2: T1_L2, kneeSign: +1, advance: T1_ADVANCE, stand: T1_STAND, hipLink: 'Hip_Pitch_Left', footLink: 'left_foot_link', hipJoint: 'Left_Hip_Pitch', kneeJoint: 'Left_Knee_Pitch' },
};
export { legIK };

/* ---------------- click reactions ----------------
   Layered ON TOP of the work loop: `body` nudges the whole character, `joints`
   returns additive joint deltas so the reaction is articulated too. */
const EASE = (t) => 1 - Math.pow(1 - t, 3);
const arc = (t) => Math.sin(EASE(Math.min(1, t * 1.15)) * Math.PI);

export const REACTIONS = {
  flip: { dur: 1.0, body: (o, t, v) => { o.rot.x = t * TAU; o.pos.y = Math.sin(t * Math.PI) * 0.55 * v; } },
  hop: { dur: 0.62, body: (o, t, v) => { const s = Math.sin(t * Math.PI); o.pos.y = s * 0.34 * v; o.scl.y = 1 + s * 0.13; o.scl.x = 1 - s * 0.08; } },
  boing: { dur: 0.70, body: (o, t, v) => { const p = Math.sin(t * Math.PI * 2.5) * (1 - t); o.scl.y = 1 + p * 0.2 * v; o.scl.x = 1 - p * 0.13 * v; } },
  shimmy: { dur: 0.80, body: (o, t, v) => { o.rot.y = Math.sin(t * Math.PI * 6) * 0.34 * (1 - t) * v; } },

  bow: {
    dur: 1.15,
    joints: (t) => {
      const p = arc(t);
      return {
        Left_Hip_Pitch: -0.52 * p, Right_Hip_Pitch: -0.52 * p,
        Left_Knee_Pitch: 0.22 * p, Right_Knee_Pitch: 0.22 * p,
        Left_Ankle_Pitch: 0.26 * p, Right_Ankle_Pitch: 0.26 * p,
        Head_pitch: 0.34 * p, AAHead_yaw: -0.1 * p,
        Left_Shoulder_Pitch: -0.3 * p, Right_Shoulder_Pitch: -0.3 * p,
      };
    },
  },
  playbow: {
    dur: 1.25,
    joints: (t) => {
      const p = arc(t);
      return {
        FL_thigh_joint: 0.95 * p, FR_thigh_joint: 0.95 * p,
        FL_calf_joint: -0.62 * p, FR_calf_joint: -0.62 * p,
        RL_thigh_joint: -0.30 * p, RR_thigh_joint: -0.30 * p,
        RL_calf_joint: 0.20 * p, RR_calf_joint: 0.20 * p,
      };
    },
    body: (o, t) => { o.rot.z = -arc(t) * 0.06; },
  },
  wave: {
    dur: 1.4,
    joints: (t) => {
      const on = Math.sin(Math.min(1, t * 1.2) * Math.PI);
      return {
        joint2: -0.55 * on, joint3: 0.45 * on, joint4: -0.25 * on,
        joint5: Math.sin(t * Math.PI * 6) * 0.55 * on,
        joint6: Math.sin(t * Math.PI * 6 + 1) * 0.35 * on,
      };
    },
  },
  lean: { dur: 0.95, joints: (t) => { const p = arc(t); return { joint1: 0.42 * p, joint2: 0.22 * p, joint4: -0.3 * p }; } },
  wag: { dur: 0.9, joints: (t) => { const s = Math.sin(t * Math.PI * 5) * (1 - t); return { RL_hip_joint: 0.16 * s, RR_hip_joint: 0.16 * s, FL_hip_joint: -0.12 * s, FR_hip_joint: -0.12 * s }; } },
  twist: { dur: 1.0, joints: (t) => { const s = Math.sin(t * Math.PI * 2) * (1 - t * 0.4); return { Waist: 0.42 * s, AAHead_yaw: 0.5 * s, Left_Shoulder_Roll: -0.2 * s, Right_Shoulder_Roll: -0.2 * s }; } },
};
