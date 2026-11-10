const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.V6_SURFACE_BUILD || path.join(__dirname, '..', '.domain-build');
const { buildV6FarSurfaceSteps, v6FarCellCandidate } = require(
  path.join(root, 'art/V6FarSurfaceMesh'),
);
const { buildV6SurfaceMesh } = require(path.join(root, 'art/V6SurfaceMesh'));
const { v6Plane } = require(path.join(root, 'art/V6SurfaceContracts'));
const key = (x, z) => `${x},${z}`;
function source(options = {}) {
  const ground = options.ground || ((x, z) => 2 + x / 16 + z / 32);
  const top = options.top || ground;
  const original = options.original || (() => null);
  const edits = options.edits || new Map(),
    caps = options.caps || new Map();
  const capAt = (x, z) => caps.get(key(x, z)) ?? (original(x, z) ? Infinity : -Infinity);
  const world = Object.freeze({
    seed: 1,
    size: 192,
    at: (x, z) =>
      x >= 0 && z >= 0 && x < 192 && z < 192 ? { reserved: !!options.reserved?.(x, z) } : null,
    groundHeight: ground,
    naturalHeight: top,
    normal: options.normal || (() => Object.freeze([0, 1, 0])),
    resourceAt: original,
  });
  const retainedHeightInCell = (px, pz, x, z) =>
    Math.min(
      Math.max(ground(px, pz), Math.min(top(px, pz), capAt(x, z))),
      edits.get(key(x, z))?.cut ?? Infinity,
    );
  return Object.freeze({
    world,
    revision: options.revision || 'synthetic',
    capAt,
    editAt: (x, z) => edits.get(key(x, z)) ?? null,
    resourceAt: options.live || original,
    retainedHeightInCell,
    heightInCell: (px, pz, x, z) =>
      edits.has(key(x, z))
        ? v6Plane(edits.get(key(x, z)).level)
        : retainedHeightInCell(px, pz, x, z),
  });
}
const stone = (x, z) => ({ id: `n${x}_${z}`, x, z, amount: 3, kind: 'stone' });
function far(s, x = 10, z = 10, width = 1, depth = 1, detail, maxError) {
  const work = buildV6FarSurfaceSteps(s, x, z, width, depth, detail, maxError);
  let next = work.next(),
    yields = 0;
  while (!next.done) {
    assert.ok(next.value.triangles.every((t) => t.resourceId === null));
    yields++;
    next = work.next();
  }
  assert.ok(next.value.triangles.every((t) => t.resourceId === null));
  return { mesh: next.value, yields };
}
function exactDisplay(s, x = 10, z = 10) {
  const mesh = buildV6SurfaceMesh(s, x, z, 1, 1);
  return { ...mesh, triangles: mesh.triangles.map((t) => ({ ...t, resourceId: null })) };
}
function vertices(mesh) {
  return mesh.positions.reduce(
    (all, _, i) => (i % 3 ? all : [...all, mesh.positions.slice(i, i + 3)]),
    [],
  );
}
function edge(mesh, axis, value) {
  return vertices(mesh)
    .filter((p) => p[axis] === value)
    .sort((a, b) => a[axis === 0 ? 2 : 0] - b[axis === 0 ? 2 : 0]);
}
test('far unedited planes use the canonical two triangles and original Float32 attributes', () => {
  const s = source({ normal: () => [0.125, 0.99, -0.03125] });
  const { mesh } = far(s);
  assert.equal(mesh.triangles.length, 2);
  assert.deepEqual(mesh.indices, [0, 1, 2, 0, 2, 3]);
  assert.equal(mesh.positions.length, 12);
  for (const [x, y, z] of vertices(mesh))
    assert.equal(y, Math.fround(s.heightInCell(x, z, 10, 10)));
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(mesh.normals.slice(i * 3, i * 3 + 3), s.world.normal());
    assert.deepEqual(mesh.colors.slice(i * 4, i * 4 + 4), [0.5, 0.68, 0.29, 1]);
  }
  assert.equal(v6FarCellCandidate(s, 10, 10), true, 'resource-absent -Infinity caps are natural');
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.world));
});
test('far full stone uses original triangle material even when every coarse corner has zero exposure', () => {
  const s = source({
    ground: () => 2,
    original: stone,
    top: (x, z) => 2 + 0.01 * (Math.sin(Math.PI * x) ** 2 + Math.sin(Math.PI * z) ** 2),
  });
  const exact = buildV6SurfaceMesh(s, 10, 10, 1, 1),
    { mesh } = far(s);
  assert.ok(exact.triangles.every((t) => t.material === 'stone'));
  assert.equal(mesh.triangles.length, 2);
  assert.ok(mesh.triangles.every((t) => t.material === 'stone'));
  assert.deepEqual(mesh.colors.slice(0, 4), exact.colors.slice(0, 4));
});
test('far preserves mixed grass/stone, depleted resources and finite-cap geometry exactly', () => {
  const mixed = source({ original: stone, ground: () => 2, top: (x) => 2 + Math.max(0, x - 10.5) });
  const full = { original: stone, ground: () => 2, top: (x, z) => 4 + x / 8 + z / 16 };
  const depleted = source({
    ...full,
    caps: new Map([['10,10', -Infinity]]),
    live: (x, z) => (x === 10 && z === 10 ? null : stone(x, z)),
  });
  const finite = source({ ...full, caps: new Map([['10,10', 6]]) });
  const reduced = source({ ...full, live: (x, z) => ({ ...stone(x, z), amount: 2 }) });
  for (const s of [mixed, depleted, finite, reduced]) {
    assert.equal(v6FarCellCandidate(s, 10, 10), false);
    assert.deepEqual(far(s).mesh, exactDisplay(s));
  }
});
test('far preserves edited cuts/fill walls and adjacent untouched wall owners with cooperative yields', () => {
  const s = source({
    original: stone,
    ground: () => 2,
    top: () => 5,
    edits: new Map([
      [
        '10,10',
        {
          cut: v6Plane(3),
          level: 8,
          fills: [
            { level: 6, material: 'soil' },
            { level: 7, material: 'stone' },
            { level: 8, material: 'soil' },
          ],
        },
      ],
      ['11,10', { cut: v6Plane(1), level: 1, fills: [] }],
    ]),
  });
  for (const [x, z] of [
    [10, 10],
    [11, 10],
    [12, 10],
  ]) {
    assert.equal(v6FarCellCandidate(s, x, z), false);
    const result = far(s, x, z);
    assert.deepEqual(result.mesh, exactDisplay(s, x, z));
    if (result.mesh.triangles.some((t) => t.surface === 'wall'))
      assert.ok(result.yields > 2, 'wall layers yield, not a synchronous entire fallback');
  }
});
test('far/detail seams retain all original quarter edge vertices and original center', () => {
  const s = source({ ground: (x, z) => 2 + x / 16 + z / 32 + 0.02 * Math.sin(Math.PI * z) });
  const fine = buildV6SurfaceMesh(s, 11, 10, 1, 1);
  const { mesh } = far(s, 10, 10, 1, 1, (x) => x === 11);
  assert.equal(mesh.triangles.length, 7);
  assert.deepEqual(edge(mesh, 0, 11), edge(fine, 0, 11));
  assert.ok(
    vertices(mesh).some(
      ([x, y, z]) => x === 10.5 && z === 10.5 && y === Math.fround(s.heightInCell(x, z, 10, 10)),
    ),
  );
  assert.deepEqual(far(s, 10, 10, 1, 1, () => true).mesh, exactDisplay(s));
});
test('far/coarse seams use identical 1m edges and coast/world boundaries retain quarter samples', () => {
  const s = source();
  assert.deepEqual(edge(far(s).mesh, 0, 11), edge(far(s, 11).mesh, 0, 11));
  const coast = source({ reserved: (x) => x === 11 });
  assert.equal(edge(far(coast).mesh, 0, 11).length, 5);
  assert.deepEqual(far(coast, 11).mesh.min, [0, 0, 0]);
  const boundary = far(s, 0, 0, 1, 1, (x, z) => {
    assert.ok(x >= 0 && z >= 0 && x < 192 && z < 192, 'never call detailAt outside the world');
    return false;
  }).mesh;
  assert.equal(edge(boundary, 0, 0).length, 5);
  assert.equal(edge(boundary, 2, 0).length, 5);
});
test('dynamic height error changes safely within one cached immutable source', () => {
  const s = source({
    ground: (x, z) => 2 + 0.08 * Math.sin(Math.PI * x) ** 2 * Math.sin(Math.PI * z) ** 2,
  });
  assert.equal(v6FarCellCandidate(s, 10, 10), false);
  assert.equal(v6FarCellCandidate(s, 10, 10, 0.25), true);
  assert.equal(v6FarCellCandidate(s, 10, 10, 0.0625), false);
  assert.equal(far(s, 10, 10, 1, 1, undefined, 0.25).mesh.triangles.length, 2);
  assert.deepEqual(far(s).mesh, exactDisplay(s));
  const different = source({ revision: s.revision });
  assert.equal(
    v6FarCellCandidate(different, 10, 10),
    true,
    'cache is by source, not revision text',
  );
});
test('normal error certification keeps quarter normal discontinuities exact', () => {
  const s = source({
    normal: (x, z) => [0.04 * Math.sin(Math.PI * x) ** 2 * Math.sin(Math.PI * z) ** 2, 1, 0],
  });
  assert.equal(v6FarCellCandidate(s, 10, 10, 0.25), false);
  assert.deepEqual(far(s).mesh, exactDisplay(s));
});
test('far validates its rectangle and error budget before producing output', () => {
  const s = source();
  for (const args of [
    [-1, 0],
    [0.5, 0],
    [0, 0, 0],
    [0, 0, 33],
    [191, 191, 2, 2],
  ])
    assert.throws(() => buildV6FarSurfaceSteps(s, ...args).next(), /rectangle/);
  for (const error of [-1, Infinity, NaN, 0.25001]) {
    assert.throws(() => far(s, 10, 10, 1, 1, undefined, error), /height error/);
    assert.throws(() => v6FarCellCandidate(s, 10, 10, error), /height error/);
  }
  assert.equal(v6FarCellCandidate(s, -1, 0), false);
});
test('fallback yields expose incremental byte growth with no hidden IDs or final duplicate copy', () => {
  const s = source({
    original: stone,
    ground: () => 2,
    top: () => 5,
    edits: new Map([['10,10', { cut: v6Plane(2), level: 20, fills: [] }]]),
  });
  const work = buildV6FarSurfaceSteps(s, 10, 10);
  let prior = 0,
    growths = 0,
    last;
  for (;;) {
    const next = work.next(),
      mesh = next.value;
    assert.ok(mesh.triangles.every((t) => t.resourceId === null));
    assert.ok(mesh.positions.length >= prior);
    if (mesh.positions.length > prior) growths++;
    prior = mesh.positions.length;
    if (next.done) {
      assert.strictEqual(mesh, last, 'same final exact buffer, no full final append copy');
      break;
    }
    last = mesh;
  }
  assert.ok(growths > 10, 'individual exposed wall layers are budget-visible');
});
function expanded(mesh) {
  return mesh.indices.map((i) => [
    ...mesh.positions.slice(i * 3, i * 3 + 3),
    ...mesh.normals.slice(i * 3, i * 3 + 3),
    ...mesh.colors.slice(i * 4, i * 4 + 4),
  ]);
}
test('multi-cell fallback appends partial data once and retains exact expanded geometry', () => {
  const s = source({
    original: stone,
    ground: () => 2,
    top: () => 5,
    edits: new Map([['10,10', { cut: v6Plane(2), level: 8, fills: [] }]]),
  });
  const mesh = far(s, 10, 10, 2, 1).mesh,
    exact = buildV6SurfaceMesh(s, 10, 10, 2, 1);
  assert.deepEqual(expanded(mesh), expanded(exact));
  assert.deepEqual(
    mesh.triangles,
    exact.triangles.map((t) => ({ ...t, resourceId: null })),
  );
});
const cross = (a, b, p) => (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
function overlap(poly, tri) {
  const sign = Math.sign(cross(tri[0], tri[1], tri[2]));
  for (let k = 0; k < 3 && poly.length; k++) {
    const a = tri[k],
      b = tri[(k + 1) % 3],
      next = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length];
      const dp = sign * cross(a, b, p),
        dq = sign * cross(a, b, q);
      if (dp >= -1e-12) next.push(p);
      if ((dp > 1e-12 && dq < -1e-12) || (dp < -1e-12 && dq > 1e-12)) {
        const t = dp / (dp - dq);
        next.push(p.map((v, j) => v + (q[j] - v) * t));
      }
    }
    poly = next;
  }
  return poly;
}
function sample(tri, p, axis) {
  const [a, b, c] = tri,
    den = cross(a, b, c);
  const u = ((p[0] - a[0]) * (c[2] - a[2]) - (p[2] - a[2]) * (c[0] - a[0])) / den;
  const v = ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])) / den;
  return a[axis] + u * (b[axis] - a[axis]) + v * (c[axis] - a[axis]);
}
function triangles(mesh) {
  const points = expanded(mesh).map((p) => p.map(Math.fround)),
    out = [];
  for (let i = 0; i < points.length; i += 3) out.push(points.slice(i, i + 3));
  return out;
}
test('full fine/fan common refinement obeys certified height and Float32 normal-vector error', () => {
  for (const maxError of [1 / 16, 1 / 4]) {
    const wave = (x, z) => Math.sin(Math.PI * x) * Math.sin(Math.PI * z);
    const s = source({
      ground: (x, z) => 2 + x / 8 + z / 16 + maxError * 0.48 * wave(x, z),
      normal: (x, z) => [0.026 * wave(x, z), 0.99, 0.01 * wave(x, z)],
    });
    assert.equal(v6FarCellCandidate(s, 10, 10, maxError), true);
    const fine = triangles(buildV6SurfaceMesh(s, 10, 10, 1, 1));
    for (const detail of [() => false, (x, z) => x !== 10 || z !== 10, (x) => x === 11]) {
      const coarse = triangles(far(s, 10, 10, 1, 1, detail, maxError).mesh);
      let heightError = 0,
        normalError = 0,
        intersections = 0;
      for (const a of fine)
        for (const b of coarse)
          for (const p of overlap(a, b)) {
            heightError = Math.max(heightError, Math.abs(sample(a, p, 1) - sample(b, p, 1)));
            normalError = Math.max(
              normalError,
              Math.hypot(...[3, 4, 5].map((k) => sample(a, p, k) - sample(b, p, k))),
            );
            intersections++;
          }
      assert.ok(intersections > 0);
      assert.ok(heightError <= maxError + 1e-12, `${heightError} <= ${maxError}`);
      assert.ok(normalError <= 0.06 + 1e-12, `${normalError} <= .06`);
    }
  }
});
test('zero height budget disables coarse mode even with perfectly flat heights', () => {
  const s = source({
    ground: () => 2,
    normal: (x, z) => [0.01 * Math.sin(Math.PI * x) * Math.sin(Math.PI * z), 1, 0],
  });
  assert.equal(v6FarCellCandidate(s, 10, 10), true);
  assert.equal(v6FarCellCandidate(s, 10, 10, 0), false);
  assert.equal(far(s).mesh.triangles.length, 2);
  assert.deepEqual(far(s, 10, 10, 1, 1, undefined, 0).mesh, exactDisplay(s));
  assert.equal(far(s, 10, 10, 1, 1, undefined, 0).mesh.triangles.length, 32);
});

test('prepared natural fast fallback preserves exact expanded triangles and rejects mutable boundaries', () => {
  const { createGame, getV6EditSurface } = require(path.join(root, 'domain/game'));
  const { buildV6FarNaturalCell } = require(path.join(root, 'art/V6FarNaturalCell'));
  const { V6WorldPreparation } = require(path.join(root, 'domain/v6-preparation'));
  const prep = new V6WorldPreparation(42173);
  while (prep.progress.status !== 'ready') prep.step(1024);
  prep.takeResult();
  const s = getV6EditSurface(createGame(60000, 42173, 6));
  let checked = 0,
    stoneCells = 0,
    grassCells = 0;
  for (let z = 16; z < 176; z += 7)
    for (let x = 16; x < 176; x += 7) {
      const fast = buildV6FarNaturalCell(s, x, z);
      if (!fast) continue;
      const exact = exactDisplay(s, x, z);
      assert.deepEqual(expanded(fast), expanded(exact), `attributes at ${x},${z}`);
      assert.deepEqual(fast.triangles, exact.triangles);
      assert.deepEqual(fast.min, exact.min);
      assert.deepEqual(fast.max, exact.max);
      checked++;
      if (fast.triangles.some((t) => t.material === 'stone')) stoneCells++;
      else grassCells++;
      const neighbor = s.world.at(x + 1, z);
      if (neighbor && !neighbor.reserved)
        assert.equal(
          buildV6FarNaturalCell(
            { ...s, capAt: (xx, zz) => (xx === x + 1 && zz === z ? 1 : s.capAt(xx, zz)) },
            x,
            z,
          ),
          null,
        );
      assert.equal(
        buildV6FarNaturalCell({ ...s, editAt: () => ({ cut: 1, level: 1, fills: [] }) }, x, z),
        null,
      );
    }
  assert.ok(
    checked > 100 && stoneCells > 0 && grassCells > 0,
    `${checked}/${stoneCells}/${grassCells}`,
  );
  assert.equal(
    buildV6FarNaturalCell(source(), 10, 10),
    null,
    'synthetic samplers keep the generic writer',
  );
});
