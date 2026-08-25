# The character animation interface

Four robots, four files, four owners. This document is the contract between a
character module and everything around it.

```
anim/
  pondbot.mjs   go2.mjs   t1.mjs   z1.mjs     <- one owner each. Edit freely.
  index.mjs     context.mjs                   <- SHARED. Do not edit.
  kinematics.mjs  schedule.mjs  pointer.mjs   <- SHARED. Import, never edit.
  INTERFACE.md
```

If you find yourself wanting to change a shared file to get an effect, stop and
raise it — either the interface is missing something (let's add it deliberately,
for all four) or the change belongs in your own module.

---

## 1. What a character module exports

```js
export default {
  key: 'go2',
  params,                      // your tunables, a plain object
  roam,                        // where you may stand (see §5)
  ground,                      // link origins that rest on the floor (see §4)
  period,                      // seconds for one loop of `work`
  entryEnd,                    // seconds `entrance` runs before `work` takes over
  entrance(ctx, t),            // t counts from 0 at page load
  work(ctx, t),                // t keeps counting; use t - entryEnd if you want loop-local time
  reactions: [                 // click reactions, layered over whatever `work` did
    { name: 'playbow', duration: 1.25, update(ctx, t, dir) { ... } },
  ],
};
```

`t` is absolute seconds since the scene started. `entrance` is called while
`t < entryEnd`, `work` after. Both get the same `ctx`. A reaction's `t` is
normalised 0..1 across its own `duration`, and `dir` is ±1 so a reaction can be
mirrored.

Everything is a **pure function of time**. No hidden state between frames — the
offline tools evaluate arbitrary times out of order, and anything stateful will
render differently there than it does in the browser.

---

## 2. The `ctx` API

### Joints

| call | effect |
| --- | --- |
| `ctx.set(name, rad)` | absolute angle, radians |
| `ctx.add(name, rad)` | additive — what reactions and overlays use |
| `ctx.setAll(pose)` | merge an object of `{name: rad}` |
| `ctx.get(name)` | what has been written so far this frame |
| `ctx.limit(name)` | `[lo, hi]` from the URDF, or `null` |

**Angles outside a joint's URDF limit are silently clamped by the runtime.**
Check `ctx.limit()` before inventing a pose; the tables in §7 list every limit.

### Placement

| call | effect |
| --- | --- |
| `ctx.moveTo(x, z)` | floor position, stage units — **clamped to your roam region** |
| `ctx.face(yaw)` | heading, radians (see §3) |
| `ctx.lift(y)` | stage units off the deck. The only thing that may leave the floor |
| `ctx.tilt(pitch, roll)` | whole-body lean, about the character's floor point |
| `ctx.squash(s)` | vertical scale, for anticipation and impact |
| `ctx.rise(v)` | 0..1 arrival scale, for characters that rise into place |

### Props

`ctx.holdProp()` attaches the prop to your hand/gripper; `ctx.dropProp(where)`
leaves it exactly where it was (the runtime re-parents it preserving the world
transform, so a released crate stays put); `ctx.noProp()` if you have none.
`where` is an optional label so several parked spots can be distinguished.

### Reaction channel

`ctx.nudge({ rotX, rotY, rotZ, posY, sclX, sclY })` moves the whole character
for the duration of a reaction. `posY` is in body heights. Use `ctx.add()` in the
same `update` for articulated parts — a good reaction usually does both.

### Read-only

`ctx.t`, `ctx.key`, `ctx.params`, `ctx.bounds`, `ctx.entering`,
`ctx.reducedMotion`, and:

`ctx.mps` — **metres per stage unit** for your robot. Gaits are authored in the
robot's own metres (that is where the IK lives) while travel is planned in stage
units; multiply by `ctx.mps` to cross over. Never hard-code it.

---

## 3. Frames and conventions

- **Stage**: `x` runs across the frame, `z` toward the camera, `y` up, floor at
  `y = 0`. One stage unit is roughly a T1 height.
- **Facing**: a robot's own forward axis is URDF `+x`, and a Y rotation of `yaw`
  sends local `+x` to `(cos yaw, -sin yaw)`. So a heading toward `(dx, dz)` is
  **`atan2(-dz, dx)`**. `-PI/2` faces the camera. Getting this wrong makes a
  character walk sideways; `schedule.follow()` already does it for you.
- **Robot-local**: URDF is **Z-up** (`+x` forward, `+z` up). All joint angles,
  IK targets and link lengths are in that frame, in metres. The runtime applies
  one −90° X rotation at the character root.

---

## 4. The grounding contract

Every robot's URDF root is its **trunk**, not its feet. Bending the legs
therefore lifts the FEET rather than lowering the body. Shared code fixes this
every frame: it pushes the character down until the lowest of the links named in
`ground` is back on the deck.

Two consequences you must design around:

1. **You do not control body height directly.** To make a character crouch, move
   its feet closer to its hips (a smaller `stand` value); the grounding does the
   rest. Writing a vertical offset will be undone.
2. **A planted foot must not travel across the ground.** This is what
   `kinematics.legIK()` is for: command the foot's *position* and let the IK find
   the angles. During stance, move the foot backward at exactly the body's
   forward speed and skating becomes impossible by construction. Drive gait phase
   by distance travelled (`follow()` returns `s`), never by wall-clock time.

The selftest measures planted-foot slip and fails above 5% of body speed.

---

## 5. Moving a character, and why the region is small

`ctx.moveTo()` clamps into `roam.work` (or `roam.entry` during the entrance).
A waypoint outside the region simply has no effect — the constraints live out
here so that tuning a robot cannot break the page layout.

**The regions are currently tight — for some characters, a point.** That is not
caution, it is measured: the landing layout has almost no horizontal slack left
once you require full visibility, a hard keep-out under the copy, and the cast
spread to the edges. `node preview.js roam` prints how much room each character
actually has, and today the answer for the Go2 and Z1 is "none".

So: **tune motion, not position.** Gait, timing, poses, secondary motion,
reactions and pointer behaviour are all yours. Relocating a character means
re-solving the composition (character sizes, `stage.mjs`) and is a shared-code
change — raise it rather than editing `roam` upward, because widening the region
without re-solving makes the guard rail lie.

---

## 6. Pointer awareness

`ctx.pointer` is computed by shared code every frame, per character:

| field | meaning |
| --- | --- |
| `present` | a pointer is over the frame |
| `stagePos` | `{x, z}` where the ray meets the **floor** — the target for "walk toward it" |
| `atMyDepth` | `{x, y, z}` where the ray crosses the vertical plane at **your** depth — the target for "look at it" |
| `distance` | floor distance from you, stage units |
| `direction` | unit `{x, z}` from you toward the pointer |
| `speed` | pointer speed across the floor, stage units/second |
| `dwellMs` | how long it has lingered within your `params.vicinity` radius |
| `isTouch` | touch rather than mouse |
| `attention` | **recommended** 0..1 weight: near and lingering ⇒ 1 |

### The layering contract

Pointer behaviour is an **overlay**, not a replacement. Compute your work pose
first, then blend the overlay on top, then let shared code ground the result:

```js
export function work(ctx, t) {
  poseTheWorkLoop(ctx, t);                    // 1. the job

  const p = ctx.pointer;                      // 2. the overlay
  if (p.present) {
    const w = p.attention;                    //    or your own ramp from distance/dwell
    const want = Math.atan2(-(p.atMyDepth.z - myZ), p.atMyDepth.x - myX);
    ctx.set('AAHead_yaw', mix(ctx.get('AAHead_yaw'), want, w));
    ctx.add('Head_pitch', 0.2 * w);
  }
}                                             // 3. grounding happens after you return
```

Blend rather than overwrite (`mix` toward the target by the weight) so the work
loop still reads underneath. Keep overlays to head, torso and end-effectors —
overlaying onto legs fights the grounding and the anti-skate invariant.

**Reduced motion**: shared code hands you `NO_POINTER` (`present: false`,
`attention: 0`) whenever `prefers-reduced-motion` is set, so the pattern above
switches itself off. Do not work around it.

The click → random reaction path is separate and stays in shared code; you only
supply the `reactions` array.

---

## 7. Joint tables

Axis is in the robot's own frame. Zero pose is the URDF's, described per robot.
Limits are from the URDF and **are enforced by the runtime**.

### Go2 — zero pose: legs straight down, body level

| joint | axis | limits (rad) | chain |
| --- | --- | --- | --- |
| `FL_hip_joint` | +x | −1.05 … 1.05 | base → FL_hip |
| `FL_thigh_joint` | +y | −1.57 … 3.49 | FL_hip → FL_thigh |
| `FL_calf_joint` | +y | −2.72 … −0.84 | FL_thigh → FL_calf |
| `FR_hip_joint` | +x | −1.05 … 1.05 | base → FR_hip |
| `FR_thigh_joint` | +y | −1.57 … 3.49 | FR_hip → FR_thigh |
| `FR_calf_joint` | +y | −2.72 … −0.84 | FR_thigh → FR_calf |
| `RL_hip_joint` | +x | −1.05 … 1.05 | base → RL_hip |
| `RL_thigh_joint` | +y | −0.52 … 4.54 | RL_hip → RL_thigh |
| `RL_calf_joint` | +y | −2.72 … −0.84 | RL_thigh → RL_calf |
| `RR_hip_joint` | +x | −1.05 … 1.05 | base → RR_hip |
| `RR_thigh_joint` | +y | −0.52 … 4.54 | RR_hip → RR_thigh |
| `RR_calf_joint` | +y | −2.72 … −0.84 | RR_thigh → RR_calf |

Positive `thigh` swings the foot **backward**. The leg is an exact two-link
planar chain, `L1 = L2 = 0.2130 m`, knee sign **−1**. There is **no neck joint** —
head movement has to come from the trunk, i.e. from `ctx.face()`.

### T1 — zero pose: standing straight, arms horizontal out to the sides

| joint | axis | limits (rad) | chain |
| --- | --- | --- | --- |
| `AAHead_yaw` | +z | −1.57 … 1.57 | Trunk → H1 |
| `Head_pitch` | +y | −0.35 … 1.22 | H1 → H2 |
| `Left_Shoulder_Pitch` | +y | −3.31 … 1.22 | Trunk → AL1 |
| `Left_Shoulder_Roll` | +x | −1.74 … 1.57 | AL1 → AL2 |
| `Left_Elbow_Pitch` | +y | −2.27 … 2.27 | AL2 → AL3 |
| `Left_Elbow_Yaw` | +z | −2.44 … 0.00 | AL3 → left_hand_link |
| `Right_Shoulder_Pitch` | +y | −3.31 … 1.22 | Trunk → AR1 |
| `Right_Shoulder_Roll` | +x | −1.57 … 1.74 | AR1 → AR2 |
| `Right_Elbow_Pitch` | +y | −2.27 … 2.27 | AR2 → AR3 |
| `Right_Elbow_Yaw` | +z | 0.00 … 2.44 | AR3 → right_hand_link |
| `Waist` | +z | −1.57 … 1.57 | Trunk → Waist |
| `Left_Hip_Pitch` | +y | −1.80 … 1.57 | Waist → Hip_Pitch_Left |
| `Left_Hip_Roll` | +x | −0.20 … 1.57 | Hip_Pitch_Left → Hip_Roll_Left |
| `Left_Hip_Yaw` | +z | −1.00 … 1.00 | Hip_Roll_Left → Hip_Yaw_Left |
| `Left_Knee_Pitch` | +y | 0.00 … 2.34 | Hip_Yaw_Left → Shank_Left |
| `Left_Ankle_Pitch` | +y | −0.87 … 0.35 | Shank_Left → Ankle_Cross_Left |
| `Left_Ankle_Roll` | +x | −0.44 … 0.44 | Ankle_Cross_Left → left_foot_link |
| `Right_Hip_Pitch` | +y | −1.80 … 1.57 | Waist → Hip_Pitch_Right |
| `Right_Hip_Roll` | +x | −1.57 … 0.20 | Hip_Pitch_Right → Hip_Roll_Right |
| `Right_Hip_Yaw` | +z | −1.00 … 1.00 | Hip_Roll_Right → Hip_Yaw_Right |
| `Right_Knee_Pitch` | +y | 0.00 … 2.34 | Hip_Yaw_Right → Shank_Right |
| `Right_Ankle_Pitch` | +y | −0.87 … 0.35 | Shank_Right → Ankle_Cross_Right |
| `Right_Ankle_Roll` | +x | −0.44 … 0.44 | Ankle_Cross_Right → right_foot_link |

Traps worth knowing before you spend an hour on them:

- **`Waist` is between the trunk and the LEGS**, not the torso. Yawing it swings
  both feet across the deck. Keep it tiny while walking.
- **There is no torso pitch.** T1 cannot bend forward at all; a squat is the only
  way down, which is why its crate is tall and gripped at the top rim.
- **`Shoulder_Roll` brings the arm down and in** (0 is a T-pose, |roll| ≈ 1.5 is
  at the side). `Shoulder_Pitch` **negative** swings it forward.
- **`Elbow_Yaw` limits are one-sided** (left ≤ 0, right ≥ 0); the current pose
  writes +0.20/−0.20 and is clamped to zero.
- The `*_hand_link` origin sits at the **elbow**, not the hand.
- The leg is a two-link planar chain, `L1 = 0.2363`, `L2 = 0.2920`, knee sign
  **+1**. Keep the sole flat with `ankle = -(hip + knee)`.

### Z1 — zero pose: arm extended horizontally forward

| joint | axis | limits (rad) | chain |
| --- | --- | --- | --- |
| `joint1` | +z | −2.62 … 2.62 | link00 → link01 (base yaw) |
| `joint2` | +y | 0.00 … 2.97 | link01 → link02 (shoulder) |
| `joint3` | +y | −2.88 … 0.00 | link02 → link03 (elbow) |
| `joint4` | +y | −1.52 … 1.52 | link03 → link04 (wrist pitch) |
| `joint5` | +z | −1.34 … 1.34 | link04 → link05 (wrist yaw) |
| `joint6` | +x | −2.79 … 2.79 | link05 → link06 (tool roll) |

The elbow folds **negative** on this arm. The keyposes hold `joint3` constant at
−1.56 and sweep the shoulder, so interpolating between them moves along one arm
posture and never folds `link04` back through `link02`.

> Fixed, but worth knowing: these poses used to drive `joint3` to +1.9, outside
> its limit. The runtime clamped it to 0 and shipped a nearly straight arm that
> never reached its cube, while the preview — which did not clamp — drew the
> intended pose. `preview.js` now applies limits exactly as the runtime does and
> the selftest fails on out-of-limit authoring, so this cannot recur silently.

### pond-bot

No joints. Everything is body-level: `moveTo`, `face`, `lift`, `tilt`, `squash`.

---

## 8. Running your own loop

```bash
npm install

# contact sheets for one character: entrance, work cycle, every reaction.
# --out is required when several people work in parallel — never share a dir.
node preview.js character go2 --out /tmp/go2-anim

# the whole composited frame at the four test viewports
npm run preview

# the quality bar
npm run selftest
```

### The quality bar — all of these must stay green

| check | bar |
| --- | --- |
| node-graph FK vs reference FK | < 0.1 mm |
| leg IK inverts its own FK | exact |
| planted-foot slip while walking | **< 5%** of body speed |
| frame-edge budget | nothing past its crop allowance |
| copy keep-out | **zero** overlap, every viewport, every roam extreme |
| authored joint angles | inside URDF limits (waived exceptions are listed in `selftest.js`) |

`npm run selftest` asserts all of them. It is fast; run it after every change,
and always before you hand work back.

Two more habits worth having:

- **Look at every frame you generate.** These robots have non-obvious joint
  conventions and half the bugs found so far were invisible in numbers and
  obvious in a picture.
- **Respect the joint limits.** The preview applies them now, so offline and
  live agree, and the selftest fails on anything new. If you need a pose the
  limits forbid, the answer is a different pose, not a bigger number.
