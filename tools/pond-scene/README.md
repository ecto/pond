# pond-scene

Build pipeline for the live 3D landing scene (`docs/pond-scene.js`): four real
robots — pond-bot, Unitree Go2, Booster T1, Unitree Z1 — rendered with three.js
on a WebGL canvas over `.landing-frame` (the `/start/welcome` landing page).
Mintlify's custom-scripts mechanism loads the bundle site-wide, so the runtime
is a no-op on any page without a landing frame.

The characters are **articulated**: the payload keeps each robot's URDF link
hierarchy — per-link geometry plus a joint table — and the runtime drives joint
angles, so each one performs an actual job rather than bobbing in place.

They also share **one stage**: a single floor at y=0 and one fixed camera that
re-solves for the viewport aspect and nothing else. Nobody is pinned to a
screen position and nobody floats — the characters walk, shuffle and hop around
the floor, and standing on it is an invariant rather than a correction.

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
| what one character is *doing* (work loop, entrance, gait, reactions, pointer behaviour) | `anim/<character>.mjs` — see `anim/INTERFACE.md` |
| shared motion machinery (IK, schedules, pointer projection, the reaction lifecycle, the authoring context) | `anim/kinematics.mjs`, `anim/schedule.mjs`, `anim/pointer.mjs`, `anim/reaction.mjs`, `anim/context.mjs` |
| the stage itself: camera framing, true scale, swept-extent constants | `stage.mjs` |
| colours, props, lifecycle | `scene.js` |
| lighting, materials, tone mapping, the two page themes | `studio.js` |
| triangle budgets, palette mapping, poses baked into the payload | `build.js` |

The `anim/` modules are shared by the runtime and the offline preview, so a pose
you eyeball in a contact sheet is the pose that ships. Each character is one
file with a single owner; **`anim/INTERFACE.md` is the contract** — the ctx API,
the joint tables, the grounding and anti-skate rules, and the quality bar.

## Look at the work before you accept it

```
npm run preview             # full-frame stage sheets at the test viewports
npm run preview -- extents  # swept-extent margins, as numbers
npm run preview -- solve    # report the cast's swept world extents
npm run preview -- character t1 --out DIR   # one character: entrance, work, every reaction
```

`preview` renders the WHOLE composited frame through the same camera solve the
runtime uses, at 1280x700, 1280x1000, 1440x1300 and 1280x1400, at six times
chosen to catch the roam extremes — which is where cropping would reappear —
with the copy's keep-out rectangle tinted in. It goes
through a small software rasterizer (`raster.js`), so no browser is involved.
**Look at every frame.** The joint sign conventions are not guessable; every
pose and facing in `work.mjs` was found by rendering candidates and picking.
(The heading convention in particular: the robots' forward axis is URDF +x, so
a facing is `atan2(-dz, dx)`. Getting that wrong makes the Go2 walk sideways,
which the foot-slip check in the selftest catches.)

`extents` prints, per character per viewport, how much clear margin its swept
silhouette leaves on each frame edge and whether it intersects the copy. Nothing
may be negative and nothing may be under the copy. Edge margins in the 3-6%
range are the target: much larger means the cast has bunched toward the centre.

```
npm run selftest
```

Decodes `mesh-data.js` exactly as the browser does, rebuilds the three.js node
graph the same way, and checks every link's world transform against the
reference matrix FK. It also checks that the leg IK really inverts the leg's
forward kinematics, and — the one that matters most — that a planted foot does
not travel across the ground while the body moves. Anything above 5% of body
speed reads as skating and fails the test.

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
back on the deck. On a shared floor this is what keeps everyone standing on it.

## The stage

**Text high and centred, machines low and at the edges.**

Floor at y=0. The camera is **level** — no tilt — sitting `camY` above the floor
and looking down -Z, which puts the horizon exactly at screen centre: a
character further downstage stands lower in the frame, and the ground recedes
without the keystoning a tilted camera would add. The floor under the stage
centre lands 12% up from the bottom edge.

**One stage unit is one metre.** The cast is at TRUE scale — a 97mm pond-bot,
a 0.46m Go2, a 0.51m Z1 and a 1.13m T1 — rather than normalised to a common
on-screen height. The frog is a twelfth of the humanoid's height, which is the
honest size story: Pond spans a desk-size machine and a person-size one.
`MODEL_SCALE` in `stage.mjs` is the whole conversion (the URDFs are in metres,
the pond-bot GLB is in millimetres); there is no per-character taste number.
The frog stays legible by standing DOWNSTAGE, close to the camera, where
perspective gives back most of what true scale takes away — which is why
`FLOOR_FRAC` sits at 0.26 rather than 0.12, buying downstage depth without
tilting the camera.

**Width is the primary constraint.** The visible width at the stage plane is
fixed (`VW_BASE`), so the cast fills the frame side to side and each character
keeps the same share of the width at every viewport. Height follows from the
aspect, and because the floor is pinned near the bottom, a taller viewport turns
into empty air *above* the cast — where the title lives — rather than shrinking
or re-centring anyone. `VH_MIN` stops very short/wide viewports from pulling the
camera so close that perspective across the stage's depth gets silly.

The camera solves from the viewport aspect alone. It never tracks a character,
never bobs, and never repositions anyone in screen space.

### The copy keep-out

The landing copy is a first-class constraint, not a hope. `keepOut(w, h)` returns
the rectangle the machines must stay out of: the 544px centred text column, from
the top of the frame down past the CTAs, plus a little pad. The model is fitted
to the live DOM — the measurements and the fit are in `stage.mjs`. Both
`preview.js extents` and the selftest assert that **no character's swept screen
AABB intersects it at any viewport or roam extreme**, and the stage sheets tint
the rectangle so a violation is visible at a glance.

That leaves two safe bands, left and right of the column, which is where the
cast lives — Go2 and pond-bot left, T1 and Z1 right. Within a band the pair is
separated by *depth*: pond-bot and the Z1 stand well downstage of the Go2 and
T1, so they sit lower in the frame and in front. Small edge margins are the
goal, not large ones — a big margin everywhere means the cast has drifted back
to the middle, which is the failure mode this layout exists to prevent.

### The crop budget

Full visibility for everyone, a hard copy keep-out, and an edge-spread layout
are three claims on one budget, and the band width is what pays. The original
PNG layout bought big characters by letting them run off the frame, so a little
of that is allowed back: `OUTER` names one edge per character and `CROP_MAX`
lets it hang up to 10% of its own swept width off that edge — the Go2 to the
left, the Z1 to the right. A cropped dog hindquarter or arm base reads as
staging; a half-cropped humanoid just reads broken, so **T1 and pond-bot stay
whole**, and the copy keep-out stays at zero tolerance for everyone.

`edgeAllowance()` turns that into the per-edge requirement the extents tool and
the selftest both assert. It is worth roughly 40% of linear size on the two
characters that use it.

Depth is deliberately shallow (|z| under ~0.8). The screen-x of a world point
depends on aspect only through its depth, so a deep stage makes the horizontal
composition drift between viewports; keeping the cast shallow keeps the bands
stable from 1280x700 to 1280x1400.

## Files

| file | role |
| --- | --- |
| `scene.js` | runtime: node graph, posing, grounding, lifecycle. Bundle entry point. |
| `studio.js` | the look: procedural IBL, PBR materials per part class, tone mapping, the light rig, and the whole light/dark theme difference. |
| `anim/<character>.mjs` | one character's choreography. One owner each. |
| `anim/index.mjs` | assembles the cast, applies the roam clamps, exposes the runtime API. |
| `anim/context.mjs` | the authoring context characters write through. |
| `anim/kinematics.mjs` | planar leg IK and foot paths. |
| `anim/schedule.mjs` | easing, keyframe tracks, waypoint schedules. |
| `anim/pointer.mjs` | pointer raycast into stage space, per-character view. |
| `anim/reaction.mjs` | the reaction lifecycle: the scene clock, a reaction's 0..1 phase, expiry, and the body channel. Shared by the runtime, the preview and the selftest. |
| `anim/world.mjs` | **the world task**: stations, the master clock, who holds the cube, the handoff moments, and the shared heartbeat. The score all four characters read from. |
| `anim/INTERFACE.md` | the character-module contract. Read this first. |
| `stage.mjs` | floor, camera solve, character sizes, the copy keep-out. Shared with the preview. |
| `mesh-data.js` | **generated** base64 skeleton + geometry payload. |
| `export.js` | packs the built characters into `mesh-data.js`. |
| `build.js` | per-character specs: source, pose, palette mapping, triangle budget. |
| `assemble.js` | URDF/GLB -> per-link geometry; welding and budgeted decimation. |
| `urdf.js` | minimal URDF parser (links, joints, axes, limits, mesh refs). |
| `loaders.js` | DAE/STL/GLB mesh loading. |
| `preview.js` | offline stage renders, swept-extent and keep-out checks. |
| `raster.js` | tiny software rasterizer + PNG writer. |
| `selftest.js` | decode, node-graph FK equivalence, IK inversion, and foot-slip checks. |
| `glb-export.js` | optional: writes the posed, skinned characters back out as GLBs. |

## The look

Studio product render, not game asset. The recipe is in `studio.js`:

- **One procedural environment**, a gradient dome plus three softbox panels,
  pre-filtered through `PMREMGenerator` into an IBL. No external assets — the
  gradient is drawn into a canvas at runtime. This single ingredient is what
  makes a surface read as a material rather than as a lit polygon.
- **Khronos PBR Neutral tone mapping**, deliberately not ACES. ACES rolls off
  more prettily but rotates saturated hues, and the four accents are Pond's
  mark colours — `#0000ff` has to still look like `#0000ff`. Neutral was built
  for product viewers, where that is the requirement.
- **Materials per part class**: bone is powder-coated plastic
  (`MeshStandardMaterial`, roughness 0.58, metalness 0); ink is rubbery/anodised
  (roughness 0.82, a little metalness, extra `envMapIntensity` so it holds an
  edge against a black page); accent is the glossiest thing on the robot
  (`MeshPhysicalMaterial` with clearcoat — small area, and the gloss is the
  point). One set of three per robot, shared by every link.
- **A real soft shadow** (PCFSoft, 1024 map, tight ortho around the stage) onto
  a `ShadowMaterial` deck, plus a tight contact darkening at the feet for the
  last centimetre the shadow map cannot resolve.

**Both page themes are first-class.** `themeSettings()` holds the entire
difference: on white the cast shadow does the grounding; on black a shadow is
invisible, so a rim light and a hotter environment do the separating instead.
The theme is read from the painted background, and a `MutationObserver` re-lights
the scene when the docs toggle it without navigating.

The budget note that matters: **the IBL is a light.** Adding an environment on
top of the previous key/fill/ambient levels doubled the irradiance and blew the
bone panels to flat white, which is the opposite of the goal — all the quality
lives in the gradient across a panel. Ambient is now 0; the environment is the
ambient.

### What it costs

The shadow pass draws the cast a second time, so geometry work doubles:

| | before | after |
| --- | --- | --- |
| draw calls / frame | 59 | 115 |
| triangles / frame | 247,242 | 494,406 |
| shader programs | 3 | 11 |

Measured main-thread cost per frame roughly doubles with it, from ~1.5ms to
~3.3ms at 1280x1000 on a fast machine — comfortably inside a 16.7ms budget, but
the kind of margin that disappears on weak integrated graphics. So `scene.js`
carries a **resolution ladder**: if the measured frame interval stays above
20ms, the pixel ratio steps down a rung (2 → 1.5 → 1.25 → 1). Downgrades only —
a scheme that climbs back up oscillates on exactly the machines it is meant to
help.

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

## The world task

`anim/world.mjs` is the score: one cube, one closed circuit, a master clock, and
a role for each character at every moment. It is a pure function of time, so the
offline tools and the browser agree by construction.

The circuit is shaped by a measured fact, not a preference. Ask which characters
can physically stand *under* the copy column — floor still on screen, own height
below the copy's bottom edge — and only one can do it at all four viewports:

| viewport | pond-bot | Go2 | Z1 | T1 |
| --- | --- | --- | --- | --- |
| 1280x700 | from z=1.32 | never | never | from z=4.66 |
| 1280x1000 | from z=-0.42 | from z=2.98 | from z=3.42 | never |
| 1440x1300 | from z=-2.00 | from z=1.44 | from z=2.00 | never |
| 1280x1400 | from z=-2.00 | from z=0.00 | from z=0.60 | never |

A downstage floor point sits *lower* in frame, so walking further forward drops
the floor off the bottom edge faster than distance shrinks a body: the Go2 runs
out of frame before it runs out from under the words. So the copy column is a
wall, and the frog is the only one small enough to pass under it — which is
exactly what makes it the courier. At true scale each body does what only it can:
the arm has precision, the dog has range and a flat back, the frog fits, the
humanoid has hands and height.

Stations are solved against `feasibleX` at their own depth, not eyeballed, and
the selftest asserts it: the usable band narrows fast downstage, and at true
scale the Z1 has no lateral room at all past z=0.5, the Go2 past z=1.2, the T1
past z=0.5, while the 75mm-half-width frog still has 330mm at z=2.0.

### One mind

All four accents breathe on **one** clock, in phase — the same number at the same
moment on four machines (`pulse()`, ~5s). It rides emissive rather than colour so
the brand hue never moves, only how lit it looks. It only says anything because
it is shared: give each character its own phase and it reads as four idles
instead of one thought. `prefers-reduced-motion` pins it to the middle.

## The work loops and gaits

Both the Go2 and T1 legs turned out to be exact two-link planar chains, so the
gaits are driven by **inverse kinematics on the foot**, not by keyframed joint
angles. During stance the foot is commanded to travel backward at exactly the
body's forward speed, which makes not-skating a property of the construction
rather than something to tune. Gait phase is driven by distance travelled, not
by time, so changing a character's speed changes its cadence and nothing else.

- **Z1 — pick and place.** Bolted to its spot downstage right; it arrives by
  rising into place rather than walking on. Reaches down to a bone cube, grasps, lifts and slews
  across, sets it down at a second spot, returns home; the next cycle runs the
  other way so the cube ping-pongs forever. The three arm keyposes live on one
  "arm extended" manifold (elbow held near 1.9 rad) because folding the elbow in
  drives `link04` straight through `link02`. 9.5s.
- **Go2 — sentry patrol.** Walks a four-waypoint patrol across the upstage left
  of the floor on a proper crawl gait (duty 0.75, three feet down at a time,
  sequence left-front, right-hind, right-front, left-hind), pausing at each
  waypoint to scan. While parked it rocks its weight and re-plants a foot now
  and then, and the trunk sweeps side to side — the Go2 has no neck joint, so
  the scan has to come from the body. Measured planted-foot slip: 1.7% of body
  speed.
- **T1 — carry and inspect.** Mostly stationary at a work spot upstage right:
  carries an ink crate gripped at its top rim, sways under the load, then squats
  to set it on the deck, stands and looks it over, squats again and picks it
  back up. Twice a loop it walks a few slow careful steps to the neighbouring
  spot and back. T1 has no torso-pitch joint — its "Waist" is a yaw that turns
  the *legs* — so the squat is the only way down, which is why the crate is tall
  and gripped high. Its weight shift lives in the body tilt rather than in hip
  roll: the lateral chain is one rotational DOF per joint, so rolling the hips
  cannot shift the pelvis without dragging the planted foot sideways (measured
  at ~15% of body speed, which reads as a skate). Shipped gait: a real IK walk,
  not the turn-in-place fallback. Slip 4.8%.
- **pond-bot — the host.** No joints of its own, so its work is social and its
  locomotion is ballistic: it hops between four spots downstage centre, turning
  mid-flight to face whichever coworker it is going to watch, squashing on
  takeoff and absorbing the landing. Its spots keep clear of the Z1's reach and
  the Go2's patrol. `lift` is the only thing in the whole scene that ever takes
  a character off the floor.

Every character walks on from offstage on its first pass — the entrance is just
the first leg of its schedule, so it arrives on a real gait — and then loops
forever. The periods differ, so the four never sync up.

Clicking a character plays one random articulated reaction (T1 bows from the
hips, the Go2 play-bows on folded forelegs, the Z1 waves its tool flange,
pond-bot backflips) layered additively over whatever it was doing.
`prefers-reduced-motion` renders a single still frame: everyone standing on the
floor at their spot in a natural mid-work pose, with no locomotion, no loop and
no reactions.
