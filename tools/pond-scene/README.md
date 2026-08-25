# pond-scene

Build pipeline for the live 3D landing scene (`docs/pond-scene.js`): four real
robots — pond-bot, Unitree Go2, Booster T1, Unitree Z1 — rendered with three.js
on a WebGL canvas over `.landing-frame` (the `/start/welcome` landing page).
Mintlify's custom-scripts mechanism loads the bundle site-wide, so the runtime
is a no-op on any page without a landing frame.

The characters are **articulated**: the payload keeps each robot's URDF link
hierarchy — per-link geometry plus a joint table — and the runtime drives joint
angles, so each one performs an actual job rather than bobbing in place.

## Rebuild the bundle (the common case)

```
cd tools/pond-scene
npm install
npm run bundle
```

Output goes to `docs/pond-scene.js` (esbuild, minified IIFE). Verify with
`node --check docs/pond-scene.js`; the dev server picks the file up on its own.

Edit:

| what you want to change | file |
| --- | --- |
| what a character is *doing* (work loops, click reactions) | `work.mjs` |
| where a character sits on the page, colours, props, camera, lighting | `scene.js` |
| triangle budgets, palette mapping, poses baked into the payload | `build.js` |

`work.mjs` is shared by the runtime and the offline preview, so a pose you
eyeball in a contact sheet is the pose that ships.

## Look at the work before you accept it

```
npm run preview        # -> preview/<robot>.png, preview/all.png
npm run preview -- z1  # one character
```

Renders each character at five phases of its work cycle through a small
software rasterizer (`raster.js`) — no browser needed. A grey slab marks the
measured ground contact, so a floating character or prop is obvious. **Look at
every frame.** The joint sign conventions are not guessable; every pose in
`work.mjs` was found by rendering candidates and picking.

```
npm run selftest
```

Decodes `mesh-data.js` exactly as the browser does, rebuilds the three.js node
graph the same way, and checks every link's world transform against the
reference matrix FK. Catches frame/quaternion/offset mistakes without a browser.

## Regenerating the mesh payload (needed after any `build.js` change)

`mesh-data.js` is **generated**, not hand-edited.

```
npm run mesh    # node export.js -> rewrites mesh-data.js
npm run bundle
```

This step needs the upstream robot repos under `tools/pond-scene/robots/`
(gitignored — they are large third-party clones, and the built payload is what
the site actually ships):

```
git clone https://github.com/unitreerobotics/unitree_ros  robots/unitree_ros
git clone https://github.com/BoosterRobotics/booster_gym   robots/booster_gym
```

Built against `unitree_ros` @ `4ddbf6d` and `booster_gym` @ `da396a0`. Sources
and licences are recorded in `assets/third_party/*/SOURCE.txt` (`unitree_go2`,
`unitree_z1`, `booster_t1`). pond-bot comes from `assets/pond-bot.glb`.

## Payload format

`[u32 header length][JSON header][per-link geometry records]`, base64'd into
`mesh-data.js`. The header carries the skeleton per robot — link list, joint
table with origins pre-decomposed to position + quaternion, joint axes, limits,
the rest pose, the links that rest on the ground, and the pivot/height used to
normalise the character to unit height. Each geometry record is one **link**, in
that link's own frame, with 16-bit positions quantised over the link's own bbox,
uint16 indices, and one palette-slot byte per vertex.

Material ids are palette *slots*, not colours: `0` bone `#efece2`, `1` ink
`#212327`, `2` accent. Each robot picks its own accent at runtime, one per Pond
mark colour — pond-bot blue `#0000ff`, Go2 green `#2aa13f`, T1 red `#cf331e`,
Z1 amber `#f0ad00`.

Sources stay in their native frame (URDF is Z-up); the runtime applies one
−90° X rotation at the character root. Because the URDF root is the *trunk*,
bending the legs lifts the feet rather than lowering the body, so every frame
the character is re-grounded by pushing it down until its lowest planted link is
back on the deck.

## Files

| file | role |
| --- | --- |
| `scene.js` | runtime: composition, node graph, animation, lifecycle. Bundle entry point. |
| `work.mjs` | the work loops and click reactions. Shared with the preview. |
| `mesh-data.js` | **generated** base64 skeleton + geometry payload. |
| `export.js` | packs the built characters into `mesh-data.js`. |
| `build.js` | per-character specs: source, pose, palette mapping, triangle budget. |
| `assemble.js` | URDF/GLB -> per-link geometry; welding and budgeted decimation. |
| `urdf.js` | minimal URDF parser (links, joints, axes, limits, mesh refs). |
| `loaders.js` | DAE/STL/GLB mesh loading. |
| `preview.js` | offline contact sheets: FK, props, ground slab, rasterised. |
| `raster.js` | tiny software rasterizer + PNG writer. |
| `selftest.js` | decode + node-graph FK equivalence check. |
| `glb-export.js` | optional: writes the posed, skinned characters back out as GLBs. |

## Budgets

Total bundle must stay at or under 4.5MB. Triangles are spent per link with a
silhouette weight (heads, torsos, upper legs get a finer weld cell), searched
against one global cell size so surface detail density stays uniform.

| robot | source tris | shipped tris | links | movable joints |
| --- | --- | --- | --- | --- |
| pond-bot | 32k | 28,682 | 1 | 0 |
| Go2 | 399k | 74,612 | 17 | 12 |
| T1 | 169k | 90,784 | 24 | 23 |
| Z1 | 178k | 53,060 | 7 | 6 |

## The work loops

- **Z1 — pick and place.** Reaches down to a bone cube, grasps, lifts and slews
  across, sets it down at a second spot, returns home; the next cycle runs the
  other way so the cube ping-pongs forever. The three arm keyposes live on one
  "arm extended" manifold (elbow held near 1.9 rad) because folding the elbow in
  drives `link04` straight through `link02`. 9.5s.
- **Go2 — sentry patrol.** Stationary scanning: weight rocks between the left
  and right pairs, one foot steps in place four times a cycle, and the trunk
  sweeps side to side (the Go2 has no neck joint, so the scan has to come from
  the body). 11s.
- **T1 — carry and inspect.** Carries an ink crate gripped at its top rim, sways
  under the load, then squats to set it on the deck, stands and looks it over,
  squats again and picks it back up. T1 has no torso-pitch joint — its "Waist"
  is a yaw that turns the *legs* — so the squat is the only way down, which is
  why the crate is tall and gripped high. 15s.
- **pond-bot — the host.** No joints of its own, so its work is social: it hops
  around to face each coworker in turn and watches them work. 8s.

Periods differ and each character starts at a random phase, so the four loops
never sync up.

Clicking a character plays one random articulated reaction (T1 bows from the
hips, the Go2 play-bows on folded forelegs, the Z1 waves its tool flange,
pond-bot backflips) layered additively over whatever it was doing.
`prefers-reduced-motion` freezes each character in a natural mid-work pose and
skips the loop and the reactions entirely.
