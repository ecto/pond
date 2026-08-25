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

/* The gaits are only skate-free if the IK actually inverts the leg's forward
   kinematics, so check it directly against the chain the URDFs describe:
     foot = L1*u(hip) + L2*u(hip+knee),  u(x) = (-sin x, -cos x)  */
function checkIK(WORK) {
  let worst = 0;
  for (const [name, G] of Object.entries(WORK.GAIT)) {
    for (let i = 0; i < 400; i++) {
      const ang = (i / 400) * Math.PI * 2;
      const reach = (0.35 + 0.55 * ((i * 7919) % 97) / 97) * (G.L1 + G.L2);
      const fx = Math.sin(ang) * reach * 0.45;
      const fz = -Math.abs(Math.cos(ang)) * reach;
      const { hip, knee } = WORK.legIK(fx, fz, G.L1, G.L2, G.kneeSign);
      const gx = -G.L1 * Math.sin(hip) - G.L2 * Math.sin(hip + knee);
      const gz = -G.L1 * Math.cos(hip) - G.L2 * Math.cos(hip + knee);
      const r = Math.hypot(fx, fz);
      // only targets inside the leg's reachable annulus are expected to match
      if (r < Math.abs(G.L1 - G.L2) + 1e-3 || r > G.L1 + G.L2 - 1e-3) continue;
      worst = Math.max(worst, Math.hypot(gx - fx, gz - fz));
    }
    if (G.kneeSign > 0 === false) { /* branch documented in work.mjs */ }
  }
  console.log(`leg IK inverts its own FK to ${(worst * 1e6).toFixed(2)}um`);
  if (worst > 1e-6) { console.error('IK MISMATCH'); process.exit(1); }
}

(async () => {
  const src = fs.readFileSync('mesh-data.js', 'utf8');
  const b64 = src.match(/"([A-Za-z0-9+/=]+)"/)[1];
  const robots = decode(b64);
  const WORK = await import('./work.mjs');
  const { buildStage } = require('./preview');
  const { cast } = await buildStage();
  const byKey = Object.fromEntries(cast.map((c) => [c.key, c]));
  let worst = 0, checks = 0;

  checkIK(WORK);

  for (const name of Object.keys(robots)) {
    const R = robots[name];
    const skel = buildSkeleton(R);
    const holder = new THREE.Object3D();
    holder.add(skel.root);

    // reference geometry straight from the source pipeline
    const ref = byKey[name];
    const poses = [];
    for (let i = 0; i < 16; i++) poses.push(ref.act(ref.entryEnd + (i / 16) * ref.period, ref.ctx).j || {});

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

  // no skating: while a foot is planted, its speed over the ground must match
  // the body's speed. Measured on the stage, in stage units per second.
  for (const key of ['go2', 't1']) {
    const c = byKey[key];
    const slip = footSlip(c, WORK);
    console.log(`${key.padEnd(9)} planted-foot slip while walking: ${(slip.rel * 100).toFixed(2)}% of body speed `
      + `(${slip.foot.toFixed(4)} vs ${slip.body.toFixed(4)} stage units/s)`);
    if (slip.rel > 0.05) { console.error('FOOT SKATE'); process.exit(1); }
  }
  console.log('selftest OK');
/* Sample a walking stretch and compare how fast the planted foot moves across
   the stage against how fast the body does. */
function footSlip(char, WORK) {
  const { placeMatrix } = require('./preview');
  const G = WORK.GAIT[char.key];
  const dt = 1 / 120;
  let bodySum = 0, footSum = 0, n = 0;
  let prev = null;
  for (let i = 0; i < 900; i++) {
    const t = 0.6 + i * dt;                       // during the entrance walk
    const { M, a } = placeMatrix(char, t);
    if (!a.place) break;
    const feet = char.ground.map((l) => {
      const w = require('./preview').fk(char, a.j);
      const p = new THREE.Vector3().setFromMatrixPosition(w[l]).applyMatrix4(M);
      return p;
    });
    if (prev && prev.moving) {
      const bodyStep = Math.hypot(a.place.x - prev.x, a.place.z - prev.z);
      // the planted foot is the one that moved least since the last sample
      let best = Infinity;
      for (let k = 0; k < feet.length; k++) {
        // horizontal only: a planted foot may rise and fall a little with the
        // body's bob, but it must not travel across the ground
        const d = Math.hypot(feet[k].x - prev.feet[k].x, feet[k].z - prev.feet[k].z);
        if (d < best) best = d;
      }
      if (bodyStep > 1e-6) { bodySum += bodyStep; footSum += best; n++; }
    }
    prev = { x: a.place.x, z: a.place.z, feet, moving: true };
    if (n > 400) break;
  }
  const body = bodySum / (n * dt), foot = footSum / (n * dt);
  return { body, foot, rel: body > 0 ? foot / body : 0 };
}

})().catch((e) => { console.error(e); process.exit(1); });
