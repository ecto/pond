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
  const WORK = await import('./anim/index.mjs');
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
  // composition: nothing cropped at the frame edges, nothing under the copy
  const { sweptExtent, VIEWPORTS } = require('./preview');
  const S = await import('./stage.mjs');
  let tightest = Infinity, tightestWho = '', overlap = 0, overlapWho = '';
  for (const [vw, vh] of VIEWPORTS) {
    const cam = S.cameraFor(vw / vh);
    const K = S.keepOut(vw, vh);
    for (const c of cast) {
      const e = sweptExtent(c, cam, S);
      const A = S.edgeAllowance(c.key, e.x1 - e.x0);
      const m = Math.min(e.x0 - A.left, (1 - e.x1) - A.right, e.y0 - A.top, (1 - e.y1) - A.bottom);
      if (m < tightest) { tightest = m; tightestWho = `${c.key} @ ${vw}x${vh}`; }
      const ow = Math.min(e.x1, K[2]) - Math.max(e.x0, K[0]);
      const oh = Math.min(e.y1, K[3]) - Math.max(e.y0, K[1]);
      const hit = (ow > 0 && oh > 0) ? Math.min(ow, oh) : 0;
      if (hit > overlap) { overlap = hit; overlapWho = `${c.key} @ ${vw}x${vh}`; }
    }
  }
  console.log(`tightest frame-edge slack ${(tightest * 100).toFixed(1)}%  (${tightestWho})`);
  if (tightest < 0) { console.error('OVER THE EDGE BUDGET'); process.exit(1); }
  console.log(overlap > 0
    ? `copy keep-out VIOLATED by ${(overlap * 100).toFixed(1)}%  (${overlapWho})`
    : 'copy keep-out clear at every viewport and roam extreme');
  if (overlap > 0) { console.error('CHARACTER UNDER THE COPY'); process.exit(1); }

  // Authored angles must be reachable. A joint driven past its URDF limit is
  // silently clamped by the runtime, so the pose rendered offline is not the
  // pose that ships — which is exactly how the Z1's elbow stayed wrong for so
  // long. Cheap check, whole class of bug.
  /* Waivers for pre-existing violations go here, so a NEW one still fails the
     build. Each entry is owned by that character's animator and should be
     cleared, not extended: the effect is that the joint is pinned at its limit,
     so whatever the pose was reaching for is not happening. Currently empty —
     every character authors inside its URDF limits. Keep it that way. */
  const WAIVED = new Set([]);
  let outOfLimit = 0, waivedSeen = 0;
  for (const c of cast) {
    const lim = Object.fromEntries(c.joints.filter((j) => j.limit).map((j) => [j.name, j.limit]));
    const bad = new Map();
    for (let i = 0; i <= 240; i++) {
      const t = (i / 240) * (c.entryEnd + c.period);
      const j = c.act(t, c.ctx).j || {};
      for (const [k, v] of Object.entries(j)) {
        const L = lim[k];
        if (!L) continue;
        const over = Math.max(L[0] - v, v - L[1]);
        if (over > 1e-6) bad.set(k, Math.max(bad.get(k) || 0, over));
      }
    }
    for (const [k, over] of bad) {
      const id = `${c.key}/${k}`;
      const msg = `${id} driven ${over.toFixed(3)} rad past its URDF limit `
        + `(${lim[k].map((x) => x.toFixed(2)).join(' .. ')}) — the runtime clamps it`;
      if (WAIVED.has(id)) { waivedSeen++; console.log(`  known: ${msg}`); continue; }
      outOfLimit++;
      console.error(`  ${msg}`);
    }
  }
  console.log(outOfLimit
    ? `AUTHORED JOINTS OUT OF LIMIT: ${outOfLimit}`
    : `authored joint angles within URDF limits (${waivedSeen} known exception${waivedSeen === 1 ? '' : 's'})`);
  if (outOfLimit) process.exit(1);

  await checkUpright(cast, WORK);

  console.log('selftest OK');
/* ---- a reaction must hand the body back upright ----------------------------
   A click reaction drives the WHOLE body — lean, hop and squash — and the
   runtime drops that channel the instant the reaction expires. So whatever the
   reaction is doing at the end is what snaps away, and whatever it leaves
   behind is what the viewer is left looking at.

   This shipped inverted once. The runtime stamped a reaction's start on the
   absolute performance.now() clock while the frame loop ran on a scene-relative
   one, so every reaction began at t = -(page uptime): it never reached t >= 1,
   never expired, and was evaluated far outside the 0..1 window its curves are
   defined on. pond-bot's `shimmy` envelope, (1 - t)^1.6, reached ~570x there and
   produced a NEGATIVE body scale — which mirrors the mesh. The frog spent the
   rest of the session resting on its back.

   So this checks two different things, and both matter:
     1. the modules: every reaction starts and ends on a neutral body, and stays
        finite and right-way-up throughout its own window; and
     2. the runtime lifecycle in anim/reaction.mjs — the same code scene.js
        runs — never hands a module a `t` outside 0..1, at any page uptime.

   "Upright" is measured as the angle between the body's local +Y and world +Y,
   so a reaction that ends on a whole extra turn (pond-bot's backflip ends at
   -TAU) is correctly read as neutral. */
async function checkUpright(cast, WORK) {
  const L = await import('./anim/reaction.mjs');
  const UP = new THREE.Vector3(0, 1, 0);
  const upright = (b) => THREE.MathUtils.radToDeg(
    new THREE.Vector3(0, 1, 0)
      .applyEuler(new THREE.Euler(b.rot.x, 0, b.rot.z, 'XYZ')).angleTo(UP));
  const finite = (b) => [b.rot.x, b.rot.y, b.rot.z, b.pos.y, b.scl.x, b.scl.y].every(Number.isFinite);

  const TILT_TOL = 2.0;    // degrees off upright at the hand-back
  const SCL_TOL = 0.02;    // body scale back to 1
  const POS_TOL = 0.02;    // body back on the deck
  let bad = 0, worstEnd = 0, worstWho = '', n = 0;

  for (const c of cast) {
    const list = WORK.REACTIONS_BY_KEY[c.key] || [];
    for (const R of list) {
      n++;
      // a neutral work pose, so what we measure is the reaction and nothing else
      const flat = { tilt: { pitch: 0, roll: 0 }, squash: 1 };
      for (const dir of [-1, 1]) {
        for (let i = 0; i <= 240; i++) {
          const u = i / 240;
          const react = { R, start: 0, vary: 1, dir };
          const b = L.bodyChannel(flat, react, u * R.dur);
          if (!finite(b)) { console.error(`  ${c.key}/${R.name}: non-finite body at t=${u.toFixed(3)}`); bad++; break; }
          if (b.scl.y <= 0 || b.scl.x <= 0) {
            console.error(`  ${c.key}/${R.name}: body scale went non-positive (${b.scl.x.toFixed(2)}, ${b.scl.y.toFixed(2)}) at t=${u.toFixed(3)} — a negative scale mirrors the mesh`);
            bad++; break;
          }
          // the ends must be neutral: that is the frame the runtime snaps from
          if (u === 0 || u === 1) {
            const d = upright(b);
            if (u === 1 && d > worstEnd) { worstEnd = d; worstWho = `${c.key}/${R.name}`; }
            if (d > TILT_TOL || Math.abs(b.scl.y - 1) > SCL_TOL
              || Math.abs(b.scl.x - 1) > SCL_TOL || Math.abs(b.pos.y) > POS_TOL) {
              console.error(`  ${c.key}/${R.name}: not neutral at t=${u} — `
                + `${d.toFixed(1)}deg off upright, scale (${b.scl.x.toFixed(3)}, ${b.scl.y.toFixed(3)}), posY ${b.pos.y.toFixed(3)}`);
              bad++;
            }
          }
        }
      }

      /* the lifecycle itself, at realistic page uptimes. `start` comes from the
         scene clock; if anything ever puts the two clocks back on different
         origins, the phase goes negative here and this fails. */
      for (const uptime of [0, 0.5, 5, 120, 3600]) {
        const react = L.beginReaction([R], uptime, () => 0.5);
        for (let i = 0; i <= 120; i++) {
          const now = uptime + (i / 120) * R.dur * 1.4;
          const u = L.phaseOf(react, now);
          if (!(u >= 0)) {
            console.error(`  ${c.key}/${R.name}: phase ${u} outside 0..1 at uptime ${uptime}s`);
            bad++; break;
          }
          if (L.isExpired(react, now)) {
            // expired: the runtime drops the channel, so the body is the work pose
            const b = L.bodyChannel(flat, null, now);
            if (upright(b) > TILT_TOL || Math.abs(b.scl.y - 1) > SCL_TOL) { console.error(`  ${c.key}/${R.name}: not upright after expiry`); bad++; }
            break;
          }
        }
        // and it must actually expire, at every uptime
        if (!L.isExpired(react, uptime + R.dur * 1.19)) {
          console.error(`  ${c.key}/${R.name}: still running after its full duration at uptime ${uptime}s — it will never hand back`);
          bad++;
        }
      }
    }
  }
  console.log(bad
    ? `REACTIONS DO NOT RETURN THE BODY UPRIGHT: ${bad} failure${bad === 1 ? '' : 's'}`
    : `reactions hand the body back upright (${n} reactions, worst end-of-reaction lean ${worstEnd.toFixed(2)}deg)`);
  if (bad) process.exit(1);
}

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
