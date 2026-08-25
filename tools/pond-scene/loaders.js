'use strict';
const fs = require('fs');

/* ---------- binary / ascii STL -> Float32Array of triangle positions ---------- */
function loadSTL(file) {
  const buf = fs.readFileSync(file);
  const isAscii = buf.length > 5 && buf.slice(0, 5).toString('utf8').trim() === 'solid'
    && buf.slice(0, Math.min(buf.length, 512)).toString('utf8').includes('facet');
  if (isAscii) {
    const out = [];
    const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    const s = buf.toString('utf8');
    let m;
    while ((m = re.exec(s))) out.push(+m[1], +m[2], +m[3]);
    return new Float32Array(out);
  }
  const n = buf.readUInt32LE(80);
  const pos = new Float32Array(n * 9);
  let o = 84, k = 0;
  for (let i = 0; i < n; i++) {
    o += 12; // normal
    for (let v = 0; v < 3; v++) {
      pos[k++] = buf.readFloatLE(o); pos[k++] = buf.readFloatLE(o + 4); pos[k++] = buf.readFloatLE(o + 8);
      o += 12;
    }
    o += 2; // attribute byte count
  }
  return pos;
}

/* ---------- Collada (.dae) -> Float32Array of triangle positions ----------
   Handles the CAD-exported shape used by the Unitree meshes: one <geometry>,
   N <triangles> groups, inputs with offsets, <vertices> indirection.        */
function loadDAE(file) {
  const s = fs.readFileSync(file, 'utf8');

  // id -> float array
  const sources = {};
  const srcRe = /<source[^>]*\bid="([^"]+)"[\s\S]*?<float_array[^>]*>([\s\S]*?)<\/float_array>/g;
  let m;
  while ((m = srcRe.exec(s))) {
    sources[m[1]] = m[2].trim().split(/\s+/).map(Number);
  }
  // <vertices id> -> POSITION source id
  const verts = {};
  const vRe = /<vertices[^>]*\bid="([^"]+)"[\s\S]*?<\/vertices>/g;
  while ((m = vRe.exec(s))) {
    const inp = m[0].match(/semantic="POSITION"[^>]*source="#([^"]+)"/);
    if (inp) verts[m[1]] = inp[1];
  }

  // visual_scene node transforms: geometry id -> Matrix4 (COLLADA <matrix> is row-major)
  const THREE = require('three');
  const nodeXf = {};
  const nodeRe = /<node\b[\s\S]*?<\/node>/g;
  while ((m = nodeRe.exec(s))) {
    const block = m[0];
    const mm = block.match(/<matrix[^>]*>([\s\S]*?)<\/matrix>/);
    const gi = [...block.matchAll(/<instance_geometry[^>]*url="#([^"]+)"/g)];
    if (!gi.length) continue;
    const M = new THREE.Matrix4();
    if (mm) M.set(...mm[1].trim().split(/\s+/).map(Number));
    for (const g of gi) nodeXf[g[1]] = M;
  }

  // geometry id -> its own <mesh> block, so triangles can be matched to a node
  const geoOf = {};
  const geoRe = /<geometry[^>]*\bid="([^"]+)"[\s\S]*?<\/geometry>/g;
  while ((m = geoRe.exec(s))) geoOf[m[1]] = m[0];

  const out = [];
  const groups = [];
  const emit = (block, M, material) => {
    const startVert = out.length / 3;
    const inputs = [...block.matchAll(/<input[^>]*semantic="([A-Z]+)"[^>]*source="#([^"]+)"[^>]*offset="(\d+)"/g)];
    if (!inputs.length) return;
    const stride = Math.max(...inputs.map((i) => +i[3])) + 1;
    const vin = inputs.find((i) => i[1] === 'VERTEX');
    if (!vin) return;
    const posId = verts[vin[2]] || vin[2];
    const pos = sources[posId];
    if (!pos) return;
    const off = +vin[3];
    const pRaw = block.match(/<p>([\s\S]*?)<\/p>/);
    if (!pRaw) return;
    const p = pRaw[1].trim().split(/\s+/);
    const v = new THREE.Vector3();
    for (let i = off; i < p.length; i += stride) {
      const vi = +p[i] * 3;
      v.set(pos[vi], pos[vi + 1], pos[vi + 2]);
      if (M) v.applyMatrix4(M);
      out.push(v.x, v.y, v.z);
    }
    groups.push({ material: material || '', start: startVert, count: out.length / 3 - startVert });
  };

  for (const [gid, gblock] of Object.entries(geoOf)) {
    const M = nodeXf[gid] || null;
    const triRe = /<triangles([^>]*)>([\s\S]*?)<\/triangles>/g;
    let t;
    while ((t = triRe.exec(gblock))) {
      const mm = t[1].match(/material="([^"]+)"/);
      emit(t[2], M, mm ? mm[1] : '');
    }
  }
  const arr = new Float32Array(out);
  arr.groups = groups;
  return arr;
}

/* ---------- GLB -> array of {positions, indices} ---------- */
function loadGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb: ' + file);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const chunk = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0;
    off += (4 - (len % 4)) % 4;
  }
  const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function access(i) {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const TA = CT[a.componentType], nc = NC[a.type];
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride;
    if (stride && stride !== nc * TA.BYTES_PER_ELEMENT) {
      const out = new TA(a.count * nc);
      for (let e = 0; e < a.count; e++) {
        const o = base + e * stride;
        for (let c = 0; c < nc; c++) out[e * nc + c] = new TA(bin.buffer, bin.byteOffset + o + c * TA.BYTES_PER_ELEMENT, 1)[0];
      }
      return out;
    }
    return new TA(bin.buffer, bin.byteOffset + base, a.count * nc);
  }
  // node transforms
  const prims = [];
  const M = require('three');
  function walk(ni, parent) {
    const n = json.nodes[ni];
    const local = new M.Matrix4();
    if (n.matrix) local.fromArray(n.matrix);
    else {
      const t = new M.Vector3().fromArray(n.translation || [0, 0, 0]);
      const q = new M.Quaternion().fromArray(n.rotation || [0, 0, 0, 1]);
      const sc = new M.Vector3().fromArray(n.scale || [1, 1, 1]);
      local.compose(t, q, sc);
    }
    const world = new M.Matrix4().multiplyMatrices(parent, local);
    if (n.mesh !== undefined) {
      for (const p of json.meshes[n.mesh].primitives) {
        if (p.attributes.POSITION === undefined) continue;
        prims.push({
          name: (json.meshes[n.mesh].name || n.name || '') + '',
          positions: Float32Array.from(access(p.attributes.POSITION)),
          indices: p.indices !== undefined ? Array.from(access(p.indices)) : null,
          world: world.clone(),
        });
      }
    }
    for (const c of n.children || []) walk(c, world);
  }
  const root = new M.Matrix4();
  for (const sc of json.scenes || []) for (const n of sc.nodes) walk(n, root);
  return prims;
}

module.exports = { loadSTL, loadDAE, loadGLB };
