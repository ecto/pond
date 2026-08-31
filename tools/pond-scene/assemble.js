'use strict';
const path = require('path');
const THREE = require('three');
const { MeshoptSimplifier } = require('meshoptimizer');
const { loadSTL, loadDAE, loadGLB } = require('./loaders');
const { parseURDF, forwardKinematics, resolveMesh, mat } = require('./urdf');

let meshoptReady = null;
function ensureMeshopt() {
  if (!meshoptReady) meshoptReady = MeshoptSimplifier.ready;
  return meshoptReady;
}

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
    for (const vis of link.visuals) {
      const file = resolveMesh(vis.filename, meshRoots);
      if (!file) { console.warn('  ! missing mesh', vis.filename); continue; }
      /* Per VISUAL, not per link: one link often carries several meshes, and
         which mesh it is can be the only thing that distinguishes a badge from
         the shell it is stuck to. The K1's Trunk is Trunk.STL plus K1logo.STL,
         and the logo is the accent — exactly like the Go2's, which gets picked
         out of a DAE material name instead. STL carries no materials at all,
         so for those robots the filename is the ONLY signal available. */
      const fallback = materialFor ? materialFor(link.name, null, vis.filename) : 0;
      let tri;
      try { tri = loadMesh(file); } catch (e) { console.warn('  ! ' + e.message); continue; }
      /* A loader that returns nothing is worse than one that throws: the link
         just vanishes from the payload and the only symptom is a character
         missing a limb, or — as happened with the H2's DAEs, where EVERY link
         loaded empty — a build that fails much later with "expected 1 root
         link, got ". Say so at the point of failure instead. */
      if (!tri || !tri.length) { console.warn(`  ! ${file} loaded 0 triangles`); continue; }
      const L = mat(vis.xyz, vis.rpy);
      if (vis.scale && (vis.scale[0] !== 1 || vis.scale[1] !== 1 || vis.scale[2] !== 1)) {
        L.multiply(new THREE.Matrix4().makeScale(vis.scale[0], vis.scale[1], vis.scale[2]));
      }
      const groups = tri.groups;
      const matAt = (vi) => {
        if (!groups) return fallback;
        for (const g of groups) if (vi >= g.start && vi < g.start + g.count) return materialFor(link.name, g.material, vis.filename);
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

/** Weld identical vertices into an indexed mesh (no simplification).
    When grid is omitted, merges only bit-identical coordinates per matId. */
function weld(soup, grid) {
  const { positions, matId } = soup;
  const map = new Map();
  const outPos = [], outMat = [], index = [];
  const keyFor = grid
    ? ((x, y, z, m) => {
      const q = (v) => Math.round(v / grid);
      return m + ',' + q(x) + ',' + q(y) + ',' + q(z);
    })
    : ((x, y, z, m) => m + '|' + x + '|' + y + '|' + z);
  for (let i = 0; i < positions.length; i += 3) {
    const m = matId[i / 3];
    const key = keyFor(positions[i], positions[i + 1], positions[i + 2], m);
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

/** Exact-index weld for STL soups: only merge bit-identical corners. */
function weldExact(soup) {
  return weld(soup, null);
}

/** Fine weld cell for a soup; higher weight -> finer grid -> more source detail. */
function fineGrid(soup, weight = 1) {
  const box = new THREE.Box3();
  for (let i = 0; i < soup.positions.length; i += 3) {
    box.expandByPoint(new THREE.Vector3(soup.positions[i], soup.positions[i + 1], soup.positions[i + 2]));
  }
  const diag = box.getSize(new THREE.Vector3()).length() || 1;
  return diag / (6000 * Math.max(weight, 0.25));
}

const REMAP_MISSING = 0xffffffff;

/** Drop unreferenced verts after simplify/compact; indices are rewritten in place. */
function compactIndexed(geo) {
  const { positions, matId } = geo;
  const indices = geo.index instanceof Uint32Array ? geo.index : new Uint32Array(geo.index);
  const [remap, unique] = MeshoptSimplifier.compactMesh(indices);
  const outPos = new Float32Array(unique * 3);
  const outMat = new Uint8Array(unique);
  for (let old = 0; old < remap.length; old++) {
    const neu = remap[old];
    if (neu === REMAP_MISSING) continue;
    outPos[neu * 3] = positions[old * 3];
    outPos[neu * 3 + 1] = positions[old * 3 + 1];
    outPos[neu * 3 + 2] = positions[old * 3 + 2];
    outMat[neu] = matId[old];
  }
  return { positions: outPos, matId: outMat, index: indices };
}

function splitByMaterial(geo) {
  const { positions, matId, index } = geo;
  const parts = [[], [], []];
  for (let t = 0; t < index.length; t += 3) {
    parts[matId[index[t]]].push(index[t], index[t + 1], index[t + 2]);
  }
  return parts.map((tri) => {
    if (!tri.length) return null;
    const used = new Set(tri);
    const remap = new Map();
    const outPos = [], outMat = [];
    for (const vi of used) {
      remap.set(vi, outPos.length / 3);
      outPos.push(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
      outMat.push(matId[vi]);
    }
    return {
      positions: new Float32Array(outPos),
      matId: new Uint8Array(outMat),
      index: new Uint32Array(tri.map((vi) => remap.get(vi))),
    };
  }).filter(Boolean);
}

function mergeParts(parts) {
  const positions = [], matId = [], index = [];
  let offset = 0;
  for (const p of parts) {
    positions.push(...p.positions);
    matId.push(...p.matId);
    for (let i = 0; i < p.index.length; i++) index.push(p.index[i] + offset);
    offset += p.positions.length / 3;
  }
  return {
    positions: new Float32Array(positions),
    matId: new Uint8Array(matId),
    index: new Uint32Array(index),
  };
}

async function simplifyPart(part, targetTris) {
  const pTris = part.index.length / 3;
  if (pTris <= targetTris) return part;

  const targetIdx = Math.max(3, Math.floor(targetTris) * 3);
  const srcIndex = part.index instanceof Uint32Array ? part.index : new Uint32Array(part.index);
  let lo = 0.00002, hi = 0.02, best = part;
  for (let it = 0; it < 10; it++) {
    const err = Math.sqrt(lo * hi);
    let [newIndex] = MeshoptSimplifier.simplify(srcIndex, part.positions, 3, targetIdx, err);
    if (newIndex.length < 3) break;
    const out = compactIndexed({ positions: part.positions, matId: part.matId, index: newIndex });
    const tris = out.index.length / 3;
    if (!best || Math.abs(tris - targetTris) < Math.abs(best.index.length / 3 - targetTris)) best = out;
    if (tris > targetTris) lo = err; else hi = err;
    if (Math.abs(tris - targetTris) / Math.max(targetTris, 1) < 0.04) break;
  }
  return best;
}

/** Quadric edge-collapse decimation via meshoptimizer (manifold-preserving). */
async function simplifyIndexed(geo, targetTris) {
  await ensureMeshopt();
  const srcTris = geo.index.length / 3;
  if (srcTris <= targetTris) return geo;

  const parts = splitByMaterial(geo);
  let wSum = 0;
  const w = parts.map((p) => { const t = p.index.length / 3; wSum += t; return t; });
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const pTarget = Math.max(4, Math.round(targetTris * w[i] / wSum));
    out.push(await simplifyPart(p, pTarget));
  }
  return mergeParts(out);
}

/** Exact-index weld, then simplify to approximately targetTris. */
async function decimate(soup, targetTris) {
  const welded = weldExact(soup);
  return simplifyIndexed(welded, targetTris);
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
async function decimateLinks(links, targetTris, weightFor) {
  const names = Object.keys(links);
  const welded = {};
  const srcTris = {};
  let totalSrc = 0;
  for (const n of names) {
    welded[n] = weldExact(links[n]);
    srcTris[n] = welded[n].index.length / 3;
    totalSrc += srcTris[n];
  }
  if (totalSrc <= targetTris) return welded;

  let wSum = 0;
  const w = {};
  for (const n of names) {
    w[n] = (weightFor ? weightFor(n) : 1) * srcTris[n];
    wSum += w[n];
  }

  const out = {};
  for (const n of names) {
    let linkTarget = Math.max(4, Math.round(targetTris * w[n] / wSum));
    out[n] = await simplifyIndexed(welded[n], linkTarget);
    while (out[n].positions.length / 3 > 65535 && linkTarget > 4) {
      linkTarget = Math.max(4, Math.floor(linkTarget * 0.7));
      out[n] = await simplifyIndexed(welded[n], linkTarget);
    }
    if (out[n].positions.length / 3 > 65535) {
      throw new Error(`${n}: ${out[n].positions.length / 3} verts exceeds uint16 after simplify`);
    }
  }
  return out;
}

/** Count boundary (open) and non-manifold edges for build diagnostics. */
function meshStats(geo) {
  const edge = new Map();
  const idx = geo.index;
  const add = (a, b) => {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    const key = lo + ',' + hi;
    edge.set(key, (edge.get(key) || 0) + 1);
  };
  for (let t = 0; t < idx.length; t += 3) {
    add(idx[t], idx[t + 1]); add(idx[t + 1], idx[t + 2]); add(idx[t + 2], idx[t]);
  }
  let boundary = 0, nonManifold = 0;
  for (const c of edge.values()) {
    if (c === 1) boundary++;
    else if (c > 2) nonManifold += c - 2;
  }
  return { tris: idx.length / 3, verts: geo.positions.length / 3, boundary, nonManifold };
}

module.exports = {
  assembleURDF, assembleLinks, assembleGLB, weld, weldExact, decimate, decimateLinks,
  fineGrid, simplifyIndexed, compactIndexed, meshStats, splitByMaterial, mergeParts,
};
