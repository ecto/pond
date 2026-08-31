/* Pond landing scene — four real robots sharing one stage.

   One floor at y=0, one fixed camera, and characters that walk, shuffle and
   hop around on it. The camera never tracks anyone: it re-solves only for the
   viewport aspect, and the roam regions are chosen so the whole cast's swept
   silhouette stays inside the frame at every supported viewport (see
   stage.mjs, and `node preview.js extents` for the numbers).

   Loads site-wide via Mintlify custom scripts, so it must be a no-op anywhere
   the landing frame is absent. */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, Object3D, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, BufferGeometry, BufferAttribute, BoxGeometry,
  Raycaster, Vector2, Vector3, Quaternion, CircleGeometry, CanvasTexture, Color,
} from 'three';
import { MESH_B64 } from './mesh-data.js';
import { WORK, PERIOD, ENTRY_END, REACTIONS_BY_KEY, CHARACTERS,
  createPointerState, updatePointer, pointerFor } from './anim/index.mjs';
import { HEIGHT, MODEL_SCALE, cameraFor } from './stage.mjs';
import { makeClock, beginReaction, phaseOf, isExpired, bodyChannel } from './anim/reaction.mjs';
import { pulse as worldPulse, holderAt, parkedCube, CARRY, CUBE, PROPS, MASTER } from './anim/world.mjs';
import { isDarkPage, themeSettings, setupRenderer, buildEnvironment, buildLights,
  buildShadowCatcher, makeMaterials } from './studio.js';

/* How far the shared heartbeat swings the accent emissive. Deliberately small:
   the accents are saturated brand colours on small parts, and anything more
   than a hint reads as a blinking LED rather than as breathing. */
const PULSE_LO = 0.02, PULSE_HI = 0.15;

/* Reduced motion freezes the whole scene at ONE moment of the master clock —
   the same moment for all four, which is the entire point now that they share a
   task. Freezing each character at its own phase (which is what the old
   per-character FROZEN_U did) would scatter the cast across the score and leave
   the cube floating beside whoever was supposed to be holding it.

   Master 57 is the middle of the dwell (54..60): the cube is parked on the
   K1's bench, the K1 is standing over it having just put it there, the H2 is at
   its station watching from across the shop, the dog is at its patrol post and
   the arm is at rest. Everybody at a station, nobody mid-stride, nobody
   mid-fold, and the one thing they are all doing is sitting on the bench in
   plain sight.

   The belt is stopped at 57 too, which matters: beltVelocity() runs the line a
   little either side of each crossing, and freezing on a moment when it was
   still turning would show a stationary belt with its surface mid-slide.

   Offset by a whole period so every character is past its entrance. */
const FROZEN_MASTER = 57.0;
const FROZEN_AT = FROZEN_MASTER + MASTER;

/* Pond's four mark colours, one per character, over the shared bone/ink base */
const BONE = 0xefece2, INK = 0x212327;
const CAST = [
  { key: 'h2', accent: 0x0000ff },     // the host takes the blue the frog wore
  { key: 'k1', accent: 0xcf331e },     // and the kid takes the T1's red
  { key: 'go2', accent: 0x2aa13f },
  { key: 'z1', accent: 0xf0ad00 },
];

/* Props: cheap primitives, but they are what make the work legible. Sizes and
   offsets are in the robot's own metres, in its own frame. Kept in sync with
   preview.js. */
/* THE CUBE. One prop for the whole cast, not one each — see anim/world.mjs.
   Its owner is a function of the master clock, and it is never a child of a
   character: the pond-bot's subtree is scaled by 0.001 and a cube parented into
   that would render at 50 microns. It lives at the scene root and is placed
   every frame from its owner's attach node. */

/* where in its loop a frozen (reduced-motion) character sits: mid-work, on the
   deck, after its entrance has finished */

/* ---------------- payload decode ----------------
   [u32 header length][JSON header][per-link geometry records] */
function decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const hl = new DataView(bytes.buffer).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + hl)));
  const base = 4 + hl;
  const out = {};
  for (const r of header.robots) {
    const links = {};
    for (const L of r.links) {
      const o = base + L.o;
      const q = new Int16Array(bytes.buffer, o, L.nv * 3);
      const index = new Uint16Array(bytes.buffer, o + L.nv * 6, L.nt * 3);
      const matId = new Uint8Array(bytes.buffer, o + L.nv * 6 + L.nt * 6, L.nv);
      const positions = new Float32Array(L.nv * 3);
      for (let i = 0; i < L.nv; i++) {
        for (let c = 0; c < 3; c++) {
          positions[i * 3 + c] = ((q[i * 3 + c] + 32768) / 65535) * L.size[c] + L.min[c];
        }
      }
      links[L.n] = { positions, index, matId };
    }
    out[r.name] = { ...r, links };
  }
  return out;
}

/* One Mesh per palette slot. `mats` is this robot's three shared materials
   (bone, ink, accent) — shared rather than per-link, so the whole cast is a
   dozen materials instead of a hundred and three, and three.js can keep the
   draw state stable between links. */
function linkMeshes(link, mats) {
  const g = new Group();
  const { positions, index, matId } = link;
  for (let id = 0; id < 3; id++) {
    const keep = [];
    for (let t = 0; t < index.length; t += 3) {
      if (matId[index[t]] === id) keep.push(index[t], index[t + 1], index[t + 2]);
    }
    if (!keep.length) continue;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setIndex(keep);
    geo.computeVertexNormals();
    const m = new Mesh(geo, mats[id]);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** rebuild the URDF node graph: one Object3D per link, wired by the joint table */
function buildSkeleton(robot, mats) {
  const nodes = {};
  for (const name of Object.keys(robot.links)) {
    const n = new Object3D();
    n.name = name;
    n.add(linkMeshes(robot.links[name], mats));
    nodes[name] = n;
  }
  const joints = [];
  for (const j of robot.joints) {
    const child = nodes[j.c], parent = nodes[j.p];
    if (!child || !parent) continue;
    parent.add(child);
    const originPos = new Vector3().fromArray(j.pos);
    const originQuat = new Quaternion().fromArray(j.quat);
    child.position.copy(originPos);
    child.quaternion.copy(originQuat);
    if (j.t !== 'f') {
      joints.push({
        name: j.n, node: child, originQuat, prismatic: j.t === 'p',
        axis: new Vector3().fromArray(j.axis).normalize(),
        lim: j.lim, basePos: originPos,
      });
    }
  }
  return { nodes, joints, root: nodes[robot.root] };
}

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(0,0,0,0.40)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

const EASE = (t) => 1 - Math.pow(1 - t, 3);

/* ---------------- the scene ---------------- */
function start(frame) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let canvas, renderer;
  try {
    canvas = document.createElement('canvas');
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) { return null; }
  if (!renderer || !renderer.getContext || !renderer.getContext()) return null;

  canvas.className = 'pond-scene-canvas';
  Object.assign(canvas.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '0', display: 'block',
  });
  frame.appendChild(canvas);

  const robots = decode(MESH_B64);
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 200);

  /* The studio: one procedural IBL, a key/fill/rim rig, and a shadow-catching
     deck. Everything about the look lives in studio.js; everything about the
     page's two themes lives in themeSettings(). */
  let dark = isDarkPage();
  let S = themeSettings(dark);
  setupRenderer(renderer, S);
  scene.environment = buildEnvironment(renderer, S);
  scene.environmentIntensity = S.envIntensity;
  const lights = buildLights(scene, S);
  const deck = buildShadowCatcher(scene, S);
  const allMats = [];
  const accentMats = [];

  const blobTex = blobTexture();
  const actors = [];
  const byKey = {};

  for (const spec of CAST) {
    const robot = robots[spec.key];
    if (!robot) continue;

    /* root(floor position) > tilt > squash > norm(unit height -> stage height)
       > shift(pivot) > gnd(foot contact) > zup > links */
    const root = new Group();
    const tilt = new Group();
    const squash = new Group();
    const norm = new Group();
    const shift = new Group();
    const gnd = new Group();
    const zup = new Group();
    const stageScale = MODEL_SCALE[spec.key];   // TRUE SCALE: one stage unit is one metre
    norm.scale.setScalar(stageScale);
    shift.position.set(-robot.pivot[0], -robot.pivot[1], -robot.pivot[2]);
    if (!robot.yUp) zup.rotation.x = -Math.PI / 2;   // URDF is Z-up, the stage is Y-up
    root.add(tilt); tilt.add(squash); squash.add(norm);
    norm.add(shift); shift.add(gnd); gnd.add(zup);

    const mats = makeMaterials(spec.accent, S);
    allMats.push(...mats);
    accentMats.push(mats[2]);
    const skel = buildSkeleton(robot, mats);
    zup.add(skel.root);
    scene.add(root);

    // shadow lives on the floor, not on the character, so a hop lifts the body
    // away from its own contact patch the way it should
    const blob = new Mesh(
      /* sized off the FOOTPRINT, not the height. At true scale the Go2 is
         0.46 tall but 0.7 long, so a height-derived patch sat under its belly
         and left the feet visually unsupported. */
      new CircleGeometry(0.75 * (CHARACTERS[spec.key].roam.halfWidth || 0.3), 20),
      // a tight contact darkening under the feet. The cast shadow does the
      // big grounding; this does the last centimetre, where a shadow map is
      // always too coarse and where the eye actually looks for contact.
      new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false,
        opacity: S.contactOpacity })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.002;
    scene.add(blob);

    /* the node the cube rides on when this character is carrying it. For the
       T1 that is a node pinned every frame to the midpoint of its two hands;
       for everyone else it is a real link. */
    const C = CARRY[spec.key];
    const carry = !C ? null
      : C.node === 'hands'
        ? (() => { const o = new Object3D(); (skel.nodes.Trunk || skel.root).add(o); return o; })()
        : (skel.nodes[C.node] || skel.root);

    byKey[spec.key] = null;
    actors.push({
      spec, robot, root, tilt, squash, norm, shift, gnd, zup, skel, blob,
      groundNodes: (robot.ground || []).map((n) => skel.nodes[n]).filter(Boolean),
      carry, carryCfg: C,
      hands: [skel.nodes.left_hand_link, skel.nodes.right_hand_link],
      act: WORK[spec.key],
      reactions: REACTIONS_BY_KEY[spec.key] || [],
      limits: Object.fromEntries(robot.joints.filter((j) => j.lim).map((j) => [j.n, j.lim])),
      vicinity: (CHARACTERS[spec.key].params || {}).vicinity || 1,
      at: { x: 0, z: 0 },
      period: PERIOD[spec.key] || 10,
      entryEnd: ENTRY_END[spec.key] || 0,
      ctx: { mps: 1 / stageScale },
      react: null,
    });
  }

  /* ---- pointer awareness ----
     Passive listeners only; the projection into stage space happens once per
     frame in render(). Character modules read it through ctx.pointer and decide
     for themselves what to do with it. */
  let lastCam = null;
  const pointer = createPointerState();
  const setNdc = (cx, cy, touch) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    pointer.ndcX = ((cx - r.left) / r.width) * 2 - 1;
    pointer.ndcY = -((cy - r.top) / r.height) * 2 + 1;
    pointer.isTouch = !!touch;
    pointer.active = pointer.ndcX >= -1 && pointer.ndcX <= 1 && pointer.ndcY >= -1 && pointer.ndcY <= 1;
  };
  const onPointerMove = (ev) => setNdc(ev.clientX, ev.clientY, ev.pointerType === 'touch');
  const onPointerDown = onPointerMove;
  const onPointerOut = () => { pointer.active = false; };
  const onTouch = (ev) => {
    const p = ev.touches && ev.touches[0];
    if (p) setNdc(p.clientX, p.clientY, true);
  };
  const POINTER_OPTS = { passive: true };
  window.addEventListener('pointermove', onPointerMove, POINTER_OPTS);
  window.addEventListener('pointerdown', onPointerDown, POINTER_OPTS);
  window.addEventListener('pointerleave', onPointerOut, POINTER_OPTS);
  window.addEventListener('touchstart', onTouch, POINTER_OPTS);
  window.addEventListener('touchmove', onTouch, POINTER_OPTS);

  /* Resolution ladder. The studio look costs about twice the geometry work of
     the old flat one — the shadow depth pass draws the whole cast a second
     time — which is comfortable on a fast machine and is exactly the kind of
     thing that quietly drops a weak integrated GPU to 30fps. This page loads on
     every landing visit, so it gives up pixels rather than smoothness: if the
     measured frame interval stays bad, step the pixel ratio down a rung.

     Downgrades only. An adaptive scheme that climbs back up oscillates on
     precisely the machines it is meant to help, and a landing scene that
     visibly changes sharpness while you read is worse than one that is a rung
     softer than it could have been. */
  const DPR_LADDER = [2, 1.5, 1.25, 1];
  let dprStep = 0;
  const dprCap = () => Math.min(window.devicePixelRatio || 1, DPR_LADDER[dprStep]);

  /* the camera adapts to the viewport aspect and nothing else */
  /* The most pixels we will ever ask a GPU to shade, before the DPR ladder.
     Every one of them goes through a PCF shadow pass, so this is the number
     that decides whether the scene runs or crawls. 4.2M is a 2560x1600 retina
     frame: generous, and an order of magnitude cheaper than what an unclamped
     frame rect can ask for. */
  const MAX_BUFFER_PX = 4.2e6;

  function layout() {
    const r = frame.getBoundingClientRect();
    /* Size against the frame INTERSECTED WITH THE VIEWPORT, never the raw
       frame rect. `.landing-frame` is `min-height: 100vh` inside a docs shell
       that gives it whatever width it likes, and the rect can come back far
       larger than anything on screen — measured at 1651x1576 CSS on a 1280-wide
       viewport, which at DPR 2 is a 3302x3152 buffer: 10.4M pixels, 2.5x the
       budget, every one of them shadow-mapped. The result was ~1 frame per
       second, which is also slow enough that the DPR ladder below never gets
       the samples it needs to rescue itself. Shading pixels that are not on
       screen is never right; clamping here is not a workaround. */
    const vw = Math.max(1, Math.min(r.width, window.innerWidth || r.width));
    const vh = Math.max(1, Math.min(r.height, window.innerHeight || r.height));

    /* and cap the total, so an unusual viewport cannot blow the budget either */
    let dpr = dprCap();
    const px = vw * vh * dpr * dpr;
    if (px > MAX_BUFFER_PX) dpr = Math.max(1, dpr * Math.sqrt(MAX_BUFFER_PX / px));

    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    const cam = cameraFor(vw / vh);
    lastCam = cam;
    camera.fov = cam.fov;
    camera.aspect = vw / vh;
    camera.position.set(0, cam.camY, cam.dist);
    camera.lookAt(0, cam.camY, 0);
    camera.updateProjectionMatrix();
  }
  layout();

  /* The docs theme toggles without navigating, so the look has to follow it
     live. Everything theme-dependent is re-derived from themeSettings(); the
     IBL is the only expensive part, and it is one PMREM pass on a toggle. */
  function applyTheme(nextDark) {
    if (nextDark === dark) return;
    dark = nextDark;
    S = themeSettings(dark);
    renderer.toneMappingExposure = S.exposure;
    const old = scene.environment;
    scene.environment = buildEnvironment(renderer, S);
    scene.environmentIntensity = S.envIntensity;
    if (old) old.dispose();
    lights.key.intensity = S.keyIntensity;
    lights.fill.intensity = S.fillIntensity;
    lights.rim.intensity = S.rimIntensity;
    lights.amb.intensity = S.ambient;
    deck.material.opacity = S.shadowOpacity;
    for (const m of allMats) {
      m.envMapIntensity = m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial
        ? S.envIntensity * 1.28 : S.envIntensity;
      m.needsUpdate = true;
    }
    if (reduced) render(0);
  }
  const themeObserver = new MutationObserver(() => applyTheme(isDarkPage()));
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => applyTheme(isDarkPage());
  if (colorScheme.addEventListener) colorScheme.addEventListener('change', onScheme);

  /* ---- the cube, and the two pallets it rests on ----
     One prop, owned by whoever the score says is holding it. Placed from the
     owner's attach node every frame rather than parented to it, so the
     pond-bot's 0.001 subtree scale never reaches it. */
  for (const a of actors) byKey[a.spec.key] = a;
  /* The cube is the protagonist — it is what the whole cast is doing — so it
     gets Pond's primary blue rather than a base tone, and it breathes on the
     same heartbeat as the four accents. One object, one mind, one job. It also
     has to be findable on BOTH page themes: a bone cube disappears on white and
     an ink one disappears on black, while a saturated blue holds against
     either. */
  const CUBE_BLUE = 0x0000ff;
  const cubeMat = new MeshStandardMaterial({
    color: new Color(CUBE_BLUE), roughness: 0.34, metalness: 0.0,
    emissive: new Color(CUBE_BLUE), emissiveIntensity: 0,
  });
  const cube = new Mesh(new BoxGeometry(CUBE, CUBE, CUBE), cubeMat);
  cube.castShadow = true; cube.receiveShadow = true;
  scene.add(cube);
  /* the set, straight off world.mjs — see PROPS there for why this is not two
     hand-maintained copies any more */
  for (const P of PROPS) {
    const m = new Mesh(new BoxGeometry(P.w, P.h, P.d),
      new MeshStandardMaterial({ color: new Color(BONE), roughness: 0.7, metalness: 0 }));
    m.position.set(P.at.x, P.h / 2, P.at.z);
    if (P.yaw) m.rotation.y = P.yaw;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }

  const cubePos = new Vector3(), cubeQuat = new Quaternion(), cubeScl = new Vector3();
  const cubeOff = new Vector3();
  /** put the cube where the score says it is, at scene time `now` */
  function placeCube(now) {
    const h = holderAt(now);
    const a = h && byKey[h];
    const C = a && a.carryCfg;
    const node = a && a.carry;
    if (!a || !C || !node) {
      const p = parkedCube(now);
      cube.position.set(p.x, p.y, p.z);
      cube.quaternion.identity();
      return;
    }
    node.updateWorldMatrix(true, false);
    node.matrixWorld.decompose(cubePos, cubeQuat, cubeScl);
    // the offset is in metres in the node's own frame; the node's scale is the
    // character's model scale, which the cube must NOT inherit
    cubeOff.set(C.offset[0], C.offset[1], C.offset[2]).applyQuaternion(cubeQuat);
    cube.position.copy(cubePos).add(cubeOff);
    cube.quaternion.copy(cubeQuat);
  }

  /* ONE clock for the whole scene: seconds since it started. The frame loop and
     the click handler both read time from here, and they must — a reaction's
     phase is the difference between the two, so a mismatched origin does not
     look like a small error, it looks like a reaction that never ends. */
  const clock = makeClock();

  /* click -> raycast -> one random morphology-appropriate reaction, played
     wherever the character happens to be standing */
  const ray = new Raycaster();
  const ndc = new Vector2();
  function onClick(ev) {
    if (reduced) return;
    const r = canvas.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    for (const a of actors) {
      if (a.react) continue;
      if (!ray.intersectObject(a.root, true).length) continue;
      // clock(), NOT performance.now(): the frame loop runs on a scene-relative
      // clock, and stamping an absolute one here made every reaction start at
      // t = -(page uptime) and never expire. See anim/reaction.mjs.
      const r2 = beginReaction(a.reactions, clock());
      if (!r2) break;
      a.react = r2;
      break;
    }
  }
  window.addEventListener('click', onClick, true);

  /* ---- per-frame posing ---- */
  const tmpV = new Vector3();
  const tmpQ = new Quaternion();
  const midV = new Vector3();
  const body = { rot: { x: 0, y: 0, z: 0 }, pos: { y: 0 }, scl: { x: 1, y: 1 } };

  function poseActor(a, t, now) {
    // hand the reaction back BEFORE posing, so neither the joint deltas nor the
    // body channel is ever evaluated past the end of its own window
    if (a.react && isExpired(a.react, now)) a.react = null;
    const w = a.act(t, a.ctx);
    const R = a.react && a.react.R;
    const jd = R && R.joints ? R.joints(phaseOf(a.react, now), a.react.dir) : null;

    for (const j of a.skel.joints) {
      let q = w.j[j.name] || 0;
      if (jd && jd[j.name]) q += jd[j.name];
      if (j.lim) q = Math.max(j.lim[0], Math.min(j.lim[1], q));
      if (j.prismatic) j.node.position.copy(j.basePos).addScaledVector(j.axis, q);
      else j.node.quaternion.copy(j.originQuat).multiply(tmpQ.setFromAxisAngle(j.axis, q));
    }

    // Standing on the floor is the invariant: push the character down until its
    // lowest planted link is back on the deck. The URDF root is the trunk, so
    // bending the legs lifts the FEET rather than lowering the body.
    if (a.groundNodes.length) {
      a.gnd.position.y = 0;
      a.root.updateMatrixWorld(true);
      let lo = Infinity;
      for (const n of a.groundNodes) {
        n.getWorldPosition(tmpV);
        a.shift.worldToLocal(tmpV);
        if (tmpV.y < lo) lo = tmpV.y;
      }
      if (lo !== Infinity) a.gnd.position.y = -lo;
    }

    // the T1's carry node rides the midpoint of its two hands
    if (a.carry && a.carryCfg && a.carryCfg.node === 'hands' && a.hands[0] && a.hands[1]) {
      a.root.updateMatrixWorld(true);
      const trunk = a.carry.parent;
      a.hands[0].getWorldPosition(tmpV);
      midV.copy(trunk.worldToLocal(tmpV));
      a.hands[1].getWorldPosition(tmpV);
      midV.add(trunk.worldToLocal(tmpV)).multiplyScalar(0.5);
      a.carry.position.copy(midV);
    }

    return w;
  }

  function render(now) {
    const dtMs = lastNow == null ? 0 : Math.min(120, (now - lastNow) * 1000);
    lastNow = now;
    // watch the real frame interval; give up pixels before smoothness
    if (dtMs > 0 && dprStep < DPR_LADDER.length - 1) {
      /* Two rules, and the first one is the one that matters at boot.

         A frame that takes longer than 80ms is not a machine that needs
         watching for a while, it is a machine that is already failing, and
         waiting 45 samples to say so takes 45 SECONDS at 1fps — by which time
         the visitor has scrolled past. So a single catastrophic frame drops a
         rung immediately. The sustained average is still there underneath for
         the ordinary case: a machine that is merely a bit slow, where one
         unlucky frame should not cost sharpness. */
      /* ...but not for the first couple of measured frames. Shader compilation
         and the first upload land there, and they can cost 100ms+ on a GPU
         that is perfectly capable of holding 60fps a moment later. Penalising
         a fast machine for its one-time warm-up is how a scene ends up
         permanently softer than it needed to be. A genuinely 1fps boot still
         drops a rung on the very next frame. */
      warm++;
      if (warm > 2 && dtMs > 80) {
        dprStep++; perfAcc = 0; perfN = 0; layout();
      } else if (warm > 2) {
        perfAcc += dtMs; perfN++;
        if (perfN >= 45) {
          if (perfAcc / perfN > 20) { dprStep++; layout(); }
          perfAcc = 0; perfN = 0;
        }
      }
    }
    if (lastCam) updatePointer(pointer, lastCam, now);

    /* ONE MIND. Every accent part on every character breathes together, off a
       single clock — the same number at the same moment on four machines. It is
       the cheapest possible way to say "same mind, different bodies", and it
       only works because it is shared: give each character its own phase and it
       reads as four idles instead of one thought. Reduced motion pins it. */
    const beat = worldPulse(now, reduced);
    const emissive = PULSE_LO + (PULSE_HI - PULSE_LO) * beat;
    for (const m of accentMats) m.emissiveIntensity = emissive;

    for (const a of actors) {
      const t = reduced ? FROZEN_AT : now;
      // reduced motion neutralises the pointer overlay for everyone
      a.ctx.pointer = reduced ? undefined
        : pointerFor(pointer, { x: a.at.x, z: a.at.z, key: a.spec.key, vicinity: a.vicinity }, now, dtMs);
      a.ctx.reducedMotion = reduced;
      a.ctx.limits = a.limits;
      const w = poseActor(a, t, now);
      a.at.x = w.place.x; a.at.z = w.place.z;
      // work-loop tilt/squash, then a running reaction's nudge over the top
      // (poseActor has already expired a finished one). Shared with the preview
      // and the selftest — see anim/reaction.mjs.
      bodyChannel(w, a.react, now, body);

      const rise = w.rise == null ? 1 : w.rise;
      a.root.position.set(w.place.x, (w.lift || 0) + body.pos.y * HEIGHT[a.spec.key], w.place.z);
      a.root.rotation.y = (w.place.yaw || 0) + body.rot.y;
      a.tilt.rotation.set(body.rot.x, 0, body.rot.z);
      a.squash.scale.set(body.scl.x, body.scl.y * rise, body.scl.x);

      // the contact patch stays on the floor and fades as the body leaves it
      a.blob.position.set(w.place.x, 0.002, w.place.z);
      const air = (w.lift || 0) / Math.max(0.001, HEIGHT[a.spec.key]);
      a.blob.material.opacity = Math.max(0, 1 - air * 1.6) * rise * S.contactOpacity;
      a.blob.visible = rise > 0.02;
      a.root.visible = rise > 0.02;
    }
    placeCube(reduced ? FROZEN_AT : now);
    cubeMat.emissiveIntensity = emissive;
    renderer.render(scene, camera);
  }

  let raf = 0, running = true, lastNow = null, perfAcc = 0, perfN = 0, warm = 0;
  function frameLoop() {
    raf = requestAnimationFrame(frameLoop);
    if (!running) return;
    render(clock());
  }

  if (reduced) render(0);       // one still frame: a grounded tableau
  else frameLoop();

  const onResize = () => { layout(); if (reduced) render(0); };
  window.addEventListener('resize', onResize);
  const onVis = () => { running = !document.hidden; };
  document.addEventListener('visibilitychange', onVis);

  // progressive enhancement: the PNGs were the fallback, retire them
  const pngs = frame.querySelectorAll('.landing-critter');
  pngs.forEach((el) => { el.dataset.pondHidden = '1'; el.style.display = 'none'; });

  return function dispose() {
    cancelAnimationFrame(raf);
    themeObserver.disconnect();
    if (colorScheme.removeEventListener) colorScheme.removeEventListener('change', onScheme);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('pointermove', onPointerMove, POINTER_OPTS);
    window.removeEventListener('pointerdown', onPointerDown, POINTER_OPTS);
    window.removeEventListener('pointerleave', onPointerOut, POINTER_OPTS);
    window.removeEventListener('touchstart', onTouch, POINTER_OPTS);
    window.removeEventListener('touchmove', onTouch, POINTER_OPTS);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    pngs.forEach((el) => { if (el.dataset.pondHidden) { el.style.display = ''; delete el.dataset.pondHidden; } });
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    blobTex.dispose();
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  };
}

/* ---------------- lifecycle across Mintlify client-side navigation ---------------- */
(function boot() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  let active = null, activeFrame = null;

  function sync() {
    const frame = document.querySelector('.landing-frame');
    if (frame && frame !== activeFrame) {
      if (active) { active(); active = null; }
      if (frame.querySelector('.pond-scene-canvas')) return;
      activeFrame = frame;
      try { active = start(frame); } catch (e) {
        console.error('[pond-scene] start failed:', e);
        active = null;
      }
      if (!active) {
        frame.querySelector('.pond-scene-canvas')?.remove();
        activeFrame = null;   // WebGL failed: PNG fallback stays
      }
    } else if (!frame && active) {
      active(); active = null; activeFrame = null;
    }
  }

  const run = () => { try { sync(); } catch (e) { /* never break the page */ } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();

  const mo = new MutationObserver(() => run());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', run);
})();
