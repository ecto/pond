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
  MeshBasicMaterial, MeshLambertMaterial, BufferGeometry, BufferAttribute, BoxGeometry,
  DirectionalLight, AmbientLight, Raycaster, Vector2, Vector3, Quaternion,
  CircleGeometry, CanvasTexture, Color, DoubleSide,
} from 'three';
import { MESH_B64 } from './mesh-data.js';
import { WORK, PERIOD, ENTRY_END, REACTIONS_BY_KEY, CHARACTERS,
  createPointerState, updatePointer, pointerFor } from './anim/index.mjs';
import { HEIGHT, cameraFor } from './stage.mjs';
import { makeClock, beginReaction, phaseOf, isExpired, bodyChannel } from './anim/reaction.mjs';

/* Pond's four mark colours, one per character, over the shared bone/ink base */
const BONE = 0xefece2, INK = 0x212327;
const CAST = [
  { key: 'pondbot', accent: 0x0000ff },
  { key: 'go2', accent: 0x2aa13f },
  { key: 't1', accent: 0xcf331e },
  { key: 'z1', accent: 0xf0ad00 },
];

/* Props: cheap primitives, but they are what make the work legible. Sizes and
   offsets are in the robot's own metres, in its own frame. Kept in sync with
   preview.js. */
const PROPS = {
  z1: { attach: 'link06', offset: [0.015, 0, 0], size: [0.07, 0.07, 0.07], color: BONE },
  t1: { attach: 'hands', offset: [0.16, 0, -0.253], size: [0.18, 0.30, 0.50], color: INK },
};

/* where in its loop a frozen (reduced-motion) character sits: mid-work, on the
   deck, after its entrance has finished */
const FROZEN_U = { pondbot: 0.42, go2: 0.12, t1: 0.16, z1: 0.45 };

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

/* one Mesh per palette slot, so plain materials do all the colouring */
function linkMeshes(link, accent) {
  const g = new Group();
  const { positions, index, matId } = link;
  for (const [id, color] of [[0, BONE], [1, INK], [2, accent]]) {
    const keep = [];
    for (let t = 0; t < index.length; t += 3) {
      if (matId[index[t]] === id) keep.push(index[t], index[t + 1], index[t + 2]);
    }
    if (!keep.length) continue;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setIndex(keep);
    geo.computeVertexNormals();
    g.add(new Mesh(geo, new MeshLambertMaterial({
      color: new Color(color),
      emissive: new Color(color).multiplyScalar(id === 1 ? 0.10 : 0.05),
      side: DoubleSide,
    })));
  }
  return g;
}

/** rebuild the URDF node graph: one Object3D per link, wired by the joint table */
function buildSkeleton(robot, accent) {
  const nodes = {};
  for (const name of Object.keys(robot.links)) {
    const n = new Object3D();
    n.name = name;
    n.add(linkMeshes(robot.links[name], accent));
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

  const key = new DirectionalLight(0xfff6e8, 2.15);
  key.position.set(-2.6, 4.2, 3.4);
  scene.add(key);
  const fill = new DirectionalLight(0xdfe6ff, 0.55);
  fill.position.set(3.2, 0.6, 2.0);
  scene.add(fill);
  scene.add(new AmbientLight(0xffffff, 1.05));

  const blobTex = blobTexture();
  const actors = [];

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
    const stageScale = HEIGHT[spec.key] / (robot.height || 1);
    norm.scale.setScalar(stageScale);
    shift.position.set(-robot.pivot[0], -robot.pivot[1], -robot.pivot[2]);
    if (!robot.yUp) zup.rotation.x = -Math.PI / 2;   // URDF is Z-up, the stage is Y-up
    root.add(tilt); tilt.add(squash); squash.add(norm);
    norm.add(shift); shift.add(gnd); gnd.add(zup);

    const skel = buildSkeleton(robot, spec.accent);
    zup.add(skel.root);
    scene.add(root);

    // shadow lives on the floor, not on the character, so a hop lifts the body
    // away from its own contact patch the way it should
    const blob = new Mesh(
      new CircleGeometry(0.42 * HEIGHT[spec.key], 20),
      new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.002;
    scene.add(blob);

    let prop = null, carry = null;
    const P = PROPS[spec.key];
    if (P) {
      prop = new Mesh(new BoxGeometry(P.size[0], P.size[1], P.size[2]), new MeshLambertMaterial({
        color: new Color(P.color),
        emissive: new Color(P.color).multiplyScalar(P.color === INK ? 0.10 : 0.05),
      }));
      carry = P.attach === 'hands'
        ? (() => { const o = new Object3D(); (skel.nodes.Trunk || skel.root).add(o); return o; })()
        : (skel.nodes[P.attach] || skel.root);
      prop.position.set(P.offset[0], P.offset[1], P.offset[2]);
      carry.add(prop);
    }

    actors.push({
      spec, robot, root, tilt, squash, norm, shift, gnd, zup, skel, blob,
      groundNodes: (robot.ground || []).map((n) => skel.nodes[n]).filter(Boolean),
      prop, carry, propHeld: true, propCfg: P,
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

  /* the camera adapts to the viewport aspect and nothing else */
  function layout() {
    const r = frame.getBoundingClientRect();
    const vw = Math.max(1, r.width), vh = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

    // the T1's crate rides a node pinned to the midpoint of its two hands
    if (a.carry && a.propCfg && a.propCfg.attach === 'hands' && a.hands[0] && a.hands[1]) {
      a.root.updateMatrixWorld(true);
      const trunk = a.carry.parent;
      a.hands[0].getWorldPosition(tmpV);
      midV.copy(trunk.worldToLocal(tmpV));
      a.hands[1].getWorldPosition(tmpV);
      midV.add(trunk.worldToLocal(tmpV)).multiplyScalar(0.5);
      a.carry.position.copy(midV);
    }

    // grasp / release: attach() keeps the world transform, so a released prop
    // simply stays where the character put it. Parking into `shift` rather than
    // the character's own frame means it stays put while the body re-grounds.
    if (a.prop && w.prop) {
      const want = !!w.prop.held;
      if (want !== a.propHeld) {
        (want ? a.carry : a.shift).attach(a.prop);
        if (want) a.prop.position.set(a.propCfg.offset[0], a.propCfg.offset[1], a.propCfg.offset[2]);
        a.propHeld = want;
      }
    }
    return w;
  }

  function render(now) {
    const dtMs = lastNow == null ? 0 : Math.min(120, (now - lastNow) * 1000);
    lastNow = now;
    if (lastCam) updatePointer(pointer, lastCam, now);
    for (const a of actors) {
      const t = reduced ? a.entryEnd + FROZEN_U[a.spec.key] * a.period : now;
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
      a.blob.material.opacity = Math.max(0, 1 - air * 1.6) * rise;
      a.blob.visible = rise > 0.02;
      a.root.visible = rise > 0.02;
    }
    renderer.render(scene, camera);
  }

  let raf = 0, running = true, lastNow = null;
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
      try { active = start(frame); } catch (e) { active = null; }
      if (!active) activeFrame = null;   // WebGL failed: PNG fallback stays
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
