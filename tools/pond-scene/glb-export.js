'use strict';
/* Writes the posed, Pond-skinned robots as canonical GLBs.
   Geometry is welded at a fine tolerance (indexed, no visible loss) rather
   than the aggressive runtime decimation. */
const fs = require('fs');
const THREE = require('three');
const { assembleURDF, weld } = require('./assemble');
const { SPECS } = require('./build');

const COLORS = [[0.937, 0.925, 0.886, 1], [0.129, 0.137, 0.153, 1], [0, 0, 1, 1]];
const NAMES = ['bone', 'ink', 'accent'];

function writeGLB(file, geo) {
  const { positions, index, matId } = geo;
  const nv = positions.length / 3;

  // normals
  const normals = new Float32Array(nv * 3);
  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
  const cb = new THREE.Vector3(), ab = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    pA.fromArray(positions, a * 3); pB.fromArray(positions, b * 3); pC.fromArray(positions, c * 3);
    cb.subVectors(pC, pB); ab.subVectors(pA, pB); cb.cross(ab);
    for (const i of [a, b, c]) { normals[i * 3] += cb.x; normals[i * 3 + 1] += cb.y; normals[i * 3 + 2] += cb.z; }
  }
  for (let i = 0; i < nv; i++) {
    const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    normals[i * 3] = x / l; normals[i * 3 + 1] = y / l; normals[i * 3 + 2] = z / l;
  }

  // split indices per material
  const groups = [[], [], []];
  for (let t = 0; t < index.length; t += 3) groups[matId[index[t]]].push(index[t], index[t + 1], index[t + 2]);

  const bin = [];
  let off = 0;
  const views = [], accessors = [];
  const pad4 = (n) => (4 - (n % 4)) % 4;
  function addView(buf, target) {
    const p = pad4(off);
    if (p) { bin.push(Buffer.alloc(p)); off += p; }
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target });
    bin.push(buf); off += buf.length;
    return views.length - 1;
  }
  const box = new THREE.Box3();
  for (let i = 0; i < positions.length; i += 3) box.expandByPoint(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));

  const posView = addView(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength), 34962);
  accessors.push({ bufferView: posView, componentType: 5126, count: nv, type: 'VEC3', min: box.min.toArray(), max: box.max.toArray() });
  const nrmView = addView(Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength), 34962);
  accessors.push({ bufferView: nrmView, componentType: 5126, count: nv, type: 'VEC3' });

  const prims = [];
  groups.forEach((g, gi) => {
    if (!g.length) return;
    const arr = new Uint32Array(g);
    const v = addView(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), 34963);
    accessors.push({ bufferView: v, componentType: 5125, count: g.length, type: 'SCALAR' });
    prims.push({ attributes: { POSITION: 0, NORMAL: 1 }, indices: accessors.length - 1, material: prims.length });
  });

  const materials = groups.map((g, gi) => (g.length ? {
    name: NAMES[gi],
    pbrMetallicRoughness: { baseColorFactor: COLORS[gi], metallicFactor: gi === 1 ? 0.25 : 0.05, roughnessFactor: gi === 2 ? 0.35 : 0.72 },
  } : null)).filter(Boolean);

  const binBuf = Buffer.concat(bin);
  const json = {
    asset: { version: '2.0', generator: 'pond-pipeline' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: prims }],
    materials, accessors, bufferViews: views,
    buffers: [{ byteLength: binBuf.length }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  if (pad4(jsonBuf.length)) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(' '.repeat(pad4(jsonBuf.length)))]);
  const binPad = pad4(binBuf.length);
  const binOut = binPad ? Buffer.concat([binBuf, Buffer.alloc(binPad)]) : binBuf;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binOut.length, 8);
  const jc = Buffer.alloc(8); jc.writeUInt32LE(jsonBuf.length, 0); jc.writeUInt32LE(0x4e4f534a, 4);
  const bc = Buffer.alloc(8); bc.writeUInt32LE(binOut.length, 0); bc.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([header, jc, jsonBuf, bc, binOut]));
  return { tris: index.length / 3, verts: nv, bytes: fs.statSync(file).size };
}

if (require.main === module) {
  const OUT = '/Users/cam/Developer/pond/assets/';
  for (const name of ['go2', 't1', 'z1']) {
    const s = SPECS[name];
    const soup = assembleURDF({ urdfFile: s.urdfFile, meshRoots: s.meshRoots, pose: s.pose, materialFor: s.materialFor });
    // fine weld: indexed, visually lossless
    const box = new THREE.Box3();
    for (let i = 0; i < soup.positions.length; i += 3) box.expandByPoint(new THREE.Vector3(soup.positions[i], soup.positions[i + 1], soup.positions[i + 2]));
    const diag = box.getSize(new THREE.Vector3()).length();
    const g = weld(soup, diag / 6000);
    const r = writeGLB(OUT + 'pond-' + name + '.glb', g);
    console.log(`pond-${name}.glb  ${r.tris} tris, ${r.verts} verts, ${(r.bytes / 1e6).toFixed(2)} MB`);
  }
}
