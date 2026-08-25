'use strict';
/* Packs the four articulated characters into one base64 blob:
     [4-byte header length][JSON header][binary payload]
   The header carries the skeleton (link list + joint table, joint origins
   pre-decomposed to position+quaternion); the payload carries one geometry
   record per LINK, in that link's own frame, 16-bit quantized over its own
   bbox. scene.js rebuilds the node graph from this and drives joint angles. */
const fs = require('fs');
const THREE = require('three');
const { buildStage } = require('./preview');

const r = (n, d = 6) => Number(n.toFixed(d));

/* The characters are built, measured and anchored by buildStage() — the same
   code path the offline stage preview uses — so the payload the browser gets
   is normalised exactly the way the verified frames were. */
async function pack() {
  const { cast } = await buildStage();
  const bufs = [];
  const robots = [];
  let offset = 0;

  for (const c of cast) {
    const name = c.key;
    const links = [];

    for (const [ln, geo] of Object.entries(c.links)) {
      const { positions, index, matId } = geo;
      const nv = positions.length / 3, nt = index.length / 3;
      if (nv > 65535) throw new Error(`${name}/${ln}: ${nv} verts exceeds uint16`);

      const box = new THREE.Box3();
      for (let i = 0; i < positions.length; i += 3) {
        box.expandByPoint(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
      }
      const min = box.min.toArray();
      const size = box.getSize(new THREE.Vector3()).toArray().map((s) => (s === 0 ? 1 : s));

      const qp = new Int16Array(nv * 3);
      for (let i = 0; i < nv; i++) {
        for (let k = 0; k < 3; k++) {
          const t = (positions[i * 3 + k] - min[k]) / size[k];
          qp[i * 3 + k] = Math.max(-32768, Math.min(32767, Math.round(t * 65535 - 32768)));
        }
      }
      const qi = new Uint16Array(index);
      const qm = new Uint8Array(matId);
      const blob = Buffer.concat([
        Buffer.from(qp.buffer, qp.byteOffset, qp.byteLength),
        Buffer.from(qi.buffer, qi.byteOffset, qi.byteLength),
        Buffer.from(qm.buffer, qm.byteOffset, qm.byteLength),
      ]);
      bufs.push(blob);
      links.push({ n: ln, nv, nt, o: offset, min: min.map((x) => r(x)), size: size.map((x) => r(x)) });
      offset += blob.length;
      // typed-array views are built straight onto this buffer, so every record
      // must start 2-byte aligned
      if (offset % 2) { bufs.push(Buffer.alloc(1)); offset += 1; }
    }

    robots.push({
      name,
      root: c.root,
      yUp: !!c.yUp,
      pivot: c.pivot.map((x) => r(x)),
      height: r(c.height),
      ground: c.ground,
      links,
      joints: c.joints.map((j) => ({
        n: j.name,
        p: j.parent,
        c: j.child,
        t: /revolute|continuous/.test(j.type) ? 'r' : /prismatic/.test(j.type) ? 'p' : 'f',
        pos: j.pos.map((x) => r(x)),
        quat: j.quat.map((x) => r(x)),
        axis: j.axis.map((x) => r(x, 4)),
        lim: j.limit ? j.limit.map((x) => r(x, 4)) : null,
      })),
    });
  }

  const payload = Buffer.concat(bufs);
  let header = Buffer.from(JSON.stringify({ v: 2, robots }), 'utf8');
  // pad the header so the payload starts 4-byte aligned; spaces keep it valid JSON
  const pad = (4 - ((4 + header.length) % 4)) % 4;
  if (pad) header = Buffer.concat([header, Buffer.from(' '.repeat(pad), 'utf8')]);
  const hl = Buffer.alloc(4);
  hl.writeUInt32LE(header.length);
  return { buf: Buffer.concat([hl, header, payload]), headerBytes: header.length, robots };
}

async function main() {
  const { buf, headerBytes, robots } = await pack();
  const b64 = buf.toString('base64');
  fs.writeFileSync('mesh-data.js', 'export const MESH_B64 = "' + b64 + '";\n');
  const tot = robots.reduce((a, x) => a + x.links.reduce((b, l) => b + l.nt, 0), 0);
  console.log('---');
  for (const x of robots) {
    console.log(`${x.name.padEnd(9)} ${String(x.links.length).padStart(2)} links  `
      + `${String(x.links.reduce((a, l) => a + l.nt, 0)).padStart(6)} tris  `
      + `${String(x.joints.filter((j) => j.t !== 'f').length).padStart(2)} movable joints`);
  }
  console.log(`total ${tot} tris, header ${(headerBytes / 1024).toFixed(1)}KB, `
    + `payload ${(buf.length / 1024 / 1024).toFixed(2)}MB -> base64 ${(b64.length / 1024 / 1024).toFixed(2)}MB`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { pack };
