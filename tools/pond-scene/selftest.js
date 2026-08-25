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

    /* Clamp exactly as the runtime does. scene.js applies each joint's URDF
       limit before writing it, and so does preview.js's fk(), so the node graph
       has to as well or the two disagree wherever a pose reaches past a limit —
       which shows up here as a whopping FK mismatch and points at the graph
       when the real fault is the POSE. Pose legality is a separate check, and
       it lives further down; this one is only about the two graphs agreeing. */
    const lim = {};
    for (const j of R.joints) if (j.lim) lim[j.n] = j.lim;
    const clamp = (n, v) => { const L = lim[n]; return !L ? v : (v < L[0] ? L[0] : v > L[1] ? L[1] : v); };

    const tmpQ = new THREE.Quaternion();
    for (const pose of poses) {
      for (const j of skel.joints) {
        const q = clamp(j.name, pose[j.name] || 0);
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
  for (const key of ['go2', 'h2', 'k1']) {
    const c = byKey[key];
    const slip = footSlip(c, WORK);
    console.log(`${key.padEnd(9)} planted-foot slip while walking: ${(slip.rel * 100).toFixed(2)}% of body speed `
      + `(${slip.foot.toFixed(4)} vs ${slip.body.toFixed(4)} stage units/s)`);
    if (slip.rel > 0.05) { console.error('FOOT SKATE'); process.exit(1); }
  }
  // composition: nothing cropped at the frame edges, nothing under the copy
  const { sweptExtent, copyHit, VIEWPORTS } = require('./preview');
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
      /* per FRAME, not against the swept box: the courier is high in the frame
         and inside the column at different seconds, and unioning them into one
         box fails a character that never actually touches the copy */
      const hit = copyHit(c, cam, S, K);
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
  await checkBaseOrientation(cast, WORK);
  await checkWorldTask();
  await checkHandoffs(cast);

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




/* ---- the cube never teleports ----------------------------------------------
   The whole relay turns on ten instants where the cube changes hands. Ownership
   flips on a single frame, and the cube's position is a pure function of whoever
   owns it — so if the giver and the taker are not in the same place at that
   instant, the cube jumps. A jump is the one failure this design cannot absorb:
   everything else about a handoff can be a little loose and still read, but a
   cube that is in two places on consecutive frames reads as a bug.

   So: sample the cube a frame either side of every ownership change, through
   the REAL transform chain — the same placeMatrix, the same carry offsets, the
   same grounding solve the renderers use — and require continuity.

   This is also what pins the measured constants the circuit is built on
   (BACK_AT_BAY, BACK_AT_HANDOFF, HAND_AT_REACH, the Z1's reach envelope, the
   frog's leap heights). None of them is derivable in closed form; all of them
   were measured through this chain. If someone changes a route, a crouch depth
   or a stance height, this is the test that says so, and it says so with the
   miss distance in millimetres. */
async function checkHandoffs(cast) {
  const W = await import('./anim/world.mjs');
  const { placeMatrix } = require('./preview');
  const by = Object.fromEntries(cast.map((c) => [c.key, c]));
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3();

  const carryPoint = (key, t) => {
    const c = by[key], C = W.CARRY[key];
    if (!c || !C) return null;
    const pm = placeMatrix(c, t);
    let NM;
    if (C.node === 'hands') {
      const a = new THREE.Vector3().setFromMatrixPosition(pm.world.left_hand_link);
      const b = new THREE.Vector3().setFromMatrixPosition(pm.world.right_hand_link);
      NM = new THREE.Matrix4().copy(pm.world.Trunk || new THREE.Matrix4())
        .setPosition(a.add(b).multiplyScalar(0.5));
    } else NM = pm.world[C.node];
    if (!NM) return null;
    new THREE.Matrix4().multiplyMatrices(pm.M, NM).decompose(V, Q, S3);
    return V.clone().add(new THREE.Vector3(C.offset[0], C.offset[1], C.offset[2]).applyQuaternion(Q));
  };
  const cubeAt = (t) => {
    const h = W.holderAt(t);
    /* the belt is a party to two handoffs like any character, but it is a prop:
       its position is a pure function of the score, with no transform chain */
    if (h === 'belt') {
      const p = W.beltPoint(W.beltProgress(t));
      return new THREE.Vector3(p.x, p.y, p.z);
    }
    if (h) return carryPoint(h, t);
    const p = W.parkedCube(t);
    return new THREE.Vector3(p.x, p.y, p.z);
  };

  /* sample the THIRD circuit, so every character's entrance is long finished
     and the score is in its steady state */
  const LAP = W.MASTER * 2;
  const TOL = 0.040;               // under one cube-width, 50mm
  let worst = 0, worstAt = '', bad = 0;

  for (const H of W.HANDOFFS) {
    const t = H.t + LAP;
    const a = cubeAt(t - 0.02), b = cubeAt(t + 0.02);
    if (!a || !b) { console.error(`  handoff ${H.beat}: no cube position`); bad++; continue; }
    const d = a.distanceTo(b);
    if (d > worst) { worst = d; worstAt = H.beat; }
    if (d > TOL) {
      console.error(`  handoff ${H.beat} (t=${H.t}, ${H.from} -> ${H.to}): the cube jumps `
        + `${(d * 1000).toFixed(0)}mm — from (${a.x.toFixed(3)}, ${a.y.toFixed(3)}, ${a.z.toFixed(3)}) `
        + `to (${b.x.toFixed(3)}, ${b.y.toFixed(3)}, ${b.z.toFixed(3)}). The giver and the taker `
        + 'are not in the same place at that instant.');
      bad++;
    }
  }

  /* and it never goes through the floor or leaves the world in between */
  let low = Infinity;
  for (let i = 0; i <= 2000; i++) {
    const t = LAP + (i / 2000) * W.MASTER;
    const p = cubeAt(t);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { console.error(`  cube is not finite at master ${(t - LAP).toFixed(1)}`); bad++; break; }
    if (p.y < low) low = p.y;
  }
  if (low < -0.01) { console.error(`  the cube goes ${(-low * 1000).toFixed(0)}mm under the deck`); bad++; }

  if (bad) { console.error(`HANDOFFS BROKEN: ${bad}`); process.exit(1); }
  console.log(`cube continuous across all ${W.HANDOFFS.length} handoffs `
    + `(worst ${(worst * 1000).toFixed(0)}mm at ${worstAt}, cube is ${(W.CUBE * 1000).toFixed(0)}mm; `
    + `never below ${(low * 1000).toFixed(0)}mm)`);
}

/* ---- the world task holds together -----------------------------------------
   anim/world.mjs is the score the whole cast reads from, and it is a pure
   function of the master clock, so it can be checked on its own terms before
   any character is involved.

   Three things matter. The legs have to tile the master period exactly — a gap
   means the cube has no owner for a frame, an overlap means two. Every station
   has to be somewhere its character may actually stand, solved by the same
   feasibleX the roam clamp uses, so the circuit cannot quietly ask a character
   to break the copy keep-out. And the shared pulse has to be continuous across
   the loop wrap, or the whole cast blinks once a period. */
async function checkWorldTask() {
  const W = await import('./anim/world.mjs');
  const S = await import('./stage.mjs');
  let bad = 0;

  // 1. the legs tile [0, MASTER) with no gap and no overlap
  const seen = [];
  for (let i = 0; i <= 4000; i++) {
    const m = (i / 4000) * W.MASTER * 0.9999;
    const L = W.legAt(m);
    if (!L) { console.error(`  world: no leg at master time ${m.toFixed(2)}`); bad++; break; }
    if (!seen.includes(L.beat)) seen.push(L.beat);
  }
  // and the holder is always either null or a real character
  const KEYS = ['h2', 'k1', 'go2', 'z1'];
  /* the belt owns the cube for two of the thirteen legs, exactly the way a
     character does — it is a party to two of the handoffs and it has a
     position, so it is a legal holder */
  const HOLDERS = KEYS.concat(['belt']);
  for (let i = 0; i <= 2000; i++) {
    const t = (i / 2000) * W.MASTER;
    const h = W.holderAt(t);
    if (h !== null && !HOLDERS.includes(h)) { console.error(`  world: bogus holder ${h} at t=${t.toFixed(2)}`); bad++; break; }
    if (h === null && !W.STATIONS[W.parkAt(t)]) { console.error(`  world: cube parked nowhere at t=${t.toFixed(2)}`); bad++; break; }
  }

  // 2. every handoff names a place, and the giver actually had the cube
  for (const h of W.HANDOFFS) {
    if (!h.where || !W.STATIONS[h.where]) {
      console.error(`  world: handoff ${h.from} -> ${h.to} at t=${h.t} has no station`); bad++;
    }
    const before = W.holderAt(h.t - 0.001);
    const after = W.holderAt(h.t + 0.001);
    if (before !== h.from || after !== h.to) {
      console.error(`  world: handoff at t=${h.t} says ${h.from}->${h.to} but the clock says ${before}->${after}`); bad++;
    }
  }

  // 3. every station is somewhere its character may stand
  const HW = {};
  for (const k of KEYS) HW[k] = (await import('./anim/index.mjs')).ROAM[k].halfWidth;
  const BODY = [
    ['z1', 'left', ['z1']],
    ['go2', 'left', ['go2Load', 'go2Patrol', 'h2Handoff']],
    ['h2', 'left', ['h2']],
    ['k1', 'right', ['k1', 'k1Reach']],
  ];
  for (const [key, side, names] of BODY) {
    for (const n of names) {
      const st = W.STATIONS[n];
      const [lo, hi] = S.feasibleX(key, side, HW[key], st.z);
      if (st.x < lo - 1e-9 || st.x > hi + 1e-9) {
        console.error(`  world: station ${n} (${st.x.toFixed(2)}, ${st.z.toFixed(2)}) is outside `
          + `${key}'s feasible x [${lo.toFixed(2)}, ${hi.toFixed(2)}] at that depth`);
        bad++;
      }
    }
  }
  // the pallets are props, so they answer to the cube's size, not a body's
  for (const [n, side] of [['z1Pallet', 'left'], ['k1Bench', 'right']]) {
    const st = W.STATIONS[n];
    const [lo, hi] = S.feasibleX('prop', side, W.CUBE, st.z);
    if (st.x < lo - 1e-9 || st.x > hi + 1e-9) {
      console.error(`  world: pallet ${n} is outside the feasible band`); bad++;
    }
  }

  // 4. the shared pulse: bounded, and continuous across the loop wrap
  let pMin = 1, pMax = 0, jump = 0;
  let prev = W.pulse(0, false);
  for (let i = 1; i <= 6000; i++) {
    const t = (i / 6000) * W.PULSE_PERIOD * 4;
    const v = W.pulse(t, false);
    if (v < pMin) pMin = v;
    if (v > pMax) pMax = v;
    jump = Math.max(jump, Math.abs(v - prev));
    prev = v;
  }
  if (pMin < -1e-9 || pMax > 1 + 1e-9) { console.error(`  world: pulse leaves 0..1 (${pMin}..${pMax})`); bad++; }
  if (jump > 0.02) { console.error(`  world: pulse steps by ${jump.toFixed(3)} between frames — it will read as a blink`); bad++; }
  if (W.pulse(3.3, true) !== 0.5 || W.pulse(11.7, true) !== 0.5) {
    console.error('  world: reduced motion does not pin the pulse'); bad++;
  }

  if (bad) { console.error(`WORLD TASK INCONSISTENT: ${bad} problem${bad === 1 ? '' : 's'}`); process.exit(1); }
  console.log(`world task coherent (${seen.length} legs tiling ${W.MASTER}s, ${W.HANDOFFS.length} handoffs, `
    + 'all stations inside their feasible bands, pulse continuous)');
}

/* ---- everybody is the right way up, absolutely ------------------------------
   Not "upright relative to its rest pose" — the rest pose itself was the bug,
   last time. The pond-bot GLB was a Z-up CAD export imported as Y-up, so the
   character's BASE transform laid it on its back, and since grounding only
   pushes the lowest point onto the deck, lying on its back was a perfectly
   stable solution that nothing complained about. A relative check cannot catch
   that; this one is geometric and absolute.

   The frog is gone, and with it the eye-pupil trick that used to anchor this
   check. What replaces it generalises to the whole cast and needs no per-robot
   knowledge beyond one link name: for each character, take a link that is
   structurally near the TOP of the body (a head, or a trunk) and one near the
   BOTTOM (a foot, or the base), push both through the real runtime transform
   chain, and require the top one to actually come out above the bottom one —
   by a healthy fraction of the body's own height, at every moment of the loop
   and at both ends of every reaction.

   Reactions are checked at their ends only: the K1's spin legitimately puts it
   through a whole turn in the middle, which is the point of a spin. */
async function checkBaseOrientation(cast, WORK) {
  const { placeMatrix } = require('./preview');
  /* [top link, bottom link, minimum separation as a fraction of body height].
     The bar is per-robot because the bodies are different shapes: the Z1 is an
     arm whose "top" swings through its own work envelope, so it gets a looser
     one than a biped standing on two feet. */
  /* The bar is per-robot because the bodies are different shapes, and it is set
     to catch INVERSION, not to police posture. A character laid on its back or
     its head puts the top marker at or below the bottom one, i.e. a fraction
     near zero or negative; these bars sit well above that and well below the
     tightest legitimate pose each body reaches.

     The two humanoids keep their heads high through everything they do, so
     they get a stricter bar than the dog — but not a tight one, because both
     of them FOLD: the H2's belt pose puts its head over its knees and the K1's
     lunge to the belt tail drops its head to 37% of its own swept height. Those
     are the poses the scene is built around, so the bar sits below them.
     The Go2's trunk drops to a third of its swept height
     when it folds flat to be loaded, and its swept height includes a hop, so it
     gets a loose one. The Z1 is EXCLUDED rather than given a loose bar: it is
     an arm, "up" is not a property it has, and link03 legitimately passes below
     its own base every time it reaches down to the pallet. A check that cannot
     fail for a good reason is worse than no check. */
  const MARK = {
    h2: ['head_yaw_link', 'left_ankle_pitch_link', 0.42],
    k1: ['Head_2', 'left_foot_link', 0.28],
    go2: ['base', 'FL_foot', 0.12],
  };

  const V = new THREE.Vector3();
  let bad = 0, worst = 1, worstWho = '';
  const skipped = [];

  for (const char of cast) {
    const M = MARK[char.key];
    if (!M) { skipped.push(char.key); continue; }
    const [topLink, botLink, bar] = M;

    const sample = (t, label, react) => {
      const pm = placeMatrix(char, t, react ? { react } : undefined);
      const Wt = pm.world[topLink], Wb = pm.world[botLink];
      if (!Wt || !Wb) { console.error(`  ${char.key}: missing link ${topLink}/${botLink}`); bad++; return; }
      const top = V.clone().setFromMatrixPosition(Wt).applyMatrix4(pm.M).y;
      const bot = V.clone().setFromMatrixPosition(Wb).applyMatrix4(pm.M).y;
      const f = (top - bot) / char.height;
      if (f < worst) { worst = f; worstWho = `${char.key} ${label}`; }
      if (f < bar) {
        console.error(`  ${char.key}: ${topLink} sits only ${(f * 100).toFixed(0)}% of body height above `
          + `${botLink} (${label}) — the character is tipped or inverted; check the base transform in build.js`);
        bad++;
      }
    };

    for (let i = 0; i <= 240; i++) {
      const t = (i / 240) * (char.entryEnd + char.period);
      sample(t, `t=${t.toFixed(2)}`);
    }
    for (const R of (WORK.REACTIONS_BY_KEY[char.key] || [])) {
      for (const dir of [-1, 1]) {
        for (const u of [0, 1]) {
          sample(char.entryEnd + 0.25 * char.period, `${R.name} dir${dir} t=${u}`, { R, t: u, dir });
        }
      }
    }
  }

  if (bad) { console.error('BASE ORIENTATION WRONG'); process.exit(1); }
  console.log(`every character upright through its whole loop `
    + `(tightest top-over-bottom ${(worst * 100).toFixed(0)}% of body height, ${worstWho}`
    + `${skipped.length ? '; no meaningful "up" for ' + skipped.join(', ') : ''})`);
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
