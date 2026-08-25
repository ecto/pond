'use strict';
/* Per-character source specs: where the model comes from, how its links map to
   the Pond palette, how detail is spent, and the rest pose the runtime idles
   around. Output is an ARTICULATED character: per-link geometry in link-local
   frames plus the joint table, so scene.js can drive joint angles. */
const path = require('path');
const THREE = require('three');
const { assembleLinks, assembleGLB, decimate, decimateLinks } = require('./assemble');
const { forwardKinematics } = require('./urdf');

const REPO = path.resolve(__dirname, '../..');           // .../pond
const ROBOTS = path.join(__dirname, 'robots');           // untracked clones
const GO2 = path.join(ROBOTS, 'unitree_ros/robots/go2_description') + '/';
const Z1 = path.join(ROBOTS, 'unitree_ros/robots/z1_description') + '/';
const H2 = path.join(ROBOTS, 'unitree_ros/robots/h2_description') + '/';
const K1 = path.join(ROBOTS, 'booster_assets/robots/K1') + '/';

/* material ids are palette SLOTS, not colours: 0 bone, 1 ink, 2 accent.
   Each robot picks its own accent at runtime (blue/green/red/amber). */
const BONE = 0, INK = 1, ACCENT = 2;

/* silhouette weight: >1 spends more triangles on a link */
const w = (rules, dflt = 1) => (name) => {
  for (const [re, v] of rules) if (re.test(name)) return v;
  return dflt;
};

const SPECS = {
  /* Unitree H2 — the flagship, and the scene's host. 1.82m, 31 movable joints,
     the tallest thing on the stage by half a metre; it is what the framing is
     now solved around.

     Palette: the head carries the BLUE accent (the host's face is the thing a
     visitor looks at, and blue is the mark colour the frog used to wear). Ink
     goes on the distal links — the parts that read as joints and rubber — and
     bone on the big structural panels, where the gradient across a surface is
     what makes it look like a material at all. */
  h2: {
    kind: 'urdf',
    /* H2.urdf, the STL variant — NOT H2_dae.urdf. The DAE files next to them
       load to zero triangles through our Collada reader, silently, and a
       silently empty link just disappears from the payload. The STLs carry the
       same geometry (34 links, 267k source triangles) and the palette here is
       mapped by LINK NAME rather than by material, so nothing is lost by not
       reading the DAEs' materials. assemble.js now warns on an empty load so
       this cannot go quiet again. */
    urdfFile: H2 + 'H2.urdf',
    meshRoots: { h2_description: H2, '': H2 },
    materialFor: (n) => (/^head_/.test(n) ? ACCENT
      : /hip_|knee|ankle|wrist|hand_link/.test(n) ? INK : BONE),
    weightFor: w([[/^torso_link$/, 2.0], [/^head_/, 1.9], [/^pelvis$/, 1.7],
      [/knee|hip_yaw/, 1.3], [/shoulder|elbow/, 1.2], [/ankle|hand_link|wrist/, 0.75]]),
    tris: 92000,
    /* Rest: standing tall and easy, arms down and a little forward, head level.
       The zero pose has the upper arms hanging but the FOREARMS out horizontally
       in front (left_hand_link sits at x = +0.31 of the elbow), so the elbows
       have to be driven negative to bring the hands down to the sides. */
    rest: {
      left_hip_pitch_joint: -0.14, right_hip_pitch_joint: -0.14,
      left_knee_joint: 0.30, right_knee_joint: 0.30,
      left_ankle_pitch_joint: -0.16, right_ankle_pitch_joint: -0.16,
      left_shoulder_pitch_joint: -0.16, right_shoulder_pitch_joint: -0.16,
      left_shoulder_roll_joint: 0.10, right_shoulder_roll_joint: -0.10,
      left_elbow_joint: -0.55, right_elbow_joint: -0.55,
      waist_pitch_joint: 0.04, head_pitch_joint: 0.06,
    },
  },

  /* Booster K1 — the kid of the shop, at the far end of the belt. 0.95m.
     Red, inherited from the T1 it replaces.

     The STLs carry no materials, so every palette decision here is made by
     name. The Trunk ships as two meshes — Trunk.STL plus K1logo.STL — and the
     logo is the accent, the same trick the Go2's base logo gets. */
  k1: {
    kind: 'urdf',
    urdfFile: K1 + 'K1_22dof.urdf',
    meshRoots: { K1, '': K1 },
    materialFor: (n, mtl, file) => {
      if (file && /logo/i.test(file)) return ACCENT;
      if (/^Head_2$/.test(n)) return ACCENT;
      return /Hip_|Ankle_|foot_link|hand_link|Shank/.test(n) ? INK : BONE;
    },
    weightFor: w([[/^Trunk$/, 2.0], [/^Head_[12]$/, 1.9], [/Shank|Hip_Pitch/, 1.3],
      [/^(Left|Right)_Arm_[123]$/, 1.2], [/foot_link|Ankle_Cross/, 0.75]]),
    tris: 56000,
    // eager and upright: knees barely bent, arms ready rather than loaded
    rest: {
      Left_Hip_Pitch: -0.22, Right_Hip_Pitch: -0.22,
      Left_Knee_Pitch: 0.46, Right_Knee_Pitch: 0.46,
      Left_Ankle_Pitch: -0.24, Right_Ankle_Pitch: -0.24,
      ALeft_Shoulder_Pitch: -0.30, ARight_Shoulder_Pitch: -0.30,
      Left_Shoulder_Roll: -1.28, Right_Shoulder_Roll: 1.28,
      Left_Elbow_Pitch: -0.34, Right_Elbow_Pitch: -0.34,
      AAHead_yaw: 0.06, Head_pitch: 0.10,
    },
  },

  go2: {
    kind: 'urdf',
    urdfFile: GO2 + 'urdf/go2_description.urdf',
    meshRoots: { go2_description: GO2 },
    // green field runner: the base shell logo is the accent
    materialFor: (n, mtl) => {
      if (mtl && /logo/i.test(mtl)) return ACCENT;
      if (mtl && /黑色/.test(mtl)) return INK;
      return /thigh|calf|foot/.test(n) ? INK : BONE;
    },
    weightFor: w([[/^base$/, 1.9], [/thigh/, 1.35], [/hip/, 1.15], [/foot/, 0.7]]),
    tris: 72000,
    // sentry rest pose: alert stance, front legs a touch straighter than rear
    rest: {
      FL_hip_joint: 0.04, RL_hip_joint: 0.04, FR_hip_joint: -0.04, RR_hip_joint: -0.04,
      FL_thigh_joint: 0.62, FR_thigh_joint: 0.62, RL_thigh_joint: 0.72, RR_thigh_joint: 0.72,
      FL_calf_joint: -1.3, FR_calf_joint: -1.3, RL_calf_joint: -1.42, RR_calf_joint: -1.42,
    },
  },

  z1: {
    kind: 'urdf',
    urdfFile: Z1 + 'xacro/z1.urdf',
    meshRoots: { z1_description: Z1 },
    // amber tool: the wrist/tool flange is the accent
    materialFor: (n) => (/link06/.test(n) ? ACCENT : /link04|link05/.test(n) ? INK : BONE),
    weightFor: w([[/link0[12]/, 1.7], [/link03/, 1.4], [/link06/, 1.3]]),
    tris: 52000,
    // mid-cycle: reaching out, wrist cocked
    rest: { joint1: 0.34, joint2: 0.62, joint3: -0.95, joint4: 0.42, joint5: 0.2, joint6: 0 },
  },
};

/**
 * Reduce the URDF joint tree to just the links that carry geometry.
 * Geometry-less links (rotors, IMU frames, the `world` anchor) are collapsed:
 * their fixed origins are composed into the surviving joint below them. A
 * collapsed link that carries a movable joint would lose motion, so that's an
 * error rather than a silent drop.
 */
function prune(links, joints) {
  const keep = new Set(Object.keys(links));
  const byChild = {};
  for (const j of joints) byChild[j.child] = j;
  const movable = (j) => /revolute|continuous|prismatic/.test(j.type);

  const out = [];
  for (const name of keep) {
    let j = byChild[name];
    if (!j) continue;                       // already a root
    const M = new THREE.Matrix4();
    let axis = j.axis, type = j.type, jname = j.name, lim = j.limit;
    // walk up through geometry-less parents, composing their origins
    M.multiply(mat4(j.xyz, j.rpy));
    let parent = j.parent;
    while (!keep.has(parent)) {
      const up = byChild[parent];
      if (!up) { parent = null; break; }    // reached a geometry-less root
      if (movable(up)) throw new Error(`collapsing movable joint ${up.name}`);
      M.premultiply(mat4(up.xyz, up.rpy));
      parent = up.parent;
    }
    if (!parent) continue;                  // this link becomes a root
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    M.decompose(pos, quat, scl);
    out.push({
      name: jname, parent, child: name, type, axis, limit: lim,
      pos: pos.toArray(), quat: quat.toArray(),
    });
  }
  return out;
}

function mat4(xyz, rpy) {
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(rpy[0], rpy[1], rpy[2], 'ZYX'));
  m.setPosition(xyz[0], xyz[1], xyz[2]);
  return m;
}

/**
 * Build one articulated character.
 * Returns { links: {name -> indexed geo}, joints, root, pivot, height } in the
 * source frame; pivot/height are measured at the rest pose, in Y-up.
 */
function build(name) {
  const s = SPECS[name];
  const t0 = Date.now();

  if (s.kind === 'glb') {
    const soup = assembleGLB(s.file, s.matForPrim);
    const srcTris = soup.positions.length / 9;

    /* The pond-bot GLB is a CAD export, and CAD is Z-up: measured, its bounds
       are 120 x 85.1 x 97 with min.z = 0 (it stands ON the z=0 plane), and its
       eye pupils sit at z = 86 of 97 while the chest disc sits at z = 36. So
       +Z is up and +Y is forward, exactly like the three URDFs.

       It used to be flagged `yUp: true` — "already Y-up, no fix needed" — which
       skipped the runtime's -90 X rotation. That laid the frog on its back with
       its face to the sky, and since the grounding only pushes the lowest
       point onto the deck, it grounded happily in that attitude and stayed
       there. It also meant `height` was measuring the 85mm DEPTH rather than
       the 97mm height, so the whole character was normalised off the wrong
       dimension.

       Bake a -90 Z rotation so +Y forward becomes +X forward. That puts the
       pond-bot in the same frame as everything else (URDF: +x forward, +z up),
       so it obeys INTERFACE.md's heading rule instead of needing its own. */
    if (s.zUpCad) {
      const p = soup.positions;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1];
        p[i] = y; p[i + 1] = -x;        // Rz(-90): (x,y,z) -> (y,-x,z)
      }
    }

    const geo = decimate(soup, s.tris);
    // bounds in the Y-up frame the runtime will see, same as the URDF path
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < geo.positions.length; i += 3) {
      v.set(geo.positions[i], geo.positions[i + 1], geo.positions[i + 2]);
      box.expandByPoint(s.zUpCad ? new THREE.Vector3(v.x, v.z, -v.y) : v.clone());
    }
    const c = box.getCenter(new THREE.Vector3());
    const out = {
      links: { body: geo }, joints: [], root: 'body',
      yUp: !s.zUpCad,
      pivot: [c.x, box.min.y, c.z],
      height: box.max.y - box.min.y,
      rest: {},
    };
    report(name, srcTris, out, t0);
    return out;
  }

  const { links, model } = assembleLinks(s);
  let srcTris = 0;
  for (const n of Object.keys(links)) srcTris += links[n].positions.length / 9;
  const geo = decimateLinks(links, s.tris, s.weightFor);
  const joints = prune(geo, model.joints);

  const childOf = new Set(joints.map((j) => j.child));
  const roots = Object.keys(geo).filter((n) => !childOf.has(n));
  if (roots.length !== 1) throw new Error(name + ': expected 1 root link, got ' + roots.join(','));

  // rest-pose bounds, expressed in the Y-up frame the runtime will see
  const world = forwardKinematics(model, s.rest || {});
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const n of Object.keys(geo)) {
    const p = geo[n].positions, W = world[n];
    for (let i = 0; i < p.length; i += 3) {
      v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(W);
      box.expandByPoint(new THREE.Vector3(v.x, v.z, -v.y));   // Z-up -> Y-up
    }
  }
  const c = box.getCenter(new THREE.Vector3());
  const out = {
    links: geo, joints, root: roots[0], yUp: false,
    pivot: [c.x, box.min.y, c.z],
    height: box.max.y - box.min.y,
    rest: s.rest || {},
  };
  report(name, srcTris, out, t0);
  return out;
}

function report(name, srcTris, out, t0) {
  let tris = 0, verts = 0;
  for (const n of Object.keys(out.links)) {
    tris += out.links[n].index.length / 3;
    verts += out.links[n].positions.length / 3;
  }
  const moving = out.joints.filter((j) => /revolute|continuous|prismatic/.test(j.type)).length;
  console.log(`${name.padEnd(9)} ${Object.keys(out.links).length} links, ${out.joints.length} joints (${moving} movable)  `
    + `src ${(srcTris / 1000).toFixed(0)}k -> ${tris} tris / ${verts} verts, h=${out.height.toFixed(2)}m, ${Date.now() - t0}ms`);
  out.stats = { tris, verts, moving, srcTris };
}

/**
 * Re-measure pivot/height over a set of poses (the whole work cycle, not just
 * the rest pose) so the character never sinks through its own ground contact
 * or drifts out of frame mid-loop. `fkFor` comes from preview.js.
 */
function measure(char, poses, fkFor, groundLinks) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const pose of poses) {
    const world = fkFor(char, pose);
    let dy = 0;
    if (groundLinks && groundLinks.length) {
      let lo = Infinity;
      for (const n of groundLinks) {
        const W = world[n];
        if (!W) continue;
        const p = new THREE.Vector3().setFromMatrixPosition(W);
        const y = char.yUp ? p.y : p.z;
        if (y < lo) lo = y;
      }
      if (lo !== Infinity) dy = -lo;
    }
    for (const n of Object.keys(char.links)) {
      const p = char.links[n].positions, W = world[n];
      for (let i = 0; i < p.length; i += 3) {
        v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(W);
        box.expandByPoint(char.yUp ? new THREE.Vector3(v.x, v.y + dy, v.z) : new THREE.Vector3(v.x, v.z + dy, -v.y));
      }
    }
  }
  const c = box.getCenter(new THREE.Vector3());
  char.pivot = [c.x, box.min.y, c.z];
  char.height = box.max.y - box.min.y;
  return char;
}

module.exports = { build, measure, SPECS, BONE, INK, ACCENT };
