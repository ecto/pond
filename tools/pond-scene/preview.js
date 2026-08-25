'use strict';
/* Offline preview of the stage. Renders the WHOLE composited frame through the
   same camera solve the runtime uses (stage.mjs) at a given viewport size, so
   what you check here is what the page shows. Also computes each character's
   swept screen-space extent over its full behaviour loop, props included,
   which is what guarantees nothing is ever cropped.

   usage:
     node preview.js stage           full-frame sheets at the test viewports
     node preview.js extents         swept-extent margins, as numbers
     node preview.js solo [robot]    per-character work-cycle sheets  */
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
const ORDER = ['pondbot', 'go2', 't1', 'z1'];
const VIEWPORTS = [[1280, 700], [1280, 1000], [1440, 1300], [1280, 1400]];

/* props: cheap primitives that make the work legible. Sizes are in the robot's
   own metres, in its own frame. Kept in sync with scene.js. */
const PROPS = {
  z1: { attach: 'link06', offset: [0.015, 0, 0], size: [0.07, 0.07, 0.07], mat: 0 },
  t1: { attach: 'hands', offset: [0.16, 0, -0.281], size: [0.18, 0.30, 0.50], mat: 1 },
};

function boxSoup(size, matId) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  return {
    positions: new Float32Array(g.attributes.position.array),
    index: new Uint32Array(g.index.array),
    matId: new Uint8Array(g.attributes.position.count).fill(matId),
  };
}

/* ---------------- forward kinematics over the built joint table ---------- */
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

/** how far to push the character down so its lowest planted link sits at y=0 */
function groundOffset(char, world, names) {
  if (!names || !names.length) return 0;
  let lo = Infinity;
  const p = new THREE.Vector3();
  for (const n of names) {
    const W = world[n];
    if (!W) continue;
    p.setFromMatrixPosition(W);
    const y = char.yUp ? p.y : p.z;      // Z-up sources: URDF z is scene y
    if (y < lo) lo = y;
  }
  return lo === Infinity ? 0 : -lo;
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

/* ---------------- the stage ---------------- */
async function buildStage(names) {
  const W = await import('./work.mjs');
  const S = await import('./stage.mjs');
  const cast = [];
  for (const key of (names || ORDER)) {
    const char = build(key);
    char.key = key;
    char.ground = W.GROUND[key] || [];
    char.act = W.WORK[key];
    char.period = W.PERIOD[key];
    char.entryEnd = W.ENTRY_END[key] || 0;

    // Normalise against the whole behaviour loop, with grounding applied.
    // Two passes: the gaits are authored in the robot's own metres, so the
    // poses depend on metres-per-stage-unit, which depends on the height the
    // first pass measures.
    let samples = [];
    const sample = (mps) => {
      const out = [];
      for (let i = 0; i < 48; i++) out.push(char.act(char.entryEnd + (i / 48) * char.period, { mps }).j || {});
      return out;
    };
    measure(char, sample(1), fk, char.ground);
    const mps0 = char.height / S.HEIGHT[key];
    samples = sample(mps0);
    measure(char, samples, fk, char.ground);

    // anchor x/z on the stance centre (mean of the planted links) so place.x is
    // where the character actually stands, not where its swept bbox happens to
    // centre. Bolted Z1 anchors on its base; pond-bot falls back to the bbox.
    const w0 = fk(char, samples[0]);
    if (char.ground.length) {
      const a = new THREE.Vector3(), p = new THREE.Vector3();
      let n = 0;
      for (const l of char.ground) { if (!w0[l]) continue; p.setFromMatrixPosition(w0[l]); a.add(char.yUp ? p : new THREE.Vector3(p.x, p.z, -p.y)); n++; }
      if (n) { a.multiplyScalar(1 / n); char.pivot[0] = a.x; char.pivot[2] = a.z; }
    }

    char.stageScale = S.HEIGHT[key] / char.height;
    char.mps = 1 / char.stageScale;          // metres per stage unit
    char.ctx = { mps: char.mps };

    // parked prop positions: captured in the character's own grounded frame,
    // the same thing Object3D.attach() leaves behind at runtime
    const P = PROPS[key];
    if (P) {
      char.parked = {};
      const at = (u) => {
        const pose = char.act(char.entryEnd + u * char.period, char.ctx).j || {};
        const world = fk(char, pose);
        const M = attachMatrix(char, P, world);
        if (!M) return null;
        const dy = groundOffset(char, world, char.ground);
        const q = new THREE.Vector3().setFromMatrixPosition(M);
        return M.clone().setPosition(q.x, q.y, char.yUp ? q.z : q.z + dy);
      };
      if (key === 'z1') { char.parked.src = at(W.Z1_GRASP_U - 0.001); char.parked.dst = at(W.Z1_RELEASE_U - 0.001); }
      if (key === 't1') char.parked.floor = at(W.T1_RELEASE_U - 0.001);
    }
    cast.push(char);
  }
  return { cast, W, S };
}

/** the character's model-to-stage matrix at time t, plus its state */
function placeMatrix(char, t) {
  const a = char.act(t, char.ctx);
  const world = fk(char, a.j || {});
  const dy = groundOffset(char, world, char.ground);
  const tilt = a.tilt || {};
  const rise = a.rise == null ? 1 : a.rise;

  const M = new THREE.Matrix4().makeTranslation(a.place.x, (a.lift || 0), a.place.z);
  M.multiply(new THREE.Matrix4().makeRotationY(a.place.yaw || 0));
  M.multiply(new THREE.Matrix4().makeRotationX(tilt.pitch || 0));
  M.multiply(new THREE.Matrix4().makeRotationZ(tilt.roll || 0));
  M.multiply(new THREE.Matrix4().makeScale(1, (a.squash || 1) * rise, 1));
  M.multiply(new THREE.Matrix4().makeScale(char.stageScale, char.stageScale, char.stageScale));
  M.multiply(new THREE.Matrix4().makeTranslation(-char.pivot[0], -char.pivot[1], -char.pivot[2]));
  M.multiply(new THREE.Matrix4().makeTranslation(0, dy, 0));
  if (!char.yUp) M.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  return { M, a, world, dy };
}

/** whole stage at time t -> one soup in stage coordinates */
function stageSoup(cast, t, opts = {}) {
  const pos = [], idx = [], mid = [];
  const v = new THREE.Vector3();
  const push = (soup, M, matOverride) => {
    const base = pos.length / 3;
    for (let i = 0; i < soup.positions.length; i += 3) {
      v.set(soup.positions[i], soup.positions[i + 1], soup.positions[i + 2]).applyMatrix4(M);
      pos.push(v.x, v.y, v.z);
      mid.push(matOverride == null ? soup.matId[i / 3] : matOverride);
    }
    for (let i = 0; i < soup.index.length; i++) idx.push(soup.index[i] + base);
  };

  // the payload only carries three palette slots per robot, so on a shared
  // stage each robot's accent is remapped to its own slot
  const slotOf = (char, m) => (m === 2 ? 2 + ORDER.indexOf(char.key) : m);
  for (const char of cast) {
    const { M, a, world } = placeMatrix(char, t);
    for (const [ln, geo] of Object.entries(char.links)) {
      const X = new THREE.Matrix4().multiplyMatrices(M, world[ln]);
      const base = pos.length / 3;
      for (let i = 0; i < geo.positions.length; i += 3) {
        v.set(geo.positions[i], geo.positions[i + 1], geo.positions[i + 2]).applyMatrix4(X);
        pos.push(v.x, v.y, v.z);
        mid.push(slotOf(char, geo.matId[i / 3]));
      }
      for (let i = 0; i < geo.index.length; i++) idx.push(geo.index[i] + base);
    }
    const P = PROPS[char.key];
    if (P && a.prop) {
      const local = a.prop.held ? attachMatrix(char, P, world)
        : (char.parked && char.parked[a.prop.park]) || null;
      if (local) push(boxSoup(P.size, P.mat), new THREE.Matrix4().multiplyMatrices(M, local), slotOf(char, P.mat));
    }
    // contact blob on the shared floor
    if (opts.blobs !== false) {
      const r = 0.34 * (char.stageScale * char.height);
      const g = new THREE.CircleGeometry(r, 18);
      const flat = new THREE.Matrix4().makeRotationX(-Math.PI / 2)
        .premultiply(new THREE.Matrix4().makeTranslation(a.place.x, 0.002, a.place.z));
      push({
        positions: new Float32Array(g.attributes.position.array),
        index: new Uint32Array(g.index.array),
        matId: new Uint8Array(g.attributes.position.count).fill(6),
      }, flat, 6);
    }
  }
  if (opts.floor) {
    const g = new THREE.PlaneGeometry(14, 14);
    const flat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const base = pos.length / 3;
    const arr = g.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(flat);
      pos.push(v.x, v.y, v.z); mid.push(7);
    }
    for (let i = 0; i < g.index.array.length; i++) idx.push(g.index.array[i] + base);
  }
  return { positions: new Float32Array(pos), index: new Uint32Array(idx), matId: new Uint8Array(mid) };
}

/* ---------------- swept screen extents ----------------
   Per sample, each link's local AABB corners are transformed to the stage and
   then projected; the union over the loop is the swept extent. Using AABB
   corners rather than every vertex is conservative (it can only over-estimate),
   which is the safe direction for a margin check. */
const DIRS = [];
for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
  if (a || b || c) DIRS.push([a, b, c]);
}
/* Per link, the vertices that are extreme along 26 directions. Far tighter
   than the link's AABB corners (a long diagonal link's box corners sit well
   outside its actual geometry) while still cheap and still an over-estimate,
   which is the safe direction for a margin check. */
function linkHull(char) {
  if (char._hull) return char._hull;
  const out = {};
  for (const [n, geo] of Object.entries(char.links)) {
    const p = geo.positions;
    const best = DIRS.map(() => ({ d: -Infinity, i: 0 }));
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < DIRS.length; k++) {
        const D = DIRS[k];
        const d = p[i] * D[0] + p[i + 1] * D[1] + p[i + 2] * D[2];
        if (d > best[k].d) { best[k].d = d; best[k].i = i; }
      }
    }
    const seen = new Set(), pts = [];
    for (const b of best) {
      if (seen.has(b.i)) continue;
      seen.add(b.i);
      pts.push(new THREE.Vector3(p[b.i], p[b.i + 1], p[b.i + 2]));
    }
    out[n] = pts;
  }
  char._hull = out;
  return out;
}
const CORNERS = [];
for (let i = 0; i < 8; i++) CORNERS.push([(i & 1) ? 'max' : 'min', (i & 2) ? 'max' : 'min', (i & 4) ? 'max' : 'min']);

function sweptExtent(char, cam, S, samples = 160) {
  const hull = linkHull(char);
  const ext = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const v = new THREE.Vector3();
  const add = (p) => {
    const s = S.project(p, cam);
    if (s.x < ext.x0) ext.x0 = s.x;
    if (s.x > ext.x1) ext.x1 = s.x;
    if (s.y < ext.y0) ext.y0 = s.y;
    if (s.y > ext.y1) ext.y1 = s.y;
  };
  // the loop only: the entrance is deliberately offstage
  for (let i = 0; i <= samples; i++) {
    const t = char.entryEnd + (i / samples) * char.period;
    const { M, a, world } = placeMatrix(char, t);
    for (const [n, pts] of Object.entries(hull)) {
      const L = new THREE.Matrix4().multiplyMatrices(M, world[n]);
      for (const q of pts) { v.copy(q).applyMatrix4(L); add(v); }
    }
    const P = PROPS[char.key];
    if (P && a.prop) {
      const local = a.prop.held ? attachMatrix(char, P, world)
        : (char.parked && char.parked[a.prop.park]) || null;
      if (local) {
        const L = new THREE.Matrix4().multiplyMatrices(M, local);
        for (const c of CORNERS) {
          v.set(c[0] === 'max' ? P.size[0] / 2 : -P.size[0] / 2,
            c[1] === 'max' ? P.size[1] / 2 : -P.size[1] / 2,
            c[2] === 'max' ? P.size[2] / 2 : -P.size[2] / 2).applyMatrix4(L);
          add(v);
        }
      }
    }
  }
  return ext;
}

/* Solve the constants stage.mjs needs.
   For a level camera, a swept point (x, z) lands at screen fraction
     sx = 0.5 + x / ((vh - 2*z*tanHalf) * aspect)
   so keeping it inside [m, 1-m] needs
     vh >= |x| / ((0.5-m)*aspect) + 2*z*tanHalf.
   Taking the worst |x| and the worst z over the whole cast gives two baked
   constants the runtime can apply with one max(), no FK required at load. */
async function solveConstants() {
  const { cast, S } = await buildStage();
  const tanHalf = Math.tan((S.FOV * Math.PI) / 180 / 2);
  // a generous provisional camera, only used to enumerate swept world points
  const probe = { vh: 8, vw: 8, dist: 8 / (2 * tanHalf), camY: 0, fov: S.FOV };
  let xmax = 0, zmax = -Infinity, ymax = -Infinity, ymin = Infinity;
  const v = new THREE.Vector3();
  for (const char of cast) {
    const hull = linkHull(char);
    for (let i = 0; i <= 200; i++) {
      const t = char.entryEnd + (i / 200) * char.period;
      const { M, a, world } = placeMatrix(char, t);
      const consider = (p) => {
        if (Math.abs(p.x) > xmax) xmax = Math.abs(p.x);
        if (p.z > zmax) zmax = p.z;
        if (p.y > ymax) ymax = p.y;
        if (p.y < ymin) ymin = p.y;
      };
      for (const [n, pts] of Object.entries(hull)) {
        const L = new THREE.Matrix4().multiplyMatrices(M, world[n]);
        for (const q of pts) { v.copy(q).applyMatrix4(L); consider(v); }
      }
      const P = PROPS[char.key];
      if (P && a.prop) {
        const local = a.prop.held ? attachMatrix(char, P, world) : (char.parked && char.parked[a.prop.park]) || null;
        if (local) {
          const L = new THREE.Matrix4().multiplyMatrices(M, local);
          for (const c of CORNERS) {
            v.set(c[0] === 'max' ? P.size[0] / 2 : -P.size[0] / 2,
              c[1] === 'max' ? P.size[1] / 2 : -P.size[1] / 2,
              c[2] === 'max' ? P.size[2] / 2 : -P.size[2] / 2).applyMatrix4(L);
            consider(v);
          }
        }
      }
    }
  }
  const m = S.MARGIN_FRAC;
  console.log(`\nswept world extents: |x| <= ${xmax.toFixed(3)}, z <= ${zmax.toFixed(3)}, y in [${ymin.toFixed(3)}, ${ymax.toFixed(3)}]`);
  console.log(`bake into stage.mjs:  X_MAX = ${xmax.toFixed(3)}   Z_MAX = ${zmax.toFixed(3)}`);
  for (const [vw, vh] of VIEWPORTS) {
    const a = vw / vh;
    const need = xmax / ((0.5 - m) * a) + 2 * zmax * tanHalf;
    console.log(`  ${vw}x${vh}  aspect ${a.toFixed(3)}  needs vh ${need.toFixed(2)}  (VH_BASE ${S.VH_BASE})  -> ${Math.max(S.VH_BASE, need).toFixed(2)}`);
  }
  // vertical check at the widest (most height-constrained) viewport
  const aWide = VIEWPORTS[0][0] / VIEWPORTS[0][1];
  const vhW = Math.max(S.VH_BASE, xmax / ((0.5 - m) * aWide) + 2 * zmax * tanHalf);
  const camY = (0.5 - S.FLOOR_FRAC) * vhW;
  const distW = vhW / (2 * tanHalf);
  const topFrac = 0.5 - (ymax - camY) / (2 * (distW - zmax) * tanHalf);
  console.log(`  tallest swept point lands ${(topFrac * 100).toFixed(1)}% from the top at the widest viewport`);
  return { xmax, zmax, ymax };
}

/* ---------------- entry points ---------------- */
async function stageSheets() {
  const { cast, S } = await buildStage();
  fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
  // times chosen to catch the roam extremes, where cropping would reappear
  const TIMES = [1.2, 9, 17, 26, 38, 52];
  const SC = 0.36;                            // render at a fraction of real pixels
  for (const [vw, vh] of VIEWPORTS) {
    const cam = S.cameraFor(vw / vh);
    const w = Math.round(vw * SC), h = Math.round(vh * SC);
    const sheet = Buffer.alloc(w * TIMES.length * h * 3, 255);
    TIMES.forEach((t, i) => {
      const soup = stageSoup(cast, t, { floor: false, blobs: true });
      const { img } = render(soup, {
        width: w, height: h, cam,
        colors: [PALETTE.bone, PALETTE.ink,
          PALETTE[ACCENT.pondbot], PALETTE[ACCENT.go2], PALETTE[ACCENT.t1], PALETTE[ACCENT.z1],
          [206, 209, 214], [236, 238, 242]],
      });
      // tint the copy's rectangle so a character sitting under it is obvious
      const K = S.keepOut(vw, vh);
      const kx0 = Math.round(K[0] * w), kx1 = Math.round(K[2] * w);
      const ky0 = Math.round(K[1] * h), ky1 = Math.round(K[3] * h);
      for (let y = ky0; y < ky1; y++) {
        for (let x = kx0; x < kx1; x++) {
          const o = (y * w + x) * 3;
          const edge = (y === ky0 || y === ky1 - 1 || x === kx0 || x === kx1 - 1);
          if (edge) { img[o] = 210; img[o + 1] = 120; img[o + 2] = 120; continue; }
          img[o] = (img[o] * 236) >> 8; img[o + 1] = (img[o + 1] * 246) >> 8; img[o + 2] = (img[o + 2] * 250) >> 8;
        }
      }
      for (let y = 0; y < h; y++) img.copy(sheet, (y * w * TIMES.length + i * w) * 3, y * w * 3, (y + 1) * w * 3);
    });
    const f = `preview/stage-${vw}x${vh}.png`;
    writePNG(path.join(__dirname, f), w * TIMES.length, h, sheet);
    console.log(`  -> ${f}  t = ${TIMES.join(' ')}`);
  }
}

/* how far a swept extent pokes into the copy's rectangle, as a fraction of the
   viewport. 0 means clear. */
function keepOutOverlap(e, K) {
  const w = Math.min(e.x1, K[2]) - Math.max(e.x0, K[0]);
  const h = Math.min(e.y1, K[3]) - Math.max(e.y0, K[1]);
  if (w <= 0 || h <= 0) return 0;
  // report the smaller of the two penetrations: that is how far the character
  // would have to move to be clear again
  return Math.min(w, h);
}

async function extents() {
  const { cast, S } = await buildStage();
  let worstEdge = Infinity, worstWho = '', worstHit = 0, hitWho = '';
  for (const [vw, vh] of VIEWPORTS) {
    const cam = S.cameraFor(vw / vh);
    const K = S.keepOut(vw, vh);
    console.log(`\n${vw}x${vh}  aspect ${(vw / vh).toFixed(3)}  vh ${cam.vh.toFixed(2)} vw ${cam.vw.toFixed(2)} `
      + `dist ${cam.dist.toFixed(2)} camY ${cam.camY.toFixed(2)}`);
    console.log(`  copy keep-out  x ${(K[0] * 100).toFixed(1)}..${(K[2] * 100).toFixed(1)}%  y ${(K[1] * 100).toFixed(1)}..${(K[3] * 100).toFixed(1)}%`);
    console.log('  character   left  right    top bottom  | edge  | copy');
    for (const char of cast) {
      const e = sweptExtent(char, cam, S);
      const min = Math.min(e.x0, 1 - e.x1, e.y0, 1 - e.y1);
      const hit = keepOutOverlap(e, K);
      if (min < worstEdge) { worstEdge = min; worstWho = `${char.key} @ ${vw}x${vh}`; }
      if (hit > worstHit) { worstHit = hit; hitWho = `${char.key} @ ${vw}x${vh}`; }
      console.log(`  ${char.key.padEnd(9)} ${(e.x0 * 100).toFixed(1).padStart(6)} ${((1 - e.x1) * 100).toFixed(1).padStart(6)} `
        + `${(e.y0 * 100).toFixed(1).padStart(6)} ${((1 - e.y1) * 100).toFixed(1).padStart(6)}  |`
        + `${(min * 100).toFixed(1).padStart(6)}%${min < 0 ? ' CROP' : '     '}|`
        + (hit > 0 ? ` ${(hit * 100).toFixed(1)}% UNDER COPY` : ' clear'));
    }
  }
  console.log(`\ntightest edge margin ${(worstEdge * 100).toFixed(1)}%  (${worstWho})`);
  console.log(worstHit > 0
    ? `WORST COPY OVERLAP ${(worstHit * 100).toFixed(1)}%  (${hitWho})`
    : 'copy keep-out: clear at every viewport and roam extreme');
  return { worstEdge, worstHit };
}

async function solo(only) {
  const names = only && only.length ? only : ORDER;
  const { cast } = await buildStage(names);
  fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
  const AZ = { go2: 62, t1: 30, z1: 45, pondbot: 74 };
  // absolute time windows, for looking closely at one beat (a walk, say)
  const SOLO_WINDOW = process.env.PONDWIN
    ? JSON.parse(process.env.PONDWIN) : {};
  const W = 380, H = 430, N = 5;
  for (const char of cast) {
    const row = Buffer.alloc(W * N * H * 3, 255);
    const win = SOLO_WINDOW[char.key];
    for (let i = 0; i < N; i++) {
      const t = win ? win[0] + ((i + 0.5) / N) * (win[1] - win[0])
        : char.entryEnd + ((i + 0.5) / N) * char.period;
      const { M, a, world } = placeMatrix(char, t);
      // strip the stage placement so the character fills the tile
      const local = new THREE.Matrix4().makeTranslation(-a.place.x, -(a.lift || 0), -a.place.z).multiply(M);
      const pos = [], idx = [], mid = [];
      const v = new THREE.Vector3();
      const push = (soup, X, mo) => {
        const base = pos.length / 3;
        for (let k = 0; k < soup.positions.length; k += 3) {
          v.set(soup.positions[k], soup.positions[k + 1], soup.positions[k + 2]).applyMatrix4(X);
          pos.push(v.x, v.y, v.z); mid.push(mo == null ? soup.matId[k / 3] : mo);
        }
        for (let k = 0; k < soup.index.length; k++) idx.push(soup.index[k] + base);
      };
      for (const [ln, geo] of Object.entries(char.links)) push(geo, new THREE.Matrix4().multiplyMatrices(local, world[ln]));
      const P = PROPS[char.key];
      if (P && a.prop) {
        const lm = a.prop.held ? attachMatrix(char, P, world) : (char.parked && char.parked[a.prop.park]) || null;
        if (lm) push(boxSoup(P.size, P.mat), new THREE.Matrix4().multiplyMatrices(local, lm), P.mat);
      }
      const g = new THREE.PlaneGeometry(3, 3);
      const flat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      const base = pos.length / 3;
      for (let k = 0; k < g.attributes.position.array.length; k += 3) {
        v.set(g.attributes.position.array[k], g.attributes.position.array[k + 1], g.attributes.position.array[k + 2]).applyMatrix4(flat);
        pos.push(v.x, v.y, v.z); mid.push(3);
      }
      for (let k = 0; k < g.index.array.length; k++) idx.push(g.index.array[k] + base);

      const { img } = render(
        { positions: new Float32Array(pos), index: new Uint32Array(idx), matId: new Uint8Array(mid) },
        { azimuth: AZ[char.key], elevation: 8, width: W, height: H, zoom: 1.2, colors: [PALETTE.bone, PALETTE.ink, PALETTE[ACCENT[char.key]], [220, 222, 226]] });
      for (let y = 0; y < H; y++) img.copy(row, (y * W * N + i * W) * 3, y * W * 3, (y + 1) * W * 3);
    }
    writePNG(path.join(__dirname, 'preview', char.key + '.png'), W * N, H, row);
    console.log('  -> preview/' + char.key + '.png');
  }
}

if (require.main === module) {
  const [mode, ...rest] = process.argv.slice(2);
  const run = mode === 'extents' ? extents() : mode === 'solve' ? solveConstants()
    : mode === 'solo' ? solo(rest) : stageSheets();
  run.catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { fk, groundOffset, attachMatrix, buildStage, stageSoup, placeMatrix, sweptExtent, PALETTE, ACCENT, PROPS, VIEWPORTS };
