'use strict';
/* Offline contact sheet: renders each character at N phases of its work cycle
   so the poses can be eyeballed without a browser. Same work.mjs the runtime
   uses, so what you see here is what ships.

   usage: node preview.js [robot ...]   ->  preview/<robot>.png + preview/all.png */
const fs = require('fs');
const path = require('path');
const THREE = require('three');
const { build, measure } = require('./build');
const { render, writePNG } = require('./raster');

const PALETTE = {
  bone: [0xef, 0xec, 0xe2],
  ink: [0x21, 0x23, 0x27],
  blue: [0x00, 0x00, 0xff],
  green: [0x2a, 0xa1, 0x3f],
  red: [0xcf, 0x33, 0x1e],
  amber: [0xf0, 0xad, 0x00],
};
const ACCENT = { pondbot: 'blue', go2: 'green', t1: 'red', z1: 'amber' };
const AZ = { go2: 62, t1: 30, z1: 45, pondbot: 74 };

/* ---- props: cheap primitives that make the work legible ---- */
const PROPS = {
  z1: { attach: 'link06', offset: [0.015, 0, 0], size: [0.07, 0.07, 0.07], mat: 0 },
  t1: { attach: 'hands', offset: [0.16, 0, -0.281], size: [0.18, 0.30, 0.50], mat: 1 },
};

function boxSoup(size, M, matId) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const p = g.attributes.position.array, idx = g.index.array;
  const out = [], v = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(M);
    out.push(v.x, v.y, v.z);
  }
  return { positions: new Float32Array(out), index: new Uint32Array(idx), matId: new Uint8Array(p.length / 3).fill(matId) };
}

/* ---- forward kinematics over the built joint table ---- */
function fk(char, pose) {
  const byChild = {};
  for (const j of char.joints) byChild[j.child] = j;
  const world = {};
  const of = (name) => {
    if (world[name]) return world[name];
    const j = byChild[name];
    if (!j) return (world[name] = new THREE.Matrix4());
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(j.pos),
      new THREE.Quaternion().fromArray(j.quat),
      new THREE.Vector3(1, 1, 1)
    );
    const q = pose[j.name] || 0;
    if (q && j.type !== 'fixed') {
      const ax = new THREE.Vector3().fromArray(j.axis).normalize();
      M.multiply(j.type === 'prismatic'
        ? new THREE.Matrix4().makeTranslation(ax.x * q, ax.y * q, ax.z * q)
        : new THREE.Matrix4().makeRotationAxis(ax, q));
    }
    return (world[name] = new THREE.Matrix4().multiplyMatrices(of(j.parent), M));
  };
  for (const n of Object.keys(char.links)) of(n);
  return world;
}

/** how far to push the character down so its lowest planted link is at y=0 */
function groundOffset(char, world, names) {
  if (!names || !names.length) return 0;
  let lo = Infinity;
  for (const n of names) {
    const W = world[n];
    if (!W) continue;
    const p = new THREE.Vector3().setFromMatrixPosition(W);
    const y = char.yUp ? p.y : p.z;      // Z-up sources: URDF z is scene y
    if (y < lo) lo = y;
  }
  return lo === Infinity ? 0 : -lo;
}

/** FK + flatten to one soup, in the Y-up scene frame, with the prop */
function poseSoup(name, char, work, ground) {
  const world = fk(char, work.j || {});
  const dy = groundOffset(char, world, char._ground);
  const zfix = char.yUp ? new THREE.Matrix4() : new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const pos = [], idx = [], mid = [];
  const v = new THREE.Vector3();

  const push = (soup, M, yOff) => {
    const base = pos.length / 3;
    const F = new THREE.Matrix4().multiplyMatrices(zfix, M);
    for (let i = 0; i < soup.positions.length; i += 3) {
      v.set(soup.positions[i], soup.positions[i + 1], soup.positions[i + 2]).applyMatrix4(F);
      pos.push(v.x, v.y + (yOff || 0), v.z);
      mid.push(soup.matId[i / 3]);
    }
    for (let i = 0; i < soup.index.length; i++) idx.push(soup.index[i] + base);
  };

  for (const [ln, geo] of Object.entries(char.links)) push(geo, world[ln], dy);

  const P = PROPS[name];
  if (P && work.prop) {
    const M = propMatrix(name, char, P, work, world);
    // held props ride with the (grounded) character; parked ones are already
    // stored in grounded space, so they must NOT take the current offset
    if (M) push(boxSoup(P.size, new THREE.Matrix4(), P.mat), M, work.prop.held ? dy : 0);
  }

  // character-level body transform (what the runtime puts on the holder)
  const B = work.body || {};
  if (B.yaw || B.pitch || B.roll || B.lift || B.squash) {
    const cx = char.pivot ? char.pivot[0] : 0;
    const cy = (char.pivot ? char.pivot[1] : 0) + char.height * 0.5;
    const cz = char.pivot ? char.pivot[2] : 0;
    const M = new THREE.Matrix4()
      .makeTranslation(cx, cy + (B.lift || 0) * char.height, cz)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(B.pitch || 0, B.yaw || 0, B.roll || 0, 'YXZ')))
      .multiply(new THREE.Matrix4().makeScale(1, B.squash || 1, 1))
      .multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
    const t = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      t.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(M);
      pos[i] = t.x; pos[i + 1] = t.y; pos[i + 2] = t.z;
    }
  }

  // a ground slab at the measured contact height, so "floating" is obvious
  if (ground != null) {
    const s = Math.max(0.4, char.height * 1.3);
    const slab = boxSoup([s, 0.004, s], new THREE.Matrix4(), 3);
    const base = pos.length / 3;
    for (let i = 0; i < slab.positions.length; i += 3) {
      pos.push(slab.positions[i], slab.positions[i + 1] + ground, slab.positions[i + 2]);
      mid.push(3);
    }
    for (let i = 0; i < slab.index.length; i++) idx.push(slab.index[i] + base);
  }
  return { positions: new Float32Array(pos), index: new Uint32Array(idx), matId: new Uint8Array(mid) };
}

/** where the prop sits right now (held = on the character, parked = frozen) */
function propMatrix(name, char, P, work, world) {
  if (work.prop.held) return attachMatrix(char, P, world);
  const parked = char._parked && char._parked[work.prop.park || 'floor'];
  return parked || null;
}

function attachMatrix(char, P, world) {
  const off = new THREE.Matrix4().makeTranslation(P.offset[0], P.offset[1], P.offset[2]);
  if (P.attach === 'hands') {
    const L = world.left_hand_link, R = world.right_hand_link;
    if (!L || !R) return null;
    const a = new THREE.Vector3().setFromMatrixPosition(L);
    const b = new THREE.Vector3().setFromMatrixPosition(R);
    const M = new THREE.Matrix4().copy(world.Trunk || new THREE.Matrix4());
    M.setPosition(a.add(b).multiplyScalar(0.5));
    return M.multiply(off);
  }
  const W = world[P.attach];
  return W ? new THREE.Matrix4().multiplyMatrices(W, off) : null;
}

/* Freeze the parked prop positions once, by sampling the cycle at the grasp
   and release beats — same trick the runtime does with Object3D.attach(). */
async function parkProps(name, char, WORKMOD) {
  const P = PROPS[name];
  if (!P) return;
  const w = WORKMOD.WORK[name], T = WORKMOD.PERIOD[name];
  // capture in grounded space, exactly where the runtime's attach() leaves it
  const at = (u) => {
    const world = fk(char, w(u * T).j || {});
    const M = attachMatrix(char, P, world);
    if (!M) return null;
    const dy = groundOffset(char, world, char._ground);
    const p = new THREE.Vector3().setFromMatrixPosition(M);
    return M.clone().setPosition(p.x, p.y, p.z + dy);   // source frame is Z-up
  };
  char._parked = {};
  if (name === 'z1') {
    char._parked.src = at(WORKMOD.Z1_GRASP_U - 0.001);
    char._parked.dst = at(WORKMOD.Z1_RELEASE_U - 0.001);
    // the second half of the cycle parks it at the far spot; the mirrored
    // cycle is handled at runtime, the sheet only needs one pass
  } else if (name === 't1') {
    char._parked.floor = at(WORKMOD.T1_RELEASE_U - 0.001);
  }
}

async function main() {
  const WORKMOD = await import('./work.mjs');
  const only = process.argv.slice(2);
  const names = only.length ? only : ['pondbot', 'go2', 't1', 'z1'];
  const PHASES_FOR = {
    // land the Go2 sheet on its step-in-place beats, not between them
    go2: [0.02, 0.21, 0.34, 0.47, 0.71],
    z1: [0.05, 0.24, 0.44, 0.62, 0.80],
    t1: [0.10, 0.43, 0.56, 0.66, 0.79],
    pondbot: [0.02, 0.16, 0.30, 0.55, 0.85],
  };
  const W = 380, H = 430, NPH = 5;
  fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });

  const rows = [];
  for (const name of names) {
    const char = build(name);
    const work0 = WORKMOD.WORK[name], T0 = WORKMOD.PERIOD[name];
    const samples = [];
    for (let i = 0; i < 32; i++) samples.push(work0((i / 32) * T0).j || {});
    char._ground = WORKMOD.GROUND[name] || [];
    measure(char, samples, fk, char._ground);
    await parkProps(name, char, WORKMOD);
    const work = WORKMOD.WORK[name], T = WORKMOD.PERIOD[name];
    const PHASES = PHASES_FOR[name] || [0.05, 0.24, 0.44, 0.62, 0.80];
    const colors = [PALETTE.bone, PALETTE.ink, PALETTE[ACCENT[name]], [214, 216, 220]];
    const row = Buffer.alloc(W * NPH * H * 3, 255);
    PHASES.forEach((u, i) => {
      const soup = poseSoup(name, char, work(u * T), char.pivot[1]);
      const { img } = render(soup, { azimuth: AZ[name], elevation: 8, width: W, height: H, zoom: 1.18, colors });
      for (let y = 0; y < H; y++) img.copy(row, (y * W * NPH + i * W) * 3, y * W * 3, (y + 1) * W * 3);
    });
    writePNG(path.join(__dirname, 'preview', name + '.png'), W * NPH, H, row);
    rows.push(row);
    console.log('  -> preview/' + name + '.png  phases ' + PHASES.join(' '));
  }

  const all = Buffer.concat(rows);
  writePNG(path.join(__dirname, 'preview', 'all.png'), W * NPH, H * rows.length, all);
  console.log('  -> preview/all.png');
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { fk, poseSoup, groundOffset, PALETTE, ACCENT, PROPS, attachMatrix };
