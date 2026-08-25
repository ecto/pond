/* Work loops: what each character is DOING.
   Every entry is a pure function of time -> { j: jointAngles, body: {...}, prop: {...} }.
   Shared by the browser runtime (scene.js) and the offline contact-sheet
   preview (preview.js), so what you eyeball in the PNG is what ships.

   Angles are absolute radians in the URDF's own frame. `body` is a
   character-level transform layered on top of placement (the Go2 has no neck
   joint, so its scanning has to come from the trunk). `prop` says which link a
   prop is attached to right now, or `null` for "left where it was". */

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/* eased 0..1 ramp across a window of the cycle */
const seg = (u, a, b) => {
  const t = clamp01((u - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
/* blend a whole pose object */
function lerpPose(A, B, t) {
  const o = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) o[k] = mix(A[k] || 0, B[k] || 0, t);
  return o;
}
/* walk a keyframe track: [[uAt, pose], ...], holding between identical stamps */
function track(u, keys) {
  if (u <= keys[0][0]) return { ...keys[0][1] };
  for (let i = 0; i < keys.length - 1; i++) {
    const [ua, A] = keys[i], [ub, B] = keys[i + 1];
    if (u <= ub) return ub === ua ? { ...B } : lerpPose(A, B, seg(u, ua, ub));
  }
  return { ...keys[keys.length - 1][1] };
}

/* ---------------- Z1: pick and place ----------------
   Reaches down to a cube on one side, grasps, lifts and slews across, sets it
   down on the other side, returns home. The next cycle runs the other way, so
   the cube ping-pongs between two spots forever. */
const Z1_PERIOD = 9.5;
const z1Pose = (yaw, o) => ({ joint1: yaw, joint2: o[0], joint3: o[1], joint4: o[2], joint5: o[3] || 0, joint6: o[4] || 0 });
/* These three live on the same "arm extended" manifold (elbow held near 1.6
   rad) so every interpolation between them stays clear of the arm's own body;
   folding the elbow in instead drives link04 straight through link02. */
const Z1_HOME = [1.30, 1.72, -1.30, 0.10, 0];    // tucked up, waiting
const Z1_LOW = [0.70, 1.90, -1.00, 0.06, 0];     // tool pointing down at deck level
const Z1_HIGH = [1.10, 1.90, -1.40, 0.08, 0];    // carried clear of the deck
/* The two spots straddle the direction the arm faces on the page (the holder
   yaws the whole robot ~-0.75 rad), so the carry sweeps ACROSS the frame
   rather than toward the camera where it would foreshorten into nothing. */
const Z1_FACE = 0.78;
const Z1_A = Z1_FACE - 0.55, Z1_B = Z1_FACE + 0.55;

export const Z1_GRASP_U = 0.24, Z1_RELEASE_U = 0.66;

function z1(t) {
  const k = Math.floor(t / Z1_PERIOD);
  const u = (t / Z1_PERIOD) % 1;
  const flip = k % 2 === 1;
  const src = flip ? Z1_B : Z1_A;
  const dst = flip ? Z1_A : Z1_B;
  const mid = (src + dst) * 0.5;

  const j = track(u, [
    [0.00, z1Pose(mid, Z1_HOME)],
    [0.16, z1Pose(src, Z1_HIGH)],
    [0.22, z1Pose(src, Z1_LOW)],
    [0.30, z1Pose(src, Z1_LOW)],          // grasp beat
    [0.40, z1Pose(src, Z1_HIGH)],
    [0.54, z1Pose(dst, Z1_HIGH)],         // slew across
    [0.62, z1Pose(dst, Z1_LOW)],
    [0.70, z1Pose(dst, Z1_LOW)],          // release beat
    [0.80, z1Pose(dst, Z1_HIGH)],
    [1.00, z1Pose(mid, Z1_HOME)],
  ]);
  // a little wrist life so it doesn't read as a rigid CAD animation
  j.joint6 = Math.sin(t * 1.7) * 0.10;
  j.joint5 += Math.sin(t * 1.1) * 0.05;

  const carrying = u >= Z1_GRASP_U && u < Z1_RELEASE_U;
  return { j, body: {}, prop: { held: carrying, park: carrying ? null : (u < Z1_GRASP_U ? 'src' : 'dst'), spot: carrying ? null : (u < Z1_GRASP_U ? src : dst) } };
}

/* ---------------- Go2: sentry patrol ----------------
   Stationary scanning work: the trunk sweeps side to side, weight rocks
   between the left and right pairs, and now and then one foot steps in place. */
const GO2_PERIOD = 11.0;
const GO2_REST = {
  FL_hip_joint: 0.04, RL_hip_joint: 0.04, FR_hip_joint: -0.04, RR_hip_joint: -0.04,
  FL_thigh_joint: 0.62, FR_thigh_joint: 0.62, RL_thigh_joint: 0.72, RR_thigh_joint: 0.72,
  FL_calf_joint: -1.3, FR_calf_joint: -1.3, RL_calf_joint: -1.42, RR_calf_joint: -1.42,
};
const GO2_STEPS = [[0.18, 'FL'], [0.44, 'RR'], [0.68, 'FR'], [0.90, 'RL']];
const STEP_LEN = 0.075;

function go2(t) {
  const u = (t / GO2_PERIOD) % 1;
  const j = { ...GO2_REST };

  // weight rocks left/right; the loaded pair straightens, the light pair folds
  const s = Math.sin(u * TAU);
  for (const leg of ['FL', 'RL']) { j[leg + '_thigh_joint'] -= 0.05 * s; j[leg + '_calf_joint'] += 0.07 * s; j[leg + '_hip_joint'] += 0.045 * s; }
  for (const leg of ['FR', 'RR']) { j[leg + '_thigh_joint'] += 0.05 * s; j[leg + '_calf_joint'] -= 0.07 * s; j[leg + '_hip_joint'] += 0.045 * s; }

  // step in place: lift, swing a touch forward, set down
  for (const [at, leg] of GO2_STEPS) {
    const local = (u - at) / STEP_LEN;
    if (local < 0 || local > 1) continue;
    const lift = Math.sin(local * Math.PI);
    j[leg + '_thigh_joint'] -= 0.62 * lift;
    j[leg + '_calf_joint'] += 0.80 * lift;
    j[leg + '_hip_joint'] += (leg[1] === 'L' ? 1 : -1) * 0.06 * lift;
  }

  // the trunk IS the neck here: sweep the whole body to scan
  const scan = Math.sin(u * TAU * 2 + 0.7);
  return {
    j,
    body: { yaw: scan * 0.34, pitch: Math.sin(u * TAU * 3) * 0.045 - 0.02, roll: -s * 0.05, lift: 0 },
    prop: null,
  };
}

/* ---------------- T1: carry and inspect ----------------
   Holds a crate, sways under the load, and once per cycle squats to set it
   down, straightens up to look it over, then squats again and picks it back up. */
const T1_PERIOD = 15.0;
const T1_STAND = {
  Left_Hip_Pitch: -0.30, Right_Hip_Pitch: -0.30,
  Left_Knee_Pitch: 0.60, Right_Knee_Pitch: 0.60,
  Left_Ankle_Pitch: -0.30, Right_Ankle_Pitch: -0.30,
};
/* deep enough that the crate's base lands exactly on the deck: T1 has no
   torso-pitch joint (its "Waist" is a yaw that turns the LEGS), so the squat
   is the only way down and the crate is carried tall, gripped at its top rim */
const T1_SQUAT = {
  Left_Hip_Pitch: -1.10, Right_Hip_Pitch: -1.10,
  Left_Knee_Pitch: 1.90, Right_Knee_Pitch: 1.90,
  Left_Ankle_Pitch: -0.82, Right_Ankle_Pitch: -0.82,
};
/* Shoulder_Roll brings the arm DOWN and IN (0 is a T-pose, |roll| ~1.5 is at
   the side); Shoulder_Pitch NEGATIVE swings it forward. */
const T1_HOLD = {    // crate hugged in front of the chest
  Left_Shoulder_Pitch: -1.00, Right_Shoulder_Pitch: -1.00,
  Left_Shoulder_Roll: -1.15, Right_Shoulder_Roll: 1.15,
  Left_Elbow_Pitch: -0.40, Right_Elbow_Pitch: -0.40,
  Left_Elbow_Yaw: 0.20, Right_Elbow_Yaw: -0.20,
};
const T1_REACH = {   // arms down and forward, crate base on the deck
  Left_Shoulder_Pitch: -0.62, Right_Shoulder_Pitch: -0.62,
  Left_Shoulder_Roll: -1.30, Right_Shoulder_Roll: 1.30,
  Left_Elbow_Pitch: -0.25, Right_Elbow_Pitch: -0.25,
  Left_Elbow_Yaw: 0.10, Right_Elbow_Yaw: -0.10,
};
const T1_OPEN = {    // empty hands, relaxed at the sides
  Left_Shoulder_Pitch: -0.12, Right_Shoulder_Pitch: -0.12,
  Left_Shoulder_Roll: -1.46, Right_Shoulder_Roll: 1.46,
  Left_Elbow_Pitch: -0.16, Right_Elbow_Pitch: -0.16,
  Left_Elbow_Yaw: 0, Right_Elbow_Yaw: 0,
};

export const T1_RELEASE_U = 0.42, T1_REGRASP_U = 0.76;

function t1(t) {
  const u = (t / T1_PERIOD) % 1;

  const legs = track(u, [
    [0.00, T1_STAND], [0.30, T1_STAND],
    [0.40, T1_SQUAT], [0.46, T1_SQUAT],   // set down
    [0.56, T1_STAND], [0.68, T1_STAND],   // stand back and look
    [0.76, T1_SQUAT], [0.82, T1_SQUAT],   // pick back up
    [0.92, T1_STAND], [1.00, T1_STAND],
  ]);
  const arms = track(u, [
    [0.00, T1_HOLD], [0.30, T1_HOLD],
    [0.40, T1_REACH], [0.46, T1_REACH],
    [0.54, T1_OPEN], [0.70, T1_OPEN],
    [0.78, T1_REACH], [0.84, T1_REACH],
    [0.92, T1_HOLD], [1.00, T1_HOLD],
  ]);
  const j = { ...legs, ...arms };

  // load sway: knees and waist breathe under the weight, more when carrying
  const carrying = u < T1_RELEASE_U || u >= T1_REGRASP_U;
  const load = carrying ? 1 : 0.35;
  const sway = Math.sin(t * 0.62);
  j.Left_Knee_Pitch += sway * 0.055 * load;
  j.Right_Knee_Pitch += sway * 0.055 * load;
  j.Left_Hip_Pitch -= sway * 0.03 * load;
  j.Right_Hip_Pitch -= sway * 0.03 * load;
  j.Waist = Math.sin(t * 0.44) * 0.09;

  // head: glances at the coworkers, but stares at the crate while it's down
  const inspecting = u > 0.5 && u < 0.72;
  const glance = Math.sin(u * TAU * 1.5 + 1.2);
  j.AAHead_yaw = inspecting ? -0.12 : glance * 0.5;
  j.Head_pitch = inspecting ? 0.62 : 0.10 + Math.sin(t * 0.9) * 0.06;

  return {
    j,
    body: { yaw: 0, pitch: 0, roll: sway * 0.02, lift: 0 },
    prop: { held: carrying, park: carrying ? null : 'floor' },
  };
}

/* ---------------- pond-bot: the host ----------------
   No joints of its own, so its work is social: it hops around to face each
   coworker in turn and watches them do their jobs. */
const PB_PERIOD = 8.0;
/* yaw OFFSETS from the character's placement yaw — who it turns to watch */
const PB_FACING = [0.60, 0.00, 1.00, 0.35];

function pondbot(t) {
  const k = Math.floor(t / PB_PERIOD);
  const u = (t / PB_PERIOD) % 1;
  const from = PB_FACING[k % PB_FACING.length];
  const to = PB_FACING[(k + 1) % PB_FACING.length];

  // one hop per cycle, turning to the next coworker mid-air
  const hop = clamp01((u - 0.10) / 0.26);
  const air = Math.sin(hop * Math.PI);
  const yaw = mix(from, to, seg(u, 0.10, 0.36));

  // between hops: settle, then a slow watching bob
  const watch = Math.sin((t - PB_PERIOD * 0.4) * 1.35);
  return {
    j: {},
    body: {
      yaw: yaw + watch * 0.07,
      // a small forward lean on the way up reads as "hop"; any more and it
      // nose-dives, because the body rotates about its own centre
      pitch: -air * 0.07 + watch * 0.02,
      roll: Math.sin(t * 0.8) * 0.03,
      lift: air * 0.30,                 // in body heights
      squash: 1 + air * 0.10 - Math.max(0, Math.sin(hop * Math.PI * 2)) * 0.04,
    },
    prop: null,
  };
}

/* Which link origins rest on the floor. The URDF root is the trunk, so bending
   the legs lifts the FEET rather than lowering the body; every frame the
   character is re-grounded by pushing it down until the lowest of these links
   is back on the deck. */
export const GROUND = {
  t1: ['left_foot_link', 'right_foot_link'],
  go2: ['FL_foot', 'FR_foot', 'RL_foot', 'RR_foot'],
  z1: ['link00'],
  pondbot: [],
};

export const WORK = { z1, go2, t1, pondbot };
export const PERIOD = { z1: Z1_PERIOD, go2: GO2_PERIOD, t1: T1_PERIOD, pondbot: PB_PERIOD };

/* ---------------- click reactions ----------------
   Layered ON TOP of the work loop: `body` nudges the whole character, `joints`
   returns additive joint deltas so the reaction is articulated too. */
const EASE = (t) => 1 - Math.pow(1 - t, 3);
const arc = (t) => Math.sin(EASE(Math.min(1, t * 1.15)) * Math.PI);

export const REACTIONS = {
  /* pond-bot has no joints: pure body moves */
  flip: { dur: 1.0, body: (o, t, v) => { o.rot.x = t * TAU; o.pos.y = Math.sin(t * Math.PI) * 0.55 * v; } },
  hop: { dur: 0.62, body: (o, t, v) => { const s = Math.sin(t * Math.PI); o.pos.y = s * 0.34 * v; o.scl.y = 1 + s * 0.13; o.scl.x = 1 - s * 0.08; } },
  boing: { dur: 0.70, body: (o, t, v) => { const p = Math.sin(t * Math.PI * 2.5) * (1 - t); o.scl.y = 1 + p * 0.2 * v; o.scl.x = 1 - p * 0.13 * v; } },
  shimmy: { dur: 0.80, body: (o, t, v) => { o.rot.y = Math.sin(t * Math.PI * 6) * 0.34 * (1 - t) * v; } },

  /* T1 bows from the waist and hips, not by tipping the whole body over */
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
  /* Go2 play-bow: front end down on folded forelegs, rear end up */
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
  /* Z1 waves the tool flange */
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
  /* Z1 nods the whole arm over from the shoulder */
  lean: { dur: 0.95, joints: (t) => { const p = arc(t); return { joint1: 0.42 * p, joint2: 0.22 * p, joint4: -0.3 * p }; } },
  /* Go2 shakes off, T1 twists at the waist */
  wag: { dur: 0.9, joints: (t) => { const s = Math.sin(t * Math.PI * 5) * (1 - t); return { RL_hip_joint: 0.16 * s, RR_hip_joint: 0.16 * s, FL_hip_joint: -0.12 * s, FR_hip_joint: -0.12 * s }; } },
  twist: { dur: 1.0, joints: (t) => { const s = Math.sin(t * Math.PI * 2) * (1 - t * 0.4); return { Waist: 0.42 * s, AAHead_yaw: 0.5 * s, Left_Shoulder_Roll: -0.2 * s, Right_Shoulder_Roll: -0.2 * s }; } },
};
