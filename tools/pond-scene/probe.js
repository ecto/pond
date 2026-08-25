'use strict';
/* Pose probe. Answers the one question the joint tables cannot: WHERE does a
   given pose actually put a link, in the stage frame, after grounding.

   Joint sign conventions in these URDFs are not guessable — the README says so
   and every character in here has cost someone an hour of guessing. This runs
   a pose through the same forward kinematics the renderers use, applies the
   same Z-up -> Y-up rotation, drops the character onto the deck the way the
   grounding solve does, and prints link positions in metres.

   Usage:
     node probe.js h2 '{"left_elbow_joint":1.2}' left_hand_link right_hand_link
     node probe.js k1 '{"Left_Knee_Pitch":1.0}' left_foot_link Head_2

   With no pose it reports the rest pose from build.js. `hands` is accepted as
   a pseudo-link and reports the midpoint of the two *_hand_link origins, which
   is where the cube rides (see anim/world.mjs CARRY). */
const THREE = require('three');
const { build, SPECS } = require('./build');
const { fk } = require('./preview');

const key = process.argv[2];
if (!SPECS[key]) { console.error(`unknown robot ${key}; have ${Object.keys(SPECS).join(', ')}`); process.exit(1); }
const pose = process.argv[3] && process.argv[3] !== '-' ? JSON.parse(process.argv[3]) : (SPECS[key].rest || {});
const want = process.argv.slice(4);

const char = build(key);
char.key = key;
const world = fk(char, pose);

/* Z-up (URDF) -> Y-up (stage), the single rotation the runtime applies at the
   character root. Same expression build.js measures its bounds through. */
const toStage = (p) => new THREE.Vector3(p.x, p.z, -p.y);
const at = (n) => {
  const W = world[n];
  if (!W) return null;
  return toStage(new THREE.Vector3().setFromMatrixPosition(W));
};

/* the grounding solve: push the body down until the lowest ground link is on
   the deck. Everything below is reported in that dropped frame, which is the
   frame the stage actually sees. */
const GROUND = { h2: ['left_ankle_pitch_link', 'right_ankle_pitch_link'],
  k1: ['left_foot_link', 'right_foot_link'],
  go2: ['FL_foot', 'FR_foot', 'RL_foot', 'RR_foot'], z1: [] };
let drop = 0;
const g = GROUND[key] || [];
if (g.length) {
  let lo = Infinity;
  for (const n of g) { const p = at(n); if (p && p.y < lo) lo = p.y; }
  if (lo !== Infinity) drop = -lo;
}

/* whole-body extent in the dropped frame, so `height` here is what the stage
   normalises by */
let lo = Infinity, hi = -Infinity;
const v = new THREE.Vector3();
for (const n of Object.keys(char.links)) {
  const p = char.links[n].positions, W = world[n];
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(W);
    const y = toStage(v).y + drop;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
}

console.log(`\n${key}  ground drop ${drop.toFixed(4)}m   swept height ${(hi - lo).toFixed(4)}m`);
const names = want.length ? want : Object.keys(world);
for (const n of names) {
  if (n === 'hands') {
    const a = at(key === 'h2' ? 'left_hand_link' : 'left_hand_link');
    const b = at(key === 'h2' ? 'right_hand_link' : 'right_hand_link');
    if (!a || !b) { console.log('  hands: missing'); continue; }
    const m = a.clone().add(b).multiplyScalar(0.5);
    console.log(`  ${'hands'.padEnd(26)} (${m.x.toFixed(4)}, ${(m.y + drop).toFixed(4)}, ${m.z.toFixed(4)})`);
    continue;
  }
  const p = at(n);
  if (!p) { console.log(`  ${n}: MISSING`); continue; }
  console.log(`  ${n.padEnd(26)} (${p.x.toFixed(4)}, ${(p.y + drop).toFixed(4)}, ${p.z.toFixed(4)})`);
}
