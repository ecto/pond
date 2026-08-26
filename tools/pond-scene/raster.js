'use strict';
/* Minimal flat-shaded z-buffer rasterizer + PNG writer, so poses can be
   eyeballed offline without a WebGL context. */
const zlib = require('zlib');
const fs = require('fs');
const THREE = require('three');

function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunks = [];
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    chunks.push(len, td, crc);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  chunk('IHDR', ihdr); chunk('IDAT', idat); chunk('IEND', Buffer.alloc(0));
  fs.writeFileSync(file, Buffer.concat(chunks));
}
let T = null;
function crc32(buf) {
  if (!T) { T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/** positions: Float32Array (indexed), index: Uint32Array, matId: Uint8Array per-vertex */
function render({ positions, index, matId }, opts = {}) {
  const w = opts.width || 420, h = opts.height || 420;
  const colors = opts.colors || [[239, 236, 226], [33, 35, 39], [0, 0, 255]];
  const bg = opts.bg || [255, 255, 255];
  const az = opts.azimuth != null ? opts.azimuth : 45, el = opts.elevation != null ? opts.elevation : 12;

  // bounds
  const box = new THREE.Box3();
  for (let i = 0; i < positions.length; i += 3) box.expandByPoint(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
  const c = box.getCenter(new THREE.Vector3());
  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - c.x, dy = positions[i + 1] - c.y, dz = positions[i + 2] - c.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > radius) radius = d;
  }
  radius = Math.sqrt(radius) || 1;

  const ar = (az * Math.PI) / 180, er = (el * Math.PI) / 180;
  let dist = (radius / Math.sin((30 * Math.PI / 180) / 2)) * (opts.zoom || 1.08);
  let eye = new THREE.Vector3(
    c.x + dist * Math.cos(er) * Math.sin(ar),
    c.y + dist * Math.sin(er),
    c.z + dist * Math.cos(er) * Math.cos(ar)
  );
  // explicit stage camera: level, at (0, camY, dist), looking down -Z. This is
  // exactly the camera the runtime uses, so a stage sheet is a real preview of
  // the composited frame rather than an approximation of it.
  if (opts.cam) {
    dist = opts.cam.dist;
    eye = new THREE.Vector3(0, opts.cam.camY, dist);
    c.set(0, opts.cam.camY, 0);
  }
  const view = new THREE.Matrix4().lookAt(eye, c, new THREE.Vector3(0, 1, 0));
  const viewM = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().setFromMatrixColumn(view, 0),
    new THREE.Vector3().setFromMatrixColumn(view, 1),
    new THREE.Vector3().setFromMatrixColumn(view, 2)
  ).setPosition(eye).invert();
  const proj = new THREE.Matrix4().makePerspective(-1, 1, 1, -1, 1, 1000);
  const fov = ((opts.cam && opts.cam.fov) || 30) * Math.PI / 180;
  const f = 1 / Math.tan(fov / 2);
  // vertical fov is authoritative; horizontal follows the viewport aspect
  const fx = f / (w / h);

  const img = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { img[i * 3] = bg[0]; img[i * 3 + 1] = bg[1]; img[i * 3 + 2] = bg[2]; }
  const zbuf = new Float32Array(w * h).fill(Infinity);

  const light = new THREE.Vector3(-0.4, 0.85, 0.6).normalize();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const p = [{}, {}, {}];

  for (let t = 0; t < index.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const vi = index[t + k] * 3;
      v[k].set(positions[vi], positions[vi + 1], positions[vi + 2]).applyMatrix4(viewM);
    }
    if (v[0].z > -0.01 || v[1].z > -0.01 || v[2].z > -0.01) continue;
    const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
    if (n.lengthSq() === 0) continue;
    n.normalize();
    if (n.z < 0) n.negate();
    const lam = Math.max(0, n.dot(light)) * 0.72 + 0.34;
    const col = colors[matId ? matId[index[t]] : 0] || colors[0];
    const r = Math.min(255, col[0] * lam), g = Math.min(255, col[1] * lam), b = Math.min(255, col[2] * lam);

    for (let k = 0; k < 3; k++) {
      const sx = (v[k].x * fx) / -v[k].z, sy = (v[k].y * f) / -v[k].z;
      p[k].x = (sx * 0.5 + 0.5) * w; p[k].y = (1 - (sy * 0.5 + 0.5)) * h; p[k].z = -v[k].z;
    }
    const minx = Math.max(0, Math.floor(Math.min(p[0].x, p[1].x, p[2].x)));
    const maxx = Math.min(w - 1, Math.ceil(Math.max(p[0].x, p[1].x, p[2].x)));
    const miny = Math.max(0, Math.floor(Math.min(p[0].y, p[1].y, p[2].y)));
    const maxy = Math.min(h - 1, Math.ceil(Math.max(p[0].y, p[1].y, p[2].y)));
    const area = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        let w0 = ((p[1].x - px) * (p[2].y - py) - (p[2].x - px) * (p[1].y - py)) / area;
        let w1 = ((p[2].x - px) * (p[0].y - py) - (p[0].x - px) * (p[2].y - py)) / area;
        let w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * p[0].z + w1 * p[1].z + w2 * p[2].z;
        const o = y * w + x;
        if (z >= zbuf[o]) continue;
        zbuf[o] = z;
        img[o * 3] = r; img[o * 3 + 1] = g; img[o * 3 + 2] = b;
      }
    }
  }
  return { img, w, h };
}

function renderToFile(file, geo, opts) {
  const { img, w, h } = render(geo, opts);
  writePNG(file, w, h, img);
}

module.exports = { render, renderToFile, writePNG };
