/* The stage: one floor, one camera, four characters that work on it.
   Shared by the browser runtime (scene.js) and the offline stage preview
   (preview.js) so the framing you check offline is the framing that ships. */

export const FOV = 30;
const TAN_HALF = Math.tan((FOV * Math.PI) / 180 / 2);

/* ---------------- TRUE SCALE ----------------

   One stage unit is ONE METRE. Nothing is normalised to a common on-screen
   size any more.

   This used to be a HEIGHT map of hand-picked on-screen heights that made the
   cast read at "roughly comparable size regardless of the robots' true scale".
   That is a lie about the product, and the truth is a better story: Pond spans
   a desk-size frog and a person-size humanoid, and the scene should say so.

   MODEL_SCALE converts a character's source units to metres. The three URDFs
   are authored in metres already; the pond-bot GLB is a CAD export in
   millimetres. That is the whole conversion — there is no per-character taste
   number left in it.

   Measured rest/swept heights, for reference (metres):

     pond-bot  0.097   (the GLB is 85 x 97 x 120 mm)
     Go2       0.461   (~0.40 at the shoulder, plus the back)
     Z1        0.508   in its work sweep; 0.74 at full reach
     T1        1.129   crouched at rest; ~1.19 standing tall

   So the frog is a twelfth of the T1's height. It is genuinely tiny, and it
   stays legible by standing DOWNSTAGE, close to the camera, where perspective
   gives it back most of what true scale takes away. */
export const MODEL_SCALE = { pondbot: 0.001, go2: 1, t1: 1, z1: 1 };

/* True height in metres, used for the things that scale with a body: the
   contact patch, and a reaction's posY (authored in body heights). */
export const HEIGHT = { pondbot: 0.097, go2: 0.461, t1: 1.129, z1: 0.508 };

/* Allowed crop budget.
   The old PNG layout got big characters by letting them run off the edges, and
   a cropped dog hindquarter or arm base reads as intentional staging. A
   half-cropped humanoid just reads broken, so T1 and pond-bot stay whole.
   Each named character may run up to CROP_MAX of its own swept width off the
   named OUTER edge; every other edge still needs a full margin, and the copy
   keep-out stays at zero tolerance. */
export const OUTER = { go2: 'left', z1: 'right' };
export const CROP_MAX = 0.10;

/** the margin each edge must clear, given a character's swept width */
export function edgeAllowance(key, sweptWidth) {
  const side = OUTER[key];
  const crop = -CROP_MAX * sweptWidth;
  return {
    left: side === 'left' ? crop : MARGIN_FRAC,
    right: side === 'right' ? crop : MARGIN_FRAC,
    top: MARGIN_FRAC,
    bottom: MARGIN_FRAC,
  };
}

/* ---------------- the text keep-out ----------------

   The landing copy is a fixed 544px column, centred, with the masthead above
   it, and the machines must never sit under it. Measured off the live DOM
   (.landing-masthead + h1 + .landing-lede + .landing-cta, as fractions of
   .landing-frame):

     1280x700   x 0.2875..0.7125   text y 0.3687..0.7650
     1280x1000  x 0.2875..0.7125   text y 0.4081..0.6855
     1440x1300  x 0.3111..0.6889   text y 0.4293..0.6427

   The column is 544px wide at every width (0.425*1280 == 0.3778*1440), and the
   copy's bottom edge is 0.5*H + 185 px at every height (535 / 685 / 835). The
   masthead shares the column and reaches the top of the frame, so the keep-out
   is that column from the top of the frame down to the bottom of the CTAs. */
const COL_PX = 544, COL_HALF = COL_PX / 2;
/* THE COPY IS RAISED. `.landing-hero` carries 16vh of extra bottom padding, and
   because the block stays centred in its own content box that lifts its centre
   by half of it — 0.08h. The measured bottom edge was 0.5h + 185px when the
   block was centred, so it is now 0.42h + 185px.

   This single coefficient is the tallest thing that can cross under the copy.
   At 0.50 the corridor passes 0.175m at 1280x700 — the frog, and nothing else,
   which is why the frog was the courier. At 0.42 it passes ~0.31m, which is
   what makes a conveyor deck under the headline possible at all.

   0.42 is not a taste number, it is the floor. The block is ~370px tall and the
   masthead owns the top ~100px, so at 1280x700 the block's centre cannot rise
   above ~285px = 0.41h without the two colliding. There is no more corridor to
   be had from this lever.

   Keep in lockstep with docs/style.css `.landing-hero`. */
const TEXT_CENTRE_FRAC = 0.42;
const TEXT_BOTTOM_PX = (h) => TEXT_CENTRE_FRAC * h + 185;
export const KEEPOUT_PAD = 0.015;    // a little air around the copy, in frame fractions

/** the forbidden rectangle for a viewport, in frame fractions [x0,y0,x1,y1] */
export function keepOut(vwPx, vhPx) {
  return [
    0.5 - COL_HALF / vwPx - KEEPOUT_PAD,
    0,
    0.5 + COL_HALF / vwPx + KEEPOUT_PAD,
    TEXT_BOTTOM_PX(vhPx) / vhPx + KEEPOUT_PAD,
  ];
}

/* ---------------- framing ----------------

   Text high and centred, machines low and at the edges.

   The camera is LEVEL — no tilt — sitting camY above a floor at y=0 and
   looking down -Z, so the horizon lands exactly at screen centre and a
   character further upstage stands higher in the frame without any of the
   keystoning a tilted camera would add.

   WIDTH is the primary constraint: the visible width at the stage plane is
   fixed, so the cast always fills the frame side to side and each character
   keeps the same share of the width at every viewport. Height then follows
   from the aspect, and because the floor is pinned near the BOTTOM of the
   frame, a taller viewport turns into empty air ABOVE the cast — where the
   title lives — rather than shrinking or re-centring anyone.

   VH_MIN keeps very short/wide viewports from pulling the camera in so close
   that perspective across the stage's depth gets silly. */
export const VW_BASE = 4.55;
export const VH_MIN = 2.30;
/* The stage-centre floor line, up from the bottom of the frame.

   Raised from 0.12 for true scale. With everything normalised to a common
   height the cast could sit in a shallow band just above the bottom edge, but
   a 97mm frog only reads if it stands DOWNSTAGE, close to the camera — and
   with a level camera a downstage floor point sits LOWER in the frame. At 0.12
   the floor ran off the bottom edge by z = 1.9, which is barely downstage at
   all. Lifting the line to 0.26 lowers the camera and buys the depth the size
   range needs, without tilting: a tilted camera would keystone the whole stage
   and every projection in here assumes it is level. */
export const FLOOR_FRAC = 0.26;
export const MARGIN_FRAC = 0.015;    // clear margin required at the frame edges

/* The aspect range the layout is verified over. Within it the camera is always
   width-bound (vh = VW_BASE/aspect stays above VH_MIN), so the visible width at
   the stage plane is exactly VW_BASE and screen-x depends on aspect only
   through a point's depth. */
export const SUPPORTED_ASPECTS = [1280 / 700, 1280 / 1000, 1440 / 1300, 1280 / 1400];

/** visible width at depth z, for a given aspect */
export function widthAtDepth(z, aspect) {
  return VW_BASE - 2 * z * TAN_HALF * aspect;
}

/** where a floor point lands horizontally, as a frame fraction */
export function screenXOf(x, z, aspect) {
  return 0.5 + x / widthAtDepth(z, aspect);
}

/**
 * The world-x interval that keeps a floor point inside the screen-x band
 * [sxLo, sxHi] at EVERY supported aspect. Because the depth term scales with
 * aspect, a fixed world-x drifts horizontally between viewports; solving in
 * screen space and intersecting over the aspect range removes that drift, and
 * is why roam regions are declared as screen bands rather than world boxes.
 */
export function worldXRange(sxLo, sxHi, z) {
  let lo = -Infinity, hi = Infinity;
  for (const a of SUPPORTED_ASPECTS) {
    const V = widthAtDepth(z, a);
    lo = Math.max(lo, (sxLo - 0.5) * V);
    hi = Math.min(hi, (sxHi - 0.5) * V);
  }
  return lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2];
}

/* Viewports the layout is verified at; the feasible-x solve intersects over
   all of them, so a position that passes is safe at every one. */
export const TEST_VIEWPORTS = [[1280, 700], [1280, 1000], [1440, 1300], [1280, 1400]];

/**
 * The world-x interval a character may stand in at depth z — DERIVED, not
 * authored. A character module says only which band it lives in and how wide
 * its silhouette is; the composition rules (copy keep-out on the inside edge,
 * crop budget on the outside edge) do the rest, intersected over every
 * supported viewport.
 *
 * This is the reason a character specialist cannot break the layout: there is
 * no hand-tuned safe box to keep in sync with the artwork, so moving a
 * waypoint can only ever move the character within a region that is correct by
 * construction.
 */
export function feasibleX(key, side, halfWidth, z) {
  const crop = OUTER[key] === side ? CROP_MAX : 0;
  let lo = -Infinity, hi = Infinity;
  for (const [vwPx, vhPx] of TEST_VIEWPORTS) {
    const aspect = vwPx / vhPx;
    const V = widthAtDepth(z, aspect);
    const W = (2 * halfWidth) / V;             // silhouette width, frame fractions
    const K = keepOut(vwPx, vhPx);
    let cLo, cHi;
    if (side === 'left') {
      cLo = W * (0.5 - crop);                  // outer edge, crop budget allowed
      cHi = K[0] - W / 2;                      // inner edge, clear of the copy
    } else {
      cLo = K[2] + W / 2;
      cHi = 1 - W * (0.5 - crop);
    }
    lo = Math.max(lo, (cLo - 0.5) * V);
    hi = Math.min(hi, (cHi - 0.5) * V);
  }
  return lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2];
}

export function cameraFor(aspect) {
  const vh = Math.max(VH_MIN, VW_BASE / aspect);
  return {
    vh,
    vw: vh * aspect,
    dist: vh / (2 * TAN_HALF),
    camY: (0.5 - FLOOR_FRAC) * vh,
    fov: FOV,
  };
}

/**
 * Project a stage point to normalised screen coordinates (0..1 from the
 * top-left). Mirrors the level camera above, and is what the swept-extent and
 * keep-out checks are built on.
 */
export function project(p, cam) {
  const d = cam.dist - p.z;
  const half = d * TAN_HALF;
  return {
    x: 0.5 + p.x / (2 * half * (cam.vw / cam.vh)),
    y: 0.5 - (p.y - cam.camY) / (2 * half),
    d,
  };
}
