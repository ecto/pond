'use strict';
/* Calibrate a fold's `stand` against the LIVE handoff measurement.

   solve-fold.js answers "what pose puts the cube at height H", in isolation.
   That turned out not to be quite the same question as "where is the cube at
   master second T", because at T the character is also mid-blend between two
   folds, carrying its own sway, and standing at a yaw — and the difference was
   70mm, which is more than the handoff budget.

   So this asks the real question. It runs the actual module through the actual
   transform chain at the actual master second, and bisects one number until
   the cube lands where the score needs it. Slower than solving, and correct by
   construction.

     node calibrate.js h2 dog 26 0.278      # fold, master second, wanted cube y
     node calibrate.js h2 belt 34 0.145
     node calibrate.js k1 belt 47 0.145 */
const THREE = require('three');

const [, , key, foldName, atStr, wantStr] = process.argv;
const at = Number(atStr), want = Number(wantStr);

(async () => {
  const W = await import('./anim/world.mjs');
  const mod = await import(`./anim/${key}.mjs`);
  const { buildStage, placeMatrix } = require('./preview');
  const { cast } = await buildStage([key]);
  const char = cast[0];
  const C = W.CARRY[key];
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();

  const cubeAt = (t) => {
    const pm = placeMatrix(char, t);
    let NM;
    if (C.node === 'hands') {
      const a = new THREE.Vector3().setFromMatrixPosition(pm.world.left_hand_link);
      const b = new THREE.Vector3().setFromMatrixPosition(pm.world.right_hand_link);
      NM = new THREE.Matrix4().copy(pm.world[C.frame]).setPosition(a.add(b).multiplyScalar(0.5));
    } else NM = pm.world[C.node];
    new THREE.Matrix4().multiplyMatrices(pm.M, NM).decompose(V, Q, S);
    return V.clone().add(new THREE.Vector3(C.offset[0], C.offset[1], C.offset[2]).applyQuaternion(Q));
  };

  /* FOLD lives in the module's closure, so reach it the only way that does not
     require exporting internals: the module exposes it for exactly this. */
  const FOLD = mod.FOLD || (mod.default && mod.default.FOLD);
  if (!FOLD || !FOLD[foldName]) {
    console.error(`${key} does not expose FOLD.${foldName} — add \`export const FOLD\` to anim/${key}.mjs`);
    process.exit(1);
  }
  const F = FOLD[foldName];
  const t = W.MASTER * 2 + at + 0.02;

  const before = cubeAt(t);
  console.log(`${key}.${foldName} at master ${at}: cube y = ${before.y.toFixed(4)} (want ${want.toFixed(4)})`);

  /* Bisect on `stand`: a lower hip puts the cube lower, monotonically — but
     ONLY inside the leg's reachable annulus. Below |L1-L2| the IK clamps and
     the relationship flattens out and then reverses, which sends a naive
     bisection to the bottom of its range and reports a failure that is really
     a bad bound. So the range is the leg's own. */
  const P = (mod.params || mod.default.params);
  const legMin = Math.abs(P.L1 - P.L2) * 1.10 + 0.02;
  const legMax = (P.L1 + P.L2) * 0.98;
  let lo = legMin, hi = legMax, best = null;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    F.stand = mid;
    const y = cubeAt(t).y;
    if (!best || Math.abs(y - want) < Math.abs(best.y - want)) best = { stand: mid, y };
    if (y > want) hi = mid; else lo = mid;
  }
  F.stand = best.stand;
  const p = cubeAt(t);
  console.log(`  stand ${best.stand.toFixed(4)}  ->  cube (${p.x.toFixed(4)}, ${p.y.toFixed(4)}, ${p.z.toFixed(4)})`
    + `   err ${((p.y - want) * 1000).toFixed(1)}mm`);
  console.log(`  set FOLD.${foldName}.stand = ${best.stand.toFixed(4)} in anim/${key}.mjs`);
})().catch((e) => { console.error(e); process.exit(1); });
