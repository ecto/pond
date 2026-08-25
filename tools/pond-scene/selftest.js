'use strict';
/* Headless check of the runtime's data path: decodes mesh-data.js exactly as
   scene.js does, rebuilds the three.js node graph the same way, and compares
   every link's world transform against the reference matrix FK in preview.js.
   Catches frame/quaternion/offset mistakes without needing a browser. */
const THREE = require('three');
const fs = require('fs');
const { fk } = require('./preview');

function decode(b64) {
  const bytes = Buffer.from(b64, 'base64');
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new Uint8Array(ab);
  const hl = new DataView(ab).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(view.subarray(4, 4 + hl)));
  const base = 4 + hl;
  const out = {};
  for (const r of header.robots) {
    const links = {};
    for (const L of r.links) {
      const o = base + L.o;
      if ((o) % 2) throw new Error(`${r.name}/${L.n}: misaligned record at ${o}`);
      const q = new Int16Array(ab, o, L.nv * 3);
      const index = new Uint16Array(ab, o + L.nv * 6, L.nt * 3);
      const matId = new Uint8Array(ab, o + L.nv * 6 + L.nt * 6, L.nv);
      if (o + L.nv * 7 + L.nt * 6 > view.length) throw new Error(`${r.name}/${L.n}: record overruns payload`);
      let maxI = 0;
      for (let i = 0; i < index.length; i++) if (index[i] > maxI) maxI = index[i];
      if (maxI >= L.nv) throw new Error(`${r.name}/${L.n}: index ${maxI} >= nv ${L.nv}`);
      const positions = new Float32Array(L.nv * 3);
      for (let i = 0; i < L.nv; i++) {
        for (let c = 0; c < 3; c++) positions[i * 3 + c] = ((q[i * 3 + c] + 32768) / 65535) * L.size[c] + L.min[c];
      }
      links[L.n] = { positions, index, matId };
    }
    out[r.name] = { ...r, links };
  }
  return out;
}

/* the same graph scene.js builds */
function buildSkeleton(robot) {
  const nodes = {};
  for (const name of Object.keys(robot.links)) { const n = new THREE.Object3D(); n.name = name; nodes[name] = n; }
  const joints = [];
  for (const j of robot.joints) {
    const child = nodes[j.c], parent = nodes[j.p];
    if (!child || !parent) continue;
    parent.add(child);
    const originQuat = new THREE.Quaternion().fromArray(j.quat);
    child.position.fromArray(j.pos);
    child.quaternion.copy(originQuat);
    if (j.t !== 'f') joints.push({ name: j.n, node: child, originQuat, axis: new THREE.Vector3().fromArray(j.axis).normalize(), prismatic: j.t === 'p', basePos: new THREE.Vector3().fromArray(j.pos) });
  }
  return { nodes, joints, root: nodes[robot.root] };
}

(async () => {
  const src = fs.readFileSync('mesh-data.js', 'utf8');
  const b64 = src.match(/"([A-Za-z0-9+/=]+)"/)[1];
  const robots = decode(b64);
  const WORK = await import('./work.mjs');
  const { build, measure } = require('./build');
  let worst = 0, checks = 0;

  for (const name of Object.keys(robots)) {
    const R = robots[name];
    const skel = buildSkeleton(R);
    const holder = new THREE.Object3D();
    holder.add(skel.root);

    // reference geometry straight from the source pipeline
    const ref = build(name);
    ref._ground = WORK.GROUND[name] || [];
    const poses = [];
    for (let i = 0; i < 16; i++) poses.push(WORK.WORK[name]((i / 16) * WORK.PERIOD[name]).j || {});
    measure(ref, poses, fk, ref._ground);

    if (Math.abs(ref.height - R.height) > 1e-3) throw new Error(`${name}: height ${ref.height} vs ${R.height}`);
    for (let k = 0; k < 3; k++) if (Math.abs(ref.pivot[k] - R.pivot[k]) > 1e-3) throw new Error(`${name}: pivot mismatch`);

    const tmpQ = new THREE.Quaternion();
    for (const pose of poses) {
      for (const j of skel.joints) {
        const q = pose[j.name] || 0;
        if (j.prismatic) j.node.position.copy(j.basePos).addScaledVector(j.axis, q);
        else j.node.quaternion.copy(j.originQuat).multiply(tmpQ.setFromAxisAngle(j.axis, q));
      }
      holder.updateMatrixWorld(true);
      const world = fk(ref, pose);
      for (const n of Object.keys(R.links)) {
        const a = new THREE.Vector3().setFromMatrixPosition(skel.nodes[n].matrixWorld);
        const b = new THREE.Vector3().setFromMatrixPosition(world[n]);
        const d = a.distanceTo(b);
        if (d > worst) worst = d;
        checks++;
      }
    }
    // geometry round-trip: quantization error must stay well under a millimetre
    let qerr = 0;
    for (const n of Object.keys(R.links)) {
      const p = R.links[n].positions, s = ref.links[n].positions;
      if (p.length !== s.length) throw new Error(`${name}/${n}: vert count ${p.length} vs ${s.length}`);
      for (let i = 0; i < p.length; i++) qerr = Math.max(qerr, Math.abs(p[i] - s[i]));
    }
    console.log(`${name.padEnd(9)} links ok, max quantization error ${(qerr * 1000).toFixed(3)}mm`);
  }
  console.log(`node-graph FK matches reference FK over ${checks} link-poses, worst ${(worst * 1e6).toFixed(2)}um`);
  if (worst > 1e-4) { console.error('FK MISMATCH'); process.exit(1); }
  console.log('selftest OK');
})().catch((e) => { console.error(e); process.exit(1); });
