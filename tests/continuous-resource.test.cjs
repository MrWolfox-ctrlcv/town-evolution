const test = require('node:test');
const assert = require('node:assert/strict');
const { looseAmount } = require('./helpers/loose-output.cjs');
const { performance } = require('node:perf_hooks');
const g = require('../.domain-build/domain/game');
const { expectedSchema10 } = require('./helpers/expected-schema10.cjs');
const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
const { islandTerrain } = require('../.domain-build/art/IslandTerrain');
const { NaturalPicking } = require('../.domain-build/application/NaturalPicking');
const historical = require('./fixtures/terrain-v2-depleted.json');

function renderer(state) {
  return new ContinuousResources(g.worldSize(state.terrainVersion), state.mapSeed, (x, z) =>
    g.terrainAt(x, z, state.mapSeed, state.terrainVersion, state.landExtensions),
  );
}
function valid(result, resources) {
  const { mesh, naturalSurface, triangleOwners } = result;
  assert.equal(naturalSurface.positions, mesh.positions, 'picking uses the uploaded vertices');
  assert.equal(triangleOwners.length * 3, mesh.indices.length);
  for (const key of ['positions', 'normals', 'colors', 'min', 'max'])
    assert.ok(mesh[key].every(Number.isFinite), key);
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.colors.length / 4, mesh.positions.length / 3);
  const byId = new Map(resources.map((r) => [r.id, r]));
  const actual = new Map();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const id = triangleOwners[i / 3],
      r = byId.get(id);
    assert.ok(r && r.amount > 0, 'every rendered triangle belongs to live saved stock');
    const triangle = mesh.indices.slice(i, i + 3);
    if (!actual.has(id)) actual.set(id, []);
    actual.get(id).push(...triangle);
    for (const index of triangle) {
      assert.ok(Number.isInteger(index) && index >= 0 && index < mesh.positions.length / 3);
      const [x, y, z] = mesh.positions.slice(index * 3, index * 3 + 3);
      assert.ok(x >= r.x && x <= r.x + 1 && z >= r.z && z <= r.z + 1);
      assert.ok(y >= 0.015 - 1e-12);
      for (let axis = 0; axis < 3; axis++)
        assert.ok(
          mesh.positions[index * 3 + axis] >= mesh.min[axis] &&
            mesh.positions[index * 3 + axis] <= mesh.max[axis],
        );
    }
  }
  for (const surface of naturalSurface.resources) {
    assert.deepEqual(surface.indices, actual.get(surface.id));
    for (const index of surface.indices)
      for (let axis = 0; axis < 3; axis++)
        assert.ok(
          mesh.positions[index * 3 + axis] >= surface.min[axis] &&
            mesh.positions[index * 3 + axis] <= surface.max[axis],
        );
  }
}

test('arbitrary seeds and v1/v2/v3 retain domain stock and save schema through continuous rendering', () => {
  for (const version of [1, 2, 3])
    for (const seed of [17, 1000000000]) {
      const state = g.createGame(0, seed, version),
        saved = g.exportSave(state),
        view = renderer(state);
      const result = view.sync(state.naturalResources);
      valid(result, state.naturalResources);
      assert.equal(g.exportSave(state), saved);
      assert.deepEqual(g.importSave(saved, 0), state);
      assert.equal(view.sync(state.naturalResources).rebuiltCells, 0);
      assert.deepEqual(renderer(state).sync(state.naturalResources).mesh, result.mesh);
    }
});

test('actual emitted triangle centroids pick their exact saved resource IDs', () => {
  const state = g.createGame(0, 587, 3),
    result = renderer(state).sync(state.naturalResources);
  valid(result, state.naturalResources);
  const picker = new NaturalPicking();
  picker.sync(result.naturalSurface, state.naturalResources);
  for (const surface of result.naturalSurface.resources) {
    // A real interior triangle avoids shared-edge tie ambiguity.
    const ids = surface.indices.slice(
      Math.floor(surface.indices.length / 6) * 3,
      Math.floor(surface.indices.length / 6) * 3 + 3,
    );
    const points = ids.map((i) => result.mesh.positions.slice(i * 3, i * 3 + 3));
    const x = points.reduce((sum, p) => sum + p[0], 0) / 3,
      z = points.reduce((sum, p) => sum + p[2], 0) / 3;
    const hit = picker.pick({ o: { x, y: 30, z }, d: { x: 0, y: -1, z: 0 } });
    assert.equal(hit?.id, surface.id);
    assert.ok(Math.abs(hit.point.y - points.reduce((sum, p) => sum + p[1], 0) / 3) < 1e-8);
  }
});

test('four oblique camera directions pick the nearest visible triangle after a central cut', () => {
  let state = g.createGame(0, 42173, 3);
  const target = state.naturalResources.find((r) => r.x === 20 && r.z === 19);
  assert.ok(target);
  for (let i = 0; i < target.amount; i++) {
    const next = g.dispatch(state, { type: 'gatherNatural', resourceId: target.id }, 0);
    assert.ok(next.ok, next.error);
    state = next.state;
  }
  const result = renderer(state).sync(state.naturalResources),
    picker = new NaturalPicking();
  picker.sync(result.naturalSurface, state.naturalResources);
  const sub = (a, b) => a.map((v, i) => v - b[i]),
    dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0),
    cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  // Independent plane/edge reference, with no per-resource AABB filtering.
  const triangles = [];
  for (let i = 0; i < result.mesh.indices.length; i += 3) {
    const points = result.mesh.indices
      .slice(i, i + 3)
      .map((k) => result.mesh.positions.slice(k * 3, k * 3 + 3));
    triangles.push({
      points,
      normal: cross(sub(points[1], points[0]), sub(points[2], points[0])),
      id: result.triangleOwners[i / 3],
    });
  }
  let hits = 0;
  for (const angle of [0.37, Math.PI / 2 + 0.37, Math.PI + 0.37, (3 * Math.PI) / 2 + 0.37])
    for (let x = 15.2; x < 26; x += 3)
      for (let z = 14.3; z < 25; z += 3) {
        const o = [x + Math.cos(angle) * 30, 18, z + Math.sin(angle) * 30],
          toward = sub([x, 1.5, z], o),
          length = Math.hypot(...toward),
          d = toward.map((v) => v / length);
        let expected = null;
        for (const { points, normal, id } of triangles) {
          const denominator = dot(normal, d);
          if (denominator >= -1e-12) continue;
          const distance = dot(normal, sub(points[0], o)) / denominator;
          if (distance <= 1e-9 || (expected && distance >= expected.distance)) continue;
          const hit = o.map((v, i) => v + distance * d[i]);
          if (
            points.every(
              (p, i) => dot(normal, cross(sub(points[(i + 1) % 3], p), sub(hit, p))) >= -1e-10,
            )
          )
            expected = { id, distance };
        }
        const actual = picker.pick({
          o: { x: o[0], y: o[1], z: o[2] },
          d: { x: d[0], y: d[1], z: d[2] },
        });
        assert.equal(actual?.id, expected?.id);
        if (expected) {
          hits++;
          assert.ok(Math.abs(actual.distance - expected.distance) < 1e-8);
          assert.notEqual(actual.id, target.id, 'the depleted cut cannot remain selectable');
        }
      }
  assert.ok(hits >= 20, `expected useful mountain intersections, got ${hits}`);
});

test('real gather through depletion never raises sampled neighbors and incremental mesh equals fresh build', (t) => {
  const timings = [];
  for (const [version, kind] of [
    [2, 'stone'],
    [3, 'stone'],
    [3, 'soil'],
  ]) {
    let state = g.createGame(0, 1937, version);
    const view = renderer(state),
      start = performance.now();
    view.sync(state.naturalResources);
    const initialMs = performance.now() - start;
    const target = state.naturalResources.find((r) => r.kind === kind && r.amount >= 2);
    assert.ok(target);
    let prior = [],
      points = [];
    for (let x = target.x - 5; x <= target.x + 6; x += 0.25)
      for (let z = target.z - 5; z <= target.z + 6; z += 0.25) points.push([x, z]);
    prior = points.map(([x, z]) => view.field.height(x, z));
    const updateMs = [];
    for (let unit = 0; unit < (kind === 'soil' ? 1 : target.amount); unit++) {
      const old = g.exportSave(state),
        others = state.naturalResources.filter((r) => r.id !== target.id);
      const gathered = g.dispatch(state, { type: 'gatherNatural', resourceId: target.id }, 0);
      assert.ok(gathered.ok, gathered.error);
      assert.equal(g.exportSave(state), old);
      assert.equal(gathered.state.inventory[kind], state.inventory[kind]);
      assert.equal(
        looseAmount(gathered.state, kind),
        looseAmount(state, kind) + (kind === 'soil' ? 9 : 1),
      );
      state = g.importSave(g.exportSave(gathered.state), 0);
      assert.deepEqual(
        state.naturalResources.filter((r) => r.id !== target.id),
        others,
      );
      const begin = performance.now(),
        result = view.sync(state.naturalResources);
      updateMs.push(performance.now() - begin);
      valid(result, state.naturalResources);
      assert.ok(result.rebuiltCells < state.naturalResources.length);
      const next = points.map(([x, z]) => view.field.height(x, z));
      next.forEach((h, i) =>
        assert.ok(h <= prior[i] + 1e-10, `raised ${points[i]} by ${h - prior[i]}`),
      );
      prior = next;
      const fresh = renderer(state).sync(state.naturalResources);
      assert.deepEqual(result.mesh.indices, fresh.mesh.indices);
      assert.equal(result.mesh.positions.length, fresh.mesh.positions.length);
      result.mesh.positions.forEach((v, i) =>
        assert.ok(Math.abs(v - fresh.mesh.positions[i]) < 1e-10),
      );
    }
    assert.equal(view.field.height(target.x + 0.5, target.z + 0.5), 0.015);
    assert.ok(!view.sync(state.naturalResources).triangleOwners.includes(target.id));
    timings.push({
      version,
      kind,
      initialMs: +initialMs.toFixed(1),
      updateMs: updateMs.map((ms) => +ms.toFixed(1)),
    });
  }
  t.diagnostic(
    `CPU timings on this test host only, not GPU or device performance: ${JSON.stringify(timings)}`,
  );
});

test('historical depleted save remains exact and uses seed reference rather than remaining stock', () => {
  const state = g.importSave(JSON.stringify(historical), 0),
    saved = g.exportSave(state),
    view = renderer(state);
  valid(view.sync(state.naturalResources), state.naturalResources);
  assert.equal(g.exportSave(state), saved);
  assert.deepEqual(g.importSave(saved, 0), expectedSchema10(historical));
  assert.deepEqual(state.naturalResources, historical.naturalResources);
  assert.deepEqual(state.trees, historical.trees);
  assert.equal(historical.schemaVersion, 8, 'Historical fixture remains unchanged');
  assert.throws(
    () => islandTerrain(40, state.mapSeed, () => true, { resources: state.naturalResources }),
    /immutable seed reference/,
  );
});

test('immutable reference is read once at construction and never rebuilt from remaining units', () => {
  let reads = 0,
    constructed = false;
  const view = new ContinuousResources(8, 73419, () => {
    assert.equal(constructed, false, 'resource updates must not re-read seed reference');
    reads++;
    return { biome: 'hill', elevation: 2 };
  });
  constructed = true;
  assert.equal(reads, 64);
  const original = [{ id: 'soil', x: 3, z: 3, amount: 2, kind: 'soil' }];
  view.sync(original);
  view.sync([{ ...original[0], amount: 1 }]);
  view.sync([]);
  assert.equal(reads, 64);
  assert.equal(view.field.height(3.5, 3.5), 0.015);
});

test('empty canonical island output has finite bounds', () => {
  const mesh = islandTerrain(4, 1, () => false);
  assert.equal(mesh.indices.length, 0);
  assert.ok([...mesh.min, ...mesh.max].every(Number.isFinite));
});
