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
const ACCENT = { h2: 'blue', k1: 'red', go2: 'green', z1: 'amber' };
const ORDER = ['h2', 'k1', 'go2', 'z1'];
/* stage.mjs's HEIGHT, cached at buildStage time. The runtime scales a
   reaction's posY by the character's stage height, so the preview needs it
   outside the async builder. */
const STAGE_HEIGHT = {};
/* anim/world.mjs — the score. Loaded by buildStage(), which is async; every
   consumer of the cube runs after it. */
let W_ = null;
const VIEWPORTS = [[1280, 700], [1280, 1000], [1440, 1300], [1280, 1400]];

/* THE CUBE. One prop for the whole cast; its owner is a function of the master
   clock (anim/world.mjs). Kept in sync with scene.js by construction — both
   read CARRY from the same module and place the cube the same way. */
function boxSoup(size, matId) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  return {
    positions: new Float32Array(g.attributes.position.array),
    index: new Uint32Array(g.index.array),
    matId: new Uint8Array(g.attributes.position.count).fill(matId),
  };
}

/* ---------------- forward kinematics over the built joint table ----------
   Joint limits are applied here exactly as scene.js applies them, so an offline
   render can never show a pose the browser cannot actually reach. It could,
   once: the Z1's keyposes were authored outside joint3's limit and every
   preview happily drew an arm the runtime was quietly folding flat. */
function clampPose(char, pose) {
  if (!char._lim) {
    char._lim = {};
    for (const j of char.joints) if (j.limit) char._lim[j.name] = j.limit;
  }
  let out = pose;
  for (const k of Object.keys(pose)) {
    const L = char._lim[k];
    if (!L) continue;
    const v = pose[k];
    if (v < L[0] || v > L[1]) {
      if (out === pose) out = { ...pose };
      out[k] = v < L[0] ? L[0] : L[1];
    }
  }
  return out;
}

function fk(char, pose) {
  pose = clampPose(char, pose);
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

/** the world matrix of the node the cube rides on, in the character's own frame */
function carryNodeMatrix(char, world, C) {
  if (C.node !== 'hands') return world[C.node] || null;
  // the T1's carry node is the midpoint of its two hand links, in the trunk's
  // orientation — exactly what scene.js pins every frame
  const L = world.left_hand_link, R = world.right_hand_link;
  if (!L || !R) return null;
  const a = new THREE.Vector3().setFromMatrixPosition(L);
  const b = new THREE.Vector3().setFromMatrixPosition(R);
  // the midpoint has a position but no rotation of its own, so it borrows the
  // torso's — and the two humanoids call that link different things (C.frame)
  const M = new THREE.Matrix4().copy(world[C.frame] || world.Trunk || new THREE.Matrix4());
  return M.setPosition(a.add(b).multiplyScalar(0.5));
}

/** the cube's stage matrix at time t: on its owner, or parked on a pallet.
    Mirrors scene.js placeCube() — decompose the attach node's world matrix,
    DROP its scale (the pond-bot's is 0.001), apply the offset in metres. */
const _cp = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3();
function cubeMatrix(cast, t) {
  const h = W_.holderAt(t);
  /* the belt owns the cube exactly like a character does, but it is a prop
     rather than a body: its position is a pure function of the score, with no
     transform chain and no grounding involved. */
  if (h === 'belt') {
    const p = W_.beltPoint(W_.beltProgress(t));
    return new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
  }
  const char = h && cast.find((c) => c.key === h);
  const C = h && W_.CARRY[h];
  if (!char || !C) {
    const p = W_.parkedCube(t);
    return new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
  }
  const pm = placeMatrix(char, t);
  const nodeM = carryNodeMatrix(char, pm.world, C);
  if (!nodeM) return null;
  new THREE.Matrix4().multiplyMatrices(pm.M, nodeM).decompose(_cp, _cq, _cs);
  const off = new THREE.Vector3(C.offset[0], C.offset[1], C.offset[2]).applyQuaternion(_cq);
  return new THREE.Matrix4().compose(_cp.clone().add(off), _cq.clone(), new THREE.Vector3(1, 1, 1));
}

/** the cube's eight corners at time t, pushed through `fn` */
function cubeCorners(cast, t, fn) {
  const M = cubeMatrix(cast, t);
  if (!M) return;
  const v = new THREE.Vector3(), h = W_.CUBE / 2;
  for (const c of CORNERS) {
    v.set(c[0] === 'max' ? h : -h, c[1] === 'max' ? h : -h, c[2] === 'max' ? h : -h).applyMatrix4(M);
    fn(v);
  }
}

/* ---------------- the stage ---------------- */
async function buildStage(names) {
  const W = await import('./anim/index.mjs');
  const S = await import('./stage.mjs');
  W_ = await import('./anim/world.mjs');
  const cast = [];
  for (const key of (names || ORDER)) {
    const char = build(key);
    char.key = key;
    char.ground = W.GROUND[key] || [];
    char.mounted = !!(W.MOUNTED && W.MOUNTED[key]);
    char.act = W.WORK[key];
    char.period = W.PERIOD[key];
    char.entryEnd = W.ENTRY_END[key] || 0;

    /* Measure the whole behaviour loop with grounding applied.

       This used to need two passes: metres-per-stage-unit was derived from the
       character's measured height (because every character was normalised to a
       common on-screen size), but the poses depend on mps, so the first pass
       had to bootstrap it. At TRUE scale mps is just 1 / MODEL_SCALE — a
       constant known before anything is measured — so the bootstrap pass is
       gone and the poses sampled here are the poses that ship. */
    const mps0 = 1 / S.MODEL_SCALE[key];
    const sample = (mps) => {
      const out = [];
      for (let i = 0; i < 48; i++) out.push(char.act(char.entryEnd + (i / 48) * char.period, { mps }).j || {});
      return out;
    };
    const samples = sample(mps0);
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

    STAGE_HEIGHT[key] = S.HEIGHT[key];
    // TRUE SCALE: source units -> metres, and one stage unit IS one metre
    char.halfWidth = (W.ROAM[key] || {}).halfWidth;
    char.stageScale = S.MODEL_SCALE[key];
    char.mps = 1 / char.stageScale;          // metres per stage unit
    char.ctx = { mps: char.mps };

    cast.push(char);
  }
  return { cast, W, S };
}

/** shift-frame -> model frame: the grounding push plus the Z-up rotation.
    Mirrors the `gnd` and `zup` nodes scene.js hangs under `shift`. */
function shiftToModel(char, dy) {
  const M = new THREE.Matrix4().makeTranslation(0, dy, 0);
  if (!char.yUp) M.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  return M;
}

/* The runtime's per-frame body channel, reproduced exactly (scene.js render()).
   The work loop's tilt/squash seed it; a live reaction's nudge then REPLACES
   rotX/rotZ/posY/sclX/sclY and ADDS rotY, and the whole channel is dropped the
   instant the reaction expires. Modelling this offline is the only way a
   jointless character's reactions are visible at all in the preview. */
function bodyChannel(char, a, react) {
  const tl = a.tilt || {};
  const body = {
    rot: { x: tl.pitch || 0, y: 0, z: tl.roll || 0 },
    pos: { y: 0 },
    scl: { x: 1, y: a.squash || 1 },
  };
  if (react && react.R && react.R.body && react.t < 1) react.R.body(body, react.t, react.dir == null ? 1 : react.dir);
  return body;
}

/** the character's model-to-stage matrix at time t, plus its state.
    opts.at    overrides the floor position, for sweeping a whole roam box
    opts.react { R, t, dir } a reaction layered the way the runtime layers it */
function placeMatrix(char, t, opts) {
  const o = opts == null ? {} : (opts.x !== undefined || opts.z !== undefined ? { at: opts } : opts);
  const at = o.at;
  const a = char.act(t, char.ctx);
  if (at) a.place = { x: at.x, z: at.z, yaw: a.place.yaw };
  const react = o.react;
  const jr = react && react.R && react.R.joints ? react.R.joints(react.t, react.dir == null ? 1 : react.dir) : null;
  const j = { ...(a.j || {}) };
  if (jr && react.t < 1) for (const k of Object.keys(jr)) j[k] = (j[k] || 0) + jr[k];
  const world = fk(char, j);
  const dy = groundOffset(char, world, char.ground);
  const rise = a.rise == null ? 1 : a.rise;
  const body = bodyChannel(char, a, react);
  const HEIGHT_K = STAGE_HEIGHT[char.key] == null ? 1 : STAGE_HEIGHT[char.key];

  const M = new THREE.Matrix4().makeTranslation(
    a.place.x, (a.lift || 0) + body.pos.y * HEIGHT_K, a.place.z);
  M.multiply(new THREE.Matrix4().makeRotationY((a.place.yaw || 0) + body.rot.y));
  M.multiply(new THREE.Matrix4().makeRotationX(body.rot.x));
  M.multiply(new THREE.Matrix4().makeRotationZ(body.rot.z));
  M.multiply(new THREE.Matrix4().makeScale(body.scl.x, body.scl.y * rise, body.scl.x));
  M.multiply(new THREE.Matrix4().makeScale(char.stageScale, char.stageScale, char.stageScale));
  M.multiply(new THREE.Matrix4().makeTranslation(-char.pivot[0], -char.pivot[1], -char.pivot[2]));
  // everything up to here is scene.js's `shift`; a parked prop hangs off it
  const Mshift = M.clone();
  M.multiply(shiftToModel(char, dy));
  return { M, Mshift, a, world, dy, body, j };
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

  /* one cube for the cast, wherever the score says it is, plus the two pallets
     it rests on. Drawn once for the stage rather than once per character. */
  const CM = cubeMatrix(cast, t);
  /* Pond blue. This used to index ORDER by a character that no longer exists,
     which returned -1 and quietly drew the cube in ink — the one object the
     whole scene is about, rendered as a dark speck. */
  if (CM) push(boxSoup([W_.CUBE, W_.CUBE, W_.CUBE], 2), CM, 2 + ORDER.indexOf('h2'));
  for (const [n, D] of [['z1Pallet', W_.PALLET], ['k1Bench', W_.BENCH], ['z1', W_.PLINTH]]) {
    const st = W_.STATIONS[n];
    push(boxSoup([D.w, D.h, D.d], 0), new THREE.Matrix4().makeTranslation(st.x, D.h / 2, st.z), 0);
  }
  /* the conveyor. It is set dressing to the animation system — nothing is
     parented to it — but it has to be DRAWN, or the sheets show a cube gliding
     through mid-air and the whole point of the beat is invisible. */
  {
    const B = W_.BELT;
    const dx = B.tail.x - B.head.x, dz = B.tail.z - B.head.z;
    const M = new THREE.Matrix4()
      .makeTranslation((B.head.x + B.tail.x) / 2, B.y / 2, (B.head.z + B.tail.z) / 2)
      .multiply(new THREE.Matrix4().makeRotationY(Math.atan2(-dz, dx)));
    push(boxSoup([B.len, B.y, B.w], 0), M, 0);
  }
  for (const char of cast) {
    const pm = placeMatrix(char, t);
    const { M, a, world } = pm;
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
    // contact blob on the shared floor
    if (opts.blobs !== false) {
      const r = 0.75 * (char.halfWidth || 0.3);   // footprint, not height
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

/**
 * The extent of everything the character could ever cover, given that shared
 * code clamps it into its roam box: its pose cycle evaluated at every corner
 * and the centre of the box. Any waypoint a specialist picks inside the box is
 * inside this, so the composition invariants hold for ANY choreography they
 * write — which is what makes four people editing four files in parallel safe.
 */
function roamBoxExtent(char, cam, S, roam, samples = 48) {
  const box = roam.work || roam;
  const spots = [];
  const zs = [box.z[0], (box.z[0] + box.z[1]) / 2, box.z[1]];
  for (const z of zs) {
    const [lo, hi] = S.worldXRange(box.sx[0], box.sx[1], z);
    for (const x of [lo, (lo + hi) / 2, hi]) spots.push({ x, z });
  }
  const hull = linkHull(char);
  const ext = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const v = new THREE.Vector3();
  const add = (p) => {
    const q = S.project(p, cam);
    if (q.x < ext.x0) ext.x0 = q.x;
    if (q.x > ext.x1) ext.x1 = q.x;
    if (q.y < ext.y0) ext.y0 = q.y;
    if (q.y > ext.y1) ext.y1 = q.y;
  };
  for (const at of spots) {
    for (let i = 0; i <= samples; i++) {
      const t = char.entryEnd + (i / samples) * char.period;
      const pm = placeMatrix(char, t, at);
      const { M, a, world } = pm;
      for (const [n, pts] of Object.entries(hull)) {
        const L = new THREE.Matrix4().multiplyMatrices(M, world[n]);
        for (const q of pts) { v.copy(q).applyMatrix4(L); add(v); }
      }
      // whoever is holding the cube sweeps it too
      if (W_.holderAt(t) === char.key) cubeCorners([char], t, add);
    }
  }
  return ext;
}

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
    const pm = placeMatrix(char, t);
    const { M, a, world } = pm;
    for (const [n, pts] of Object.entries(hull)) {
      const L = new THREE.Matrix4().multiplyMatrices(M, world[n]);
      for (const q of pts) { v.copy(q).applyMatrix4(L); add(v); }
    }
    if (W_.holderAt(t) === char.key) cubeCorners([char], t, add);
  }
  return ext;
}

/* The copy keep-out, tested PER FRAME rather than against the swept box.

   The swept AABB is the right tool for the frame edges — a character must never
   leave the frame at any moment, and the union of every moment answers that
   exactly. It is the wrong tool for the copy column once a character
   TRAVERSES. The pond-bot is high in the frame when it is up at the humanoid's
   bench, and it is horizontally inside the column when it is down in the
   corridor, and those are different seconds; union them into one box and the
   box straddles the copy even though the character never does.

   So this walks the loop and asks the question the constraint actually asks:
   at this instant, does this character's silhouette touch the copy? For a
   character that stands still the answer is identical to the swept test. For
   the one that crosses under the words it is the difference between a false
   failure and the truth. */
function copyHit(char, cam, S, K, samples = 400) {
  const hull = linkHull(char);
  const v = new THREE.Vector3();
  let worst = 0;
  for (let i = 0; i <= samples; i++) {
    const t = char.entryEnd + (i / samples) * char.period;
    const pm = placeMatrix(char, t);
    const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    const add = (p) => {
      const q = S.project(p, cam);
      if (q.x < e.x0) e.x0 = q.x;
      if (q.x > e.x1) e.x1 = q.x;
      if (q.y < e.y0) e.y0 = q.y;
      if (q.y > e.y1) e.y1 = q.y;
    };
    for (const [n, pts] of Object.entries(hull)) {
      const L = new THREE.Matrix4().multiplyMatrices(pm.M, pm.world[n]);
      for (const q of pts) { v.copy(q).applyMatrix4(L); add(v); }
    }
    if (W_.holderAt(t) === char.key) cubeCorners([char], t, add);
    const ow = Math.min(e.x1, K[2]) - Math.max(e.x0, K[0]);
    const oh = Math.min(e.y1, K[3]) - Math.max(e.y0, K[1]);
    const hit = (ow > 0 && oh > 0) ? Math.min(ow, oh) : 0;
    if (hit > worst) worst = hit;
  }
  return worst;
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
      const pm = placeMatrix(char, t);
      const { M, a, world } = pm;
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
      if (W_.holderAt(t) === char.key) cubeCorners([char], t, consider);
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

/**
 * Grow each character's roam box as far as it can go while the whole box still
 * satisfies the composition invariants at every viewport. The result is the
 * movement budget a character specialist may place waypoints inside without
 * having to think about the layout at all.
 */
async function solveRoam() {
  const { cast, S } = await buildStage();
  const A = await import('./anim/index.mjs');
  const cams = VIEWPORTS.map(([vw, vh]) => ({ vw, vh, cam: S.cameraFor(vw / vh), K: S.keepOut(vw, vh) }));

  const ok = (char, box) => {
    for (const { cam, K } of cams) {
      const e = roamBoxExtent(char, cam, S, { work: box }, 32);
      const al = S.edgeAllowance(char.key, e.x1 - e.x0);
      const slack = Math.min(e.x0 - al.left, (1 - e.x1) - al.right, e.y0 - al.top, (1 - e.y1) - al.bottom);
      const ow = Math.min(e.x1, K[2]) - Math.max(e.x0, K[0]);
      const oh = Math.min(e.y1, K[3]) - Math.max(e.y0, K[1]);
      if (slack < 0.005 || (ow > 0 && oh > 0)) return false;
    }
    return true;
  };

  console.log('\nmaximal safe roam boxes (paste into each character module):\n');
  for (const char of cast) {
    // start from the character's own waypoints, then grow each edge as far as
    // the invariants allow
    const seed = A.ROAM[char.key].work;
    let box = { sx: [...seed.sx], z: [...seed.z] };
    const edges = [['sx', 0, -1], ['sx', 1, +1], ['z', 0, -1], ['z', 1, +1]];
    const scale = { sx: 0.20, z: 0.40 };
    for (const [axis, idx, dir] of edges) {
      let step = scale[axis];
      for (let i = 0; i < 11; i++) {
        const b = { sx: [...box.sx], z: [...box.z] };
        b[axis][idx] += dir * step;
        if (b.sx[0] < b.sx[1] && b.z[0] < b.z[1] && ok(char, b)) box = b; else step /= 2;
      }
    }
    const f = (v) => v.toFixed(3);
    const grew = (a, b) => ((b - a) >= 0 ? '+' : '') + (b - a).toFixed(3);
    console.log(`  ${char.key.padEnd(9)} work: { sx: [${f(box.sx[0])}, ${f(box.sx[1])}], z: [${f(box.z[0])}, ${f(box.z[1])}] }`);
    console.log(`  ${' '.repeat(9)} room beyond today's waypoints: sx ${grew(seed.sx[0], box.sx[0])} / ${grew(seed.sx[1], box.sx[1])}`
      + `, z ${grew(seed.z[0], box.z[0])} / ${grew(seed.z[1], box.z[1])}`
      + `   ${ok(char, seed) ? '' : '(SEED ITSELF FAILS)'}`);
  }
}

/* ---------------- one character, end to end ----------------
   Entrance, work cycle and every reaction, on a ground slab, written wherever
   the caller asks. Four specialists run this in parallel, so the output
   directory is a parameter and never a fixed path. */
async function character(name, outDir) {
  if (!CHARACTERS_OK.includes(name)) throw new Error(`unknown character "${name}" (try ${CHARACTERS_OK.join(', ')})`);
  const { cast } = await buildStage([name]);
  const A = await import('./anim/index.mjs');
  const char = cast[0];
  const dir = path.resolve(outDir || path.join(__dirname, 'preview', name));
  fs.mkdirSync(dir, { recursive: true });
  const AZ = { go2: 62, t1: 30, z1: 45, pondbot: 74 };
  const W = 380, H = 430;
  const colors = [PALETTE.bone, PALETTE.ink, PALETTE[ACCENT[name]], [220, 222, 226]];

  const sheet = (file, frames) => {
    const row = Buffer.alloc(W * frames.length * H * 3, 255);
    frames.forEach((f, i) => {
      const { img } = render(f, { azimuth: AZ[name], elevation: 8, width: W, height: H, zoom: 1.2, colors });
      for (let y = 0; y < H; y++) img.copy(row, (y * W * frames.length + i * W) * 3, y * W * 3, (y + 1) * W * 3);
    });
    writePNG(path.join(dir, file), W * frames.length, H, row);
    console.log('  -> ' + path.join(dir, file));
  };

  /* one tile: the character alone, with the stage placement stripped so it
     fills the frame, on a slab at its own contact height */
  const tile = (t, react) => {
    // the reaction goes THROUGH placeMatrix, so its body nudge (lean, hop and
    // squash) is composed exactly as the runtime composes it — not just its
    // joint deltas. A jointless character is all nudge and nothing else.
    const pm = placeMatrix(char, t, { react });
    const { M, a, world } = pm;
    const strip = new THREE.Matrix4().makeTranslation(-a.place.x, -(a.lift || 0), -a.place.z);
    const local = strip.clone().multiply(M);
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
    const world2 = world;   // placeMatrix already folded the reaction's joints in
    for (const [ln, geo] of Object.entries(char.links)) push(geo, new THREE.Matrix4().multiplyMatrices(local, world2[ln]));
    if (W_.holderAt(t) === name) {
      const lm = cubeMatrix([char], t);
      if (lm) push(boxSoup([W_.CUBE, W_.CUBE, W_.CUBE], 2), strip.clone().multiply(lm), 2);
    }
    const g = new THREE.PlaneGeometry(3, 3);
    const flat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const base = pos.length / 3;
    const arr = g.attributes.position.array;
    for (let k = 0; k < arr.length; k += 3) {
      v.set(arr[k], arr[k + 1], arr[k + 2]).applyMatrix4(flat);
      pos.push(v.x, v.y, v.z); mid.push(3);
    }
    for (let k = 0; k < g.index.array.length; k++) idx.push(g.index.array[k] + base);
    return { positions: new Float32Array(pos), index: new Uint32Array(idx), matId: new Uint8Array(mid) };
  };

  const N = 6;
  sheet('entrance.png', Array.from({ length: N }, (_, i) => tile((i / (N - 1)) * char.entryEnd)));
  sheet('work.png', Array.from({ length: N }, (_, i) => tile(char.entryEnd + ((i + 0.5) / N) * char.period)));
  for (const R of A.REACTIONS_BY_KEY[name]) {
    const t0 = char.entryEnd + 0.25 * char.period;
    sheet(`reaction-${R.name}.png`, Array.from({ length: N }, (_, i) => tile(t0, { R, t: i / (N - 1) })));
  }
  console.log(`\n  ${name}: entrance ${char.entryEnd.toFixed(1)}s, work loop ${char.period.toFixed(1)}s, `
    + `${A.REACTIONS_BY_KEY[name].length} reactions`);
}
const CHARACTERS_OK = ORDER;

/* ---------------- entry points ---------------- */
async function stageSheets() {
  const { cast, S } = await buildStage();
  fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
  // times chosen to catch the roam extremes, where cropping would reappear
  /* The ten moments the whole thing turns on: one frame either side of each
     handoff is what a reader needs to believe the cube changed hands. Sampled
     on the third circuit so every entrance is finished. */
  const TIMES = (process.env.PONDTIMES ? JSON.parse(process.env.PONDTIMES)
    : [1.2, 9, 17, 26, 38, 52]);
  const SC = process.env.PONDSC ? Number(process.env.PONDSC) : 0.36;
  for (const [vw, vh] of VIEWPORTS) {
    const cam = S.cameraFor(vw / vh);
    const w = Math.round(vw * SC), h = Math.round(vh * SC);
    const sheet = Buffer.alloc(w * TIMES.length * h * 3, 255);
    TIMES.forEach((t, i) => {
      const soup = stageSoup(cast, t, { floor: false, blobs: true });
      const { img } = render(soup, {
        width: w, height: h, cam,
        colors: [PALETTE.bone, PALETTE.ink,
          PALETTE[ACCENT.h2], PALETTE[ACCENT.k1], PALETTE[ACCENT.go2], PALETTE[ACCENT.z1],
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
    console.log('  character   left  right    top bottom  | slack | crop | copy');
    for (const char of cast) {
      const e = sweptExtent(char, cam, S);
      const W = e.x1 - e.x0;
      const A = S.edgeAllowance(char.key, W);
      // slack is how much margin is left over its allowance on the worst edge
      const slack = Math.min(e.x0 - A.left, (1 - e.x1) - A.right, e.y0 - A.top, (1 - e.y1) - A.bottom);
      const off = Math.max(0, -e.x0) + Math.max(0, e.x1 - 1);
      const cropPct = W > 0 ? off / W : 0;
      const hit = copyHit(char, cam, S, K);
      if (slack < worstEdge) { worstEdge = slack; worstWho = `${char.key} @ ${vw}x${vh}`; }
      if (hit > worstHit) { worstHit = hit; hitWho = `${char.key} @ ${vw}x${vh}`; }
      console.log(`  ${char.key.padEnd(9)} ${(e.x0 * 100).toFixed(1).padStart(6)} ${((1 - e.x1) * 100).toFixed(1).padStart(6)} `
        + `${(e.y0 * 100).toFixed(1).padStart(6)} ${((1 - e.y1) * 100).toFixed(1).padStart(6)}  |`
        + `${(slack * 100).toFixed(1).padStart(6)}%${slack < 0 ? '!' : ' '}|`
        + `${(cropPct * 100).toFixed(1).padStart(5)}% |`
        + (hit > 0 ? ` ${(hit * 100).toFixed(1)}% UNDER COPY` : ' clear'));
    }
  }
  console.log(`\ntightest edge slack ${(worstEdge * 100).toFixed(1)}%  (${worstWho})${worstEdge < 0 ? '  <-- OVER BUDGET' : ''}`);
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
      const pm = placeMatrix(char, t);
      const { M, a, world } = pm;
      // strip the stage placement so the character fills the tile
      const strip = new THREE.Matrix4().makeTranslation(-a.place.x, -(a.lift || 0), -a.place.z);
      const local = strip.clone().multiply(M);
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
      if (W_.holderAt(t) === char.key) {
        const lm = cubeMatrix([char], t);
        if (lm) push(boxSoup([W_.CUBE, W_.CUBE, W_.CUBE], 2), strip.clone().multiply(lm), 2);
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
  const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
  const run = mode === 'character' ? character(rest[0], flag('--out'))
    : mode === 'extents' ? extents() : mode === 'roam' ? solveRoam()
    : mode === 'solve' ? solveConstants()
    : mode === 'solo' ? solo(rest) : stageSheets();
  run.catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { fk, clampPose, groundOffset, buildStage, stageSoup, placeMatrix, cubeMatrix, sweptExtent, copyHit, roamBoxExtent, PALETTE, ACCENT, VIEWPORTS };
