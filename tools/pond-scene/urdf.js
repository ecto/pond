'use strict';
const fs = require('fs');
const path = require('path');
const THREE = require('three');
const { DOMParser } = require('@xmldom/xmldom');

const nums = (s, d) => (s ? s.trim().split(/\s+/).map(Number) : d);

function parseURDF(file) {
  const doc = new DOMParser().parseFromString(fs.readFileSync(file, 'utf8'), 'text/xml');
  const robot = doc.getElementsByTagName('robot')[0];
  const links = {}, joints = [];

  for (const l of Array.from(robot.getElementsByTagName('link'))) {
    const name = l.getAttribute('name');
    const visuals = [];
    for (const v of Array.from(l.getElementsByTagName('visual'))) {
      const mesh = v.getElementsByTagName('mesh')[0];
      if (!mesh) continue;
      const o = v.getElementsByTagName('origin')[0];
      visuals.push({
        filename: mesh.getAttribute('filename'),
        scale: nums(mesh.getAttribute('scale'), [1, 1, 1]),
        xyz: nums(o && o.getAttribute('xyz'), [0, 0, 0]),
        rpy: nums(o && o.getAttribute('rpy'), [0, 0, 0]),
      });
    }
    links[name] = { name, visuals };
  }

  for (const j of Array.from(robot.getElementsByTagName('joint'))) {
    // only direct children of <robot> (skip transmission joints)
    if (j.parentNode !== robot) continue;
    const o = j.getElementsByTagName('origin')[0];
    const p = j.getElementsByTagName('parent')[0];
    const c = j.getElementsByTagName('child')[0];
    const a = j.getElementsByTagName('axis')[0];
    const lim = j.getElementsByTagName('limit')[0];
    if (!p || !c) continue;
    joints.push({
      limit: lim && lim.getAttribute('lower') != null && lim.getAttribute('upper') != null
        ? [Number(lim.getAttribute('lower')), Number(lim.getAttribute('upper'))] : null,
      name: j.getAttribute('name'),
      type: j.getAttribute('type'),
      parent: p.getAttribute('link'),
      child: c.getAttribute('link'),
      xyz: nums(o && o.getAttribute('xyz'), [0, 0, 0]),
      rpy: nums(o && o.getAttribute('rpy'), [0, 0, 0]),
      axis: nums(a && a.getAttribute('xyz'), [1, 0, 0]),
    });
  }
  return { links, joints };
}

function mat(xyz, rpy) {
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(rpy[0], rpy[1], rpy[2], 'ZYX'); // URDF rpy = fixed-axis XYZ == ZYX intrinsic
  m.makeRotationFromEuler(e);
  m.setPosition(xyz[0], xyz[1], xyz[2]);
  return m;
}

/** world transform per link for a given joint-angle map */
function forwardKinematics({ links, joints }, pose = {}) {
  const childOf = {};
  for (const j of joints) childOf[j.child] = j;
  const roots = Object.keys(links).filter((n) => !childOf[n]);
  const world = {};
  const byParent = {};
  for (const j of joints) (byParent[j.parent] = byParent[j.parent] || []).push(j);

  function walk(link, M) {
    world[link] = M.clone();
    for (const j of byParent[link] || []) {
      const local = mat(j.xyz, j.rpy);
      const q = pose[j.name] || 0;
      if (q && (j.type === 'revolute' || j.type === 'continuous')) {
        const ax = new THREE.Vector3(...j.axis).normalize();
        local.multiply(new THREE.Matrix4().makeRotationAxis(ax, q));
      } else if (q && j.type === 'prismatic') {
        const ax = new THREE.Vector3(...j.axis).normalize().multiplyScalar(q);
        local.multiply(new THREE.Matrix4().makeTranslation(ax.x, ax.y, ax.z));
      }
      walk(j.child, new THREE.Matrix4().multiplyMatrices(M, local));
    }
  }
  for (const r of roots) walk(r, new THREE.Matrix4());
  return world;
}

function resolveMesh(filename, roots) {
  let f = filename.replace(/^package:\/\//, '').replace(/^file:\/\//, '');
  for (const [pkg, dir] of Object.entries(roots)) {
    if (f.startsWith(pkg + '/')) return path.join(dir, f.slice(pkg.length + 1));
  }
  for (const dir of Object.values(roots)) {
    const cand = path.join(dir, f);
    if (fs.existsSync(cand)) return cand;
    const base = path.join(dir, path.basename(f));
    if (fs.existsSync(base)) return base;
  }
  return null;
}

module.exports = { parseURDF, forwardKinematics, resolveMesh, mat };
