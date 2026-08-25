'use strict';
const path = require('path');
const THREE = require('three');
const { loadSTL, loadDAE, loadGLB } = require('./loaders');
const { parseURDF, forwardKinematics, resolveMesh, mat } = require('./urdf');

/** Load one visual mesh file -> Float32Array of raw triangle positions */
function loadMesh(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.stl') return loadSTL(file);
  if (ext === '.dae') return loadDAE(file);
  throw new Error('unsupported mesh ' + file);
}

/**
 * Pose a URDF robot and merge every visual mesh into one soup of triangles,
 * each vertex tagged with a material id (0 bone, 1 ink, 2 accent).
 */
function assembleURDF({ urdfFile, meshRoots, pose = {}, materialFor, zUp = true }) {
  const model = parseURDF(urdfFile);
  const world = forwardKinematics(model, pose);
  const pos = [], mid = [];
  const v = new THREE.Vector3();

  for (const link of Object.values(model.links)) {
    const W = world[link.name];
    if (!W) continue;
    const m = materialFor ? materialFor(link.name) : 0;
    for (const vis of link.visuals) {
      const file = resolveMesh(vis.filename, meshRoots);
      if (!file) { console.warn('  ! missing mesh', vis.filename); continue; }
      let tri;
      try { tri = loadMesh(file); } catch (e) { console.warn('  ! ' + e.message); continue; }
      const L = new THREE.Matrix4().multiplyMatrices(W, mat(vis.xyz, vis.rpy));
      if (vis.scale && (vis.scale[0] !== 1 || vis.scale[1] !== 1 || vis.scale[2] !== 1)) {
        L.multiply(new THREE.Matrix4().makeScale(vis.scale[0], vis.scale[1], vis.scale[2]));
      }
      // per-vertex material: prefer the mesh's own material groups when the
      // rule cares about them (lets a single mesh carry an accent detail)
      const groups = tri.groups;
      const matAt = (vi) => {
        if (!groups) return m;
        for (const g of groups) if (vi >= g.start && vi < g.start + g.count) return materialFor(link.name, g.material);
        return m;
      };
      for (let i = 0; i < tri.length; i += 3) {
        v.set(tri[i], tri[i + 1], tri[i + 2]).applyMatrix4(L);
        // URDF is Z-up; the runtime scene is Y-up
        if (zUp) pos.push(v.x, v.z, -v.y); else pos.push(v.x, v.y, v.z);
        mid.push(matAt(i / 3));
      }
    }
  }
  return { positions: new Float32Array(pos), matId: new Uint8Array(mid) };
}

/**
 * Articulated variant: keep the URDF link hierarchy instead of fusing.
 * Each link's geometry stays in its OWN frame (only the <visual> origin is
 * baked in), so the runtime can drive joint angles. Everything stays in the
 * URDF's native Z-up frame; the runtime applies one -90deg X rotation at the
 * root to reach the Y-up scene.
 */
function assembleLinks({ urdfFile, meshRoots, materialFor }) {
  const model = parseURDF(urdfFile);
  const out = {};
  const v = new THREE.Vector3();

  for (const link of Object.values(model.links)) {
    if (!link.visuals.length) continue;
    const pos = [], mid = [];
    const fallback = materialFor ? materialFor(link.name) : 0;
    for (const vis of link.visuals) {
      const file = resolveMesh(vis.filename, meshRoots);
      if (!file) { console.warn('  ! missing mesh', vis.filename); continue; }
      let tri;
      try { tri = loadMesh(file); } catch (e) { console.warn('  ! ' + e.message); continue; }
      const L = mat(vis.xyz, vis.rpy);
      if (vis.scale && (vis.scale[0] !== 1 || vis.scale[1] !== 1 || vis.scale[2] !== 1)) {
        L.multiply(new THREE.Matrix4().makeScale(vis.scale[0], vis.scale[1], vis.scale[2]));
      }
      const groups = tri.groups;
      const matAt = (vi) => {
        if (!groups) return fallback;
        for (const g of groups) if (vi >= g.start && vi < g.start + g.count) return materialFor(link.name, g.material);
        return fallback;
      };
      for (let i = 0; i < tri.length; i += 3) {
        v.set(tri[i], tri[i + 1], tri[i + 2]).applyMatrix4(L);
        pos.push(v.x, v.y, v.z);
        mid.push(matAt(i / 3));
      }
    }
    if (pos.length) out[link.name] = { positions: new Float32Array(pos), matId: new Uint8Array(mid) };
  }
  return { links: out, model };
}

/** GLB (already Y-up) -> same soup form, material id per primitive index */
function assembleGLB(file, matForPrim) {
  const prims = loadGLB(file);
  const pos = [], mid = [];
  const v = new THREE.Vector3();
  prims.forEach((p, pi) => {
    const m = matForPrim ? matForPrim(p.name, pi) : 0;
    const idx = p.indices || Array.from({ length: p.positions.length / 3 }, (_, i) => i);
    for (const i of idx) {
      v.set(p.positions[i * 3], p.positions[i * 3 + 1], p.positions[i * 3 + 2]).applyMatrix4(p.world);
      pos.push(v.x, v.y, v.z); mid.push(m);
    }
  });
  return { positions: new Float32Array(pos), matId: new Uint8Array(mid) };
}

/** weld identical-ish vertices into an indexed mesh (no simplification) */
function weld(soup, grid) {
  const { positions, matId } = soup;
  const map = new Map();
  const outPos = [], outMat = [], index = [];
  const q = (x) => Math.round(x / grid);
  for (let i = 0; i < positions.length; i += 3) {
    const m = matId[i / 3];
    const key = q(positions[i]) + ',' + q(positions[i + 1]) + ',' + q(positions[i + 2]) + ',' + m;
    let id = map.get(key);
    if (id === undefined) {
      id = outPos.length / 3;
      map.set(key, id);
      outPos.push(positions[i], positions[i + 1], positions[i + 2]);
      outMat.push(m);
    }
    index.push(id);
  }
  // drop degenerate triangles
  const idx = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: new Float32Array(outPos), matId: new Uint8Array(outMat), index: new Uint32Array(idx) };
}

/** cluster-decimate to approximately targetTris by binary-searching the grid size */
function decimate(soup, targetTris) {
  const box = new THREE.Box3();
  for (let i = 0; i < soup.positions.length; i += 3) {
    box.expandByPoint(new THREE.Vector3(soup.positions[i], soup.positions[i + 1], soup.positions[i + 2]));
  }
  const diag = box.getSize(new THREE.Vector3()).length();
  let lo = diag / 4000, hi = diag / 8, best = null;
  for (let it = 0; it < 22; it++) {
    const g = Math.sqrt(lo * hi);
    const w = weld(soup, g);
    const tris = w.index.length / 3;
    if (!best || Math.abs(tris - targetTris) < Math.abs(best.index.length / 3 - targetTris)) best = w;
    if (tris > targetTris) lo = g; else hi = g;
    if (Math.abs(tris - targetTris) / targetTris < 0.06) break;
  }
  return best;
}

/**
 * Decimate a whole set of links against ONE budget.
 *
 * A single absolute cell size is binary-searched across every link, so surface
 * detail density stays uniform over the robot (a per-link tri target would
 * over-detail small parts and starve big ones). `weightFor(name)` shrinks the
 * cell for silhouette-critical links — heads, torsos, upper legs — so they
 * come out proportionally denser.
 */
function decimateLinks(links, targetTris, weightFor) {
  const names = Object.keys(links);
  const box = new THREE.Box3();
  for (const n of names) {
    const p = links[n].positions;
    for (let i = 0; i < p.length; i += 3) box.expandByPoint(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
  }
  const diag = box.getSize(new THREE.Vector3()).length() || 1;
  const w = {};
  for (const n of names) w[n] = weightFor ? weightFor(n) : 1;

  const attempt = (g) => {
    const o = {};
    let tris = 0;
    for (const n of names) {
      o[n] = weld(links[n], g / w[n]);
      tris += o[n].index.length / 3;
    }
    return { o, tris };
  };

  let lo = diag / 20000, hi = diag / 4, best = null;
  for (let it = 0; it < 24; it++) {
    const g = Math.sqrt(lo * hi);
    const a = attempt(g);
    if (!best || Math.abs(a.tris - targetTris) < Math.abs(best.tris - targetTris)) best = a;
    if (a.tris > targetTris) lo = g; else hi = g;
    if (Math.abs(a.tris - targetTris) / targetTris < 0.04) break;
  }
  // uint16 indices are per-link, so a single link must stay under 65535 verts
  for (const n of names) {
    let l = best.o[n], g = diag / 200;
    while (l.positions.length / 3 > 65535) { l = weld(links[n], g); g *= 1.35; }
    best.o[n] = l;
  }
  return best.o;
}

module.exports = { assembleURDF, assembleLinks, assembleGLB, weld, decimate, decimateLinks };
