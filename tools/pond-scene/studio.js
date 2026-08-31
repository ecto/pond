/* Studio look — SHARED rendering code for the landing scene.

   The cast used to be lit by a key light, a fill and a lot of ambient, shaded
   with MeshLambertMaterial. That reads as a game asset: every surface takes the
   same flat wash, nothing has a material, and on the dark theme the ink parts
   fall into the #000 page background and disappear.

   This is the product-render recipe instead:

     * one procedural studio environment (a gradient dome plus three softbox
       panels), pre-filtered through PMREMGenerator into an IBL. That single
       step is what makes a surface look like a material — the bone panels pick
       up a soft overhead sheen, the ink parts get grazing highlights that hold
       their silhouette against black.
     * physically-based materials, one set per robot, parameterised per part
       class: powder-coat bone, rubbery ink, glossy accent.
     * a filmic tone map, so the highlights roll off instead of clipping.
     * a real soft shadow onto the deck, plus a tight contact darkening right
       under the feet where the shadow map runs out of resolution.

   No external assets: the dome gradient is drawn into a canvas at runtime and
   everything else is geometry. Nothing here is per-character.

   THEMES. The page is either #fff or #000 behind a transparent canvas, and the
   two want different things. Light wants a cast shadow to do the grounding.
   Dark wants separation — a shadow on black is invisible, so the work is done
   by a rim light and a hotter environment, and the cast shadow is dialled back
   to a hint. `themeSettings()` holds the whole difference. */

import {
  Scene, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshPhysicalMaterial,
  ShadowMaterial, PlaneGeometry, SphereGeometry, Color, CanvasTexture,
  DirectionalLight, AmbientLight, PMREMGenerator,
  NeutralToneMapping, SRGBColorSpace, PCFSoftShadowMap, BackSide, FrontSide,
} from 'three';

/* Khronos PBR Neutral, not ACES.

   ACES is the film-grade default and it rolls off beautifully, but it also
   rotates saturated hues on its way to the display — pure #0000ff comes out
   noticeably purple-grey, and the four accents are Pond's mark colours, which
   have to survive. PBR Neutral was designed for exactly this case (product
   viewers, where the brand colour must still be the brand colour) and keeps the
   diffuse albedo of an unlit-ish surface intact while still compressing
   highlights. Rendered side by side, the bone and ink read the same under both;
   only the accents differ, and only Neutral keeps them. */
export const TONE_MAPPING = NeutralToneMapping;

/* Pond's base palette. Accents are per character and come from scene.js. */
const BONE = 0xefece2;
const INK = 0x212327;

/** Is the page dark? Read the actual painted background rather than a class
    name, so this survives whatever the docs theme calls itself. */
export function isDarkPage() {
  try {
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const c = getComputedStyle(el).backgroundColor;
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || '');
      if (!m) continue;
      if (m[4] !== undefined && parseFloat(m[4]) === 0) continue;   // transparent, keep looking
      const lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
      return lum < 0.5;
    }
  } catch (e) { /* fall through */ }
  return false;
}

/** Everything that differs between the two page themes, in one place.

    Budgeting note, because this is the thing that goes wrong: the IBL is a
    light. Adding an environment on top of the old key+fill+ambient levels
    doubled the total irradiance and blew the bone panels to flat white — the
    exact opposite of the goal, since all the product-render quality lives in
    the gradient across a panel. The bone albedo (#efece2) is already at 0.87
    linear, so total irradiance has to land near 1.0 for it to render around
    0.85 with its shading intact. Ambient is 0 on purpose: the environment IS
    the ambient, and a constant term on top only flattens what it just bought. */
export function themeSettings(dark) {
  return dark ? {
    exposure: 1.02,
    envIntensity: 0.82,
    keyIntensity: 1.18,
    fillIntensity: 0.20,
    rimIntensity: 1.30,      // the separator — without this the ink vanishes
    ambient: 0.0,
    shadowOpacity: 0.55,     // near-invisible on #000, but it catches the deck
    contactOpacity: 0.42,
    envTop: '#333a47', envMid: '#141821', envBot: '#060607',
    panel: 0xffffff, panelWarm: 0xfff4e2, panelCool: 0xd6e4ff,
    panelPower: [1.80, 0.80, 1.95],
  } : {
    exposure: 0.92,
    envIntensity: 0.78,
    keyIntensity: 1.10,
    fillIntensity: 0.22,
    rimIntensity: 0.30,
    ambient: 0.0,
    shadowOpacity: 0.20,     // the grounding on white
    contactOpacity: 0.30,
    envTop: '#ffffff', envMid: '#eceef2', envBot: '#c2c6ce',
    panel: 0xffffff, panelWarm: 0xfff8f0, panelCool: 0xdfe9ff,
    panelPower: [1.85, 0.85, 0.95],
  };
}

/* ---------------- the environment ----------------
   A dome for the ambient gradient and three panels for the shape. The panels
   are what a product photographer would set up: a big soft key high and to the
   left, a cool bounce low and right to keep the shadow side from going dead,
   and a narrow strip behind for the edge highlight that separates a dark part
   from a dark background. */
function domeTexture(top, mid, bot) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0.00, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1.00, bot);
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 64);
  return new CanvasTexture(c);
}

function studioScene(S) {
  const s = new Scene();
  const dome = new Mesh(
    new SphereGeometry(12, 24, 16),
    new MeshBasicMaterial({ map: domeTexture(S.envTop, S.envMid, S.envBot), side: BackSide })
  );
  s.add(dome);

  const panel = (w, h, pos, look, color, power) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({
      color: new Color(color).multiplyScalar(power), side: DoubleSide,
    }));
    m.position.set(pos[0], pos[1], pos[2]);
    m.lookAt(look[0], look[1], look[2]);
    s.add(m);
    return m;
  };
  const P = S.panelPower;
  // key softbox: high, left, angled down at the stage
  panel(9, 6, [-5.0, 7.0, 5.0], [0, 0, 0], S.panelWarm, P[0]);
  // cool bounce: low, right, fills the shadow side
  panel(8, 4, [6.0, 1.2, 3.5], [0, 1, 0], S.panelCool, P[1]);
  // back strip: the rim that separates a dark robot from a dark page
  panel(11, 2.2, [0, 3.2, -7.5], [0, 1.2, 0], S.panel, P[2]);
  return s;
}

/** Build the IBL. One PMREM pass at boot, then the source scene is thrown away. */
export function buildEnvironment(renderer, S) {
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const src = studioScene(S);
  const rt = pmrem.fromScene(src, 0.03);
  src.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
  pmrem.dispose();
  return rt.texture;
}

/* ---------------- materials ----------------
   One set per robot, shared by every link, so the whole cast is a handful of
   materials rather than one per link per palette slot. Three part classes:

     bone    powder-coated plastic panel — matte, a faint clearcoat so the
             highlight has an edge to it rather than a broad dull sheen
     ink     rubbery/anodised joints, feet, cabling — dark and soft, but with
             enough spec to catch the rim and hold a silhouette on black
     accent  the mark colour — the glossiest thing on the robot, so the eye
             goes to it. Clearcoat, because that is what a moulded, painted
             part actually looks like. */
export function makeMaterials(accent, S) {
  const env = S.envIntensity;
  /* Standard, not Physical. The bone panels are far and away the largest area
     on screen, and clearcoat adds a second specular lobe to every one of those
     pixels. Rendered side by side the clearcoat version is very slightly
     crisper at the highlight and indistinguishable everywhere else — it does
     not pay for the most expensive shader in the frame covering the most
     pixels. The accent keeps its clearcoat: tiny area, and the gloss is the
     whole point of it. */
  const bone = new MeshStandardMaterial({
    color: new Color(BONE),
    roughness: 0.58,
    metalness: 0.0,
    envMapIntensity: env,
    side: FrontSide,
  });
  const ink = new MeshStandardMaterial({
    color: new Color(INK),
    roughness: 0.82,
    metalness: 0.14,
    envMapIntensity: env * 1.28,   // the ink lives or dies on reflected light
    side: FrontSide,
  });
  /* The accent also carries the shared heartbeat (see anim/world.mjs): all
     four characters' accent parts breathe on ONE clock, in phase. It rides
     emissive rather than colour so the brand hue itself never moves — only how
     lit it looks. scene.js drives emissiveIntensity every frame. */
  const acc = new MeshPhysicalMaterial({
    color: new Color(accent),
    emissive: new Color(accent),
    emissiveIntensity: 0,
    roughness: 0.30,
    metalness: 0.0,
    clearcoat: 0.65,
    clearcoatRoughness: 0.16,
    envMapIntensity: env,
    side: FrontSide,
  });
  acc.userData.isAccent = true;
  return [bone, ink, acc];
}

/* ---------------- the rig ---------------- */
export function setupRenderer(renderer, S) {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING;
  renderer.toneMappingExposure = S.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
}

/** Key / fill / rim / ambient, plus the shadow-casting frustum around the
    stage. The frustum is deliberately tight: the cast spans about ±2.6 in x
    and ±1 in z, so a small ortho box keeps a 1024 map at a usable density. */
export function buildLights(scene, S) {
  const key = new DirectionalLight(0xfff4e4, S.keyIntensity);
  key.position.set(-2.9, 4.6, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const c = key.shadow.camera;
  c.left = -3.6; c.right = 3.6; c.top = 3.0; c.bottom = -1.2;
  c.near = 0.5; c.far = 14;
  c.updateProjectionMatrix();
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 2.6;
  scene.add(key);
  scene.add(key.target);

  const fill = new DirectionalLight(0xdfe8ff, S.fillIntensity);
  fill.position.set(3.4, 0.9, 2.4);
  scene.add(fill);

  // from behind and above: the edge that lifts a dark robot off a dark page
  const rim = new DirectionalLight(0xffffff, S.rimIntensity);
  rim.position.set(0.8, 2.6, -4.2);
  scene.add(rim);

  const amb = new AmbientLight(0xffffff, S.ambient);
  scene.add(amb);
  return { key, fill, rim, amb };
}

/** The deck. Invisible except where something casts onto it, so the page
    background still shows through everywhere else. */
export function buildShadowCatcher(scene, S) {
  const m = new Mesh(
    new PlaneGeometry(24, 14),
    new ShadowMaterial({ opacity: S.shadowOpacity, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0;
  m.receiveShadow = true;
  m.renderOrder = -1;
  scene.add(m);
  return m;
}

/** Mark every mesh under a character as a caster and a receiver. Self-shadowing
    is free in the depth pass and is most of what makes a jointed machine look
    solid rather than papery. */
export function enableShadows(root) {
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
}
