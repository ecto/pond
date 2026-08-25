'use strict';
/* Measure every place the cube changes hands, through the real transform
   chain, and print the constants the score needs.

   The circuit is pinned by a handful of numbers that are not derivable in
   closed form — they depend on stance heights, on the grounding solve, on
   headings and on where a character is in a blend at that exact second. The
   documented way to get them is to measure them through this chain and paste
   them in; this prints all of them in one pass so that pinning the circuit is
   one edit rather than ten rounds of bisection.

     node measure-circuit.js */
const THREE = require('three');

(async () => {
  const W = await import('./anim/world.mjs');
  const { buildStage, placeMatrix } = require('./preview');
  const { cast } = await buildStage();
  const by = Object.fromEntries(cast.map((c) => [c.key, c]));
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();

  const carry = (key, t) => {
    const c = by[key], C = W.CARRY[key];
    if (!c || !C) return null;
    const pm = placeMatrix(c, t);
    let NM;
    if (C.node === 'hands') {
      const a = new THREE.Vector3().setFromMatrixPosition(pm.world.left_hand_link);
      const b = new THREE.Vector3().setFromMatrixPosition(pm.world.right_hand_link);
      NM = new THREE.Matrix4().copy(pm.world[C.frame]).setPosition(a.add(b).multiplyScalar(0.5));
    } else NM = pm.world[C.node];
    if (!NM) return null;
    new THREE.Matrix4().multiplyMatrices(pm.M, NM).decompose(V, Q, S);
    return V.clone().add(new THREE.Vector3(C.offset[0], C.offset[1], C.offset[2]).applyQuaternion(Q));
  };

  const LAP = W.MASTER * 2;
  const at = (key, m) => carry(key, LAP + m + 0.02);
  const fmt = (p) => p ? `{ x: ${p.x.toFixed(4)}, y: ${p.y.toFixed(4)}, z: ${p.z.toFixed(4)} }` : 'null';

  console.log('\n--- where each body actually holds the cube, at the second it matters ---\n');
  const rows = [
    ['go2 back at the loading bay      (t=18, z1 -> go2)', 'go2', 18, 'BACK_AT_BAY'],
    ['go2 back at the flagship         (t=26, go2 -> h2)', 'go2', 26, 'BACK_AT_HANDOFF'],
    ['H2 hands taking off the dog      (t=26)', 'h2', 26, ''],
    ['H2 hands at the belt head        (t=34, h2 -> belt)', 'h2', 34, 'beltHead + BELT.y'],
    ['K1 hands at the belt tail        (t=47, belt -> k1)', 'k1', 47, 'beltTail'],
    ['K1 hands at its bench            (t=54, k1 -> parked)', 'k1', 54, 'k1Bench + BENCH.h'],
    ['K1 hands back at the belt        (t=67, k1 -> belt)', 'k1', 67, ''],
    ['H2 hands taking off the belt     (t=80, belt -> h2)', 'h2', 80, ''],
    ['H2 hands putting it on the dog   (t=87, h2 -> go2)', 'h2', 87, ''],
    ['go2 back receiving it            (t=87)', 'go2', 87, ''],
    ['go2 back at the bay for restow   (t=92, go2 -> z1)', 'go2', 92, 'BACK_AT_BAY (2nd visit)'],
  ];
  for (const [label, key, m, pins] of rows) {
    console.log(`  ${label.padEnd(52)} ${fmt(at(key, m))}${pins ? '   <- ' + pins : ''}`);
  }

  console.log('\n--- what the score currently says ---\n');
  console.log(`  BACK_AT_BAY        ${fmt(W.BACK_AT_BAY)}`);
  console.log(`  BACK_AT_HANDOFF    ${fmt(W.BACK_AT_HANDOFF)}`);
  console.log(`  beltHead           { x: ${W.BELT.head.x.toFixed(4)}, z: ${W.BELT.head.z.toFixed(4)} }   deck y ${W.BELT.y.toFixed(4)}, cube rides at ${W.BELT_CARRY_Y.toFixed(4)}`);
  console.log(`  beltTail           { x: ${W.BELT.tail.x.toFixed(4)}, z: ${W.BELT.tail.z.toFixed(4)} }`);
  console.log(`  k1Bench            { x: ${W.STATIONS.k1Bench.x.toFixed(4)}, z: ${W.STATIONS.k1Bench.z.toFixed(4)} }   cube parks at ${W.parkHeight('k1Bench').toFixed(4)}`);

  /* the belt has to stay under the copy for its whole in-column span */
  const S_ = await import('./stage.mjs');
  let worst = Infinity, worstAt = '';
  for (let u = 0; u <= 1.0001; u += 0.02) {
    const p = W.beltPoint(u);
    const top = p.y + W.CUBE / 2;
    for (const [vw, vh] of S_.TEST_VIEWPORTS) {
      const cam = S_.cameraFor(vw / vh);
      const K = S_.keepOut(vw, vh);
      const sx = S_.project({ x: p.x, y: top, z: p.z }, cam).x;
      if (sx < K[0] || sx > K[2]) continue;          // outside the copy column
      const sy = S_.project({ x: p.x, y: top, z: p.z }, cam).y;
      const slack = sy - K[3];                        // must be BELOW the copy
      if (slack < worst) { worst = slack; worstAt = `u=${u.toFixed(2)} @ ${vw}x${vh}`; }
    }
  }
  console.log(`\n  belt clearance under the copy: ${(worst * 100).toFixed(2)}% of frame height at the worst point (${worstAt})`);
  if (worst < 0) console.log('  *** THE BELT IS INSIDE THE COPY KEEP-OUT ***');
})().catch((e) => { console.error(e); process.exit(1); });
