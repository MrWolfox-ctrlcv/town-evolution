/** Concept-led asset checks. CPU geometry evidence only, never a game-frame claim. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { sawnWoodShape } = require('../.domain-build/art/SawnWoodShape');
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const count = (id, name) => ASSETS[id].parts.filter((p) => p.name === name).length;

test('the two original ImageGen concept bytes are retained independently of model previews', () => {
  for (const [id, sha] of [
    ['fence', '45c3d7aeb7b2849c1bdee43fd7c732d0345d61c36ba5852654ec83e26864fac1'],
    ['bench', '1ff3fe7ff11d22e8a106fe409cbd342a9aecf5dad5b321ca2387c3d7bc11bb53'],
  ])
    assert.equal(hash(`art/references/bench-fence/${id}-imagegen-concept.png`), sha);
});

test('concept silhouettes preserve open rails, slats, continuous rear legs and wooden dowels', () => {
  assert.equal(count('crafted-fence', 'fence-post'), 2);
  assert.equal(count('crafted-fence', 'fence-rail'), 2);
  assert.equal(count('crafted-fence', 'fence-wooden-dowel'), 4);
  assert.equal(count('bench', 'bench-seat-plank'), 3);
  assert.equal(count('bench', 'bench-back-plank'), 2);
  assert.equal(count('bench', 'bench-leg'), 4);
  assert.equal(count('bench', 'bench-wooden-dowel'), 4);
  const rear = ASSETS.bench.parts.filter((p) => p.name === 'bench-leg' && p.position[2] < 0);
  assert.equal(rear.length, 2);
  for (const leg of rear) {
    assert.equal(leg.size[1], 0.8);
    assert.equal(leg.position[1] - leg.size[1] / 2, 0);
  }
  for (const name of ['bench-seat-plank', 'bench-back-plank']) {
    const axis = name.includes('seat') ? 2 : 1;
    const parts = ASSETS.bench.parts
      .filter((p) => p.name === name)
      .sort((a, b) => a.position[axis] - b.position[axis]);
    for (let i = 1; i < parts.length; i++)
      assert.ok(
        parts[i].position[axis] - parts[i].size[axis] / 2 >
          parts[i - 1].position[axis] + parts[i - 1].size[axis] / 2 + 0.01,
      );
  }
  for (const id of ['bench', 'crafted-fence']) {
    assert.ok(ASSETS[id].parts.every((p) => p.texture === 'warm-wood'));
    assert.ok(ASSETS[id].parts.every((p) => ['sawnTimber', 'log'].includes(p.shape)));
    const m = compileAsset(ASSETS[id]);
    assert.equal(m.max[1], 0.8);
    assert.equal(m.min[1], 0);
    assert.ok(m.indices.length / 3 < 1000);
    assert.equal(m.indices.length, m.texturedIndices.length);
    assert.ok(m.uvs.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
  }
});

test('chamfered timber is closed, outward-facing, and retains its nominal bounds', () => {
  const s = sawnWoodShape(),
    edges = new Map();
  assert.equal(s.vertices.length, 24);
  assert.equal(s.faces.length, 26);
  for (const face of s.faces) {
    const [a, b, c] = face.map((i) => s.vertices[i]);
    const u = b.map((v, i) => v - a[i]),
      v = c.map((v, i) => v - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.ok(n.reduce((sum, x, i) => sum + x * a[i], 0) > 0);
    for (let i = 0; i < face.length; i++) {
      const a = face[i],
        b = face[(i + 1) % face.length],
        key = [a, b].sort((a, b) => a - b).join(':');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert.ok([...edges.values()].every((n) => n === 2));
  for (let axis = 0; axis < 3; axis++) {
    assert.equal(Math.min(...s.vertices.map((v) => v[axis])), -0.5);
    assert.equal(Math.max(...s.vertices.map((v) => v[axis])), 0.5);
  }
});

// Clip two projected triangles to reject same-facing exterior coplanar overlaps.
function area(points) {
  return (
    Math.abs(
      points.reduce((s, a, i) => {
        const b = points[(i + 1) % points.length];
        return s + a[0] * b[1] - b[0] * a[1];
      }, 0),
    ) / 2
  );
}
function intersection(a, b) {
  let out = a;
  const orient =
    b.reduce((s, p, i) => {
      const q = b[(i + 1) % b.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0) > 0
      ? 1
      : -1;
  for (let i = 0; i < 3; i++) {
    const p = b[i],
      q = b[(i + 1) % 3],
      cross = (r) => orient * ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const u = input[j],
        v = input[(j + 1) % input.length],
        cu = cross(u),
        cv = cross(v);
      if (cu >= -1e-10) out.push(u);
      if ((cu > 0 && cv < 0) || (cu < 0 && cv > 0)) {
        const t = cu / (cu - cv);
        out.push(u.map((x, k) => x + t * (v[k] - x)));
      }
    }
    if (!out.length) return 0;
  }
  return area(out);
}
test('new prop joins contain no same-facing coplanar triangles with overlapping area', () => {
  for (const id of ['bench', 'crafted-fence']) {
    const triangles = ASSETS[id].parts.flatMap((p, part) => {
      const m = compileAsset({ id, footprint: [1, 1], parts: [p] }),
        out = [];
      for (let i = 0; i < m.indices.length; i += 3) {
        const ids = m.indices.slice(i, i + 3);
        out.push({
          part,
          points: ids.map((j) => m.positions.slice(j * 3, j * 3 + 3)),
          normal: m.normals.slice(ids[0] * 3, ids[0] * 3 + 3),
        });
      }
      return out;
    });
    for (let i = 0; i < triangles.length; i++)
      for (let j = i + 1; j < triangles.length; j++) {
        const a = triangles[i],
          b = triangles[j];
        if (a.part === b.part) continue;
        if (a.normal.reduce((s, x, k) => s + x * b.normal[k], 0) < 0.999999) continue;
        if (
          Math.abs(a.normal.reduce((s, x, k) => s + x * (a.points[0][k] - b.points[0][k]), 0)) >
          1e-8
        )
          continue;
        const drop = a.normal.map(Math.abs).indexOf(Math.max(...a.normal.map(Math.abs)));
        const project = (p) => p.filter((_, k) => k !== drop);
        assert.ok(
          intersection(a.points.map(project), b.points.map(project)) < 1e-9,
          `${id}: overlapping exterior faces ${a.part}/${b.part}`,
        );
      }
  }
});
