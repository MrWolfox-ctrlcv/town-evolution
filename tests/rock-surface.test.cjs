const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looseAmount } = require('./helpers/loose-output.cjs');
const { expectedSchema10 } = require('./helpers/expected-schema10.cjs');
const { appendRockUnit, rockLedgeHasMoss } = require('../.domain-build/art/RockBlockKit');
const { emptyNaturalMesh } = require('../.domain-build/art/NaturalMesh');
const { islandTerrain } = require('../.domain-build/art/IslandTerrain');
const g = require('../.domain-build/domain/game');
const historical = require('./fixtures/terrain-v2-depleted.json');

test('a rock unit has broad cut planes and a sloping crown inside its saved one-cell envelope', () => {
  for (let seed = 1; seed < 70; seed++) {
    const mesh = emptyNaturalMesh();
    appendRockUnit(mesh, [2, 3.015, 4], seed, { top: true, bottom: true });
    assert.equal(mesh.positions.length / 3, 96);
    assert.equal(mesh.indices.length / 3, 48);
    assert.deepEqual(mesh.min, [2, 3.015, 4]);
    assert.deepEqual(mesh.max, [3, 3.015 + 1, 5]);
    const top = [];
    for (let i = 0; i < mesh.positions.length; i += 3)
      if (mesh.positions[i + 1] > 3.9) top.push(mesh.positions.slice(i, i + 3));
    assert.ok(top.every(([x, , z]) => x > 2.04 && x < 2.96 && z > 4.04 && z < 4.96));
    assert.ok(new Set(top.map((p) => p[1])).size > 4, 'actual sloped crown, not a flat grey roof');
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const p = mesh.indices.slice(i, i + 3).map((n) => mesh.positions.slice(n * 3, n * 3 + 3));
      const u = p[1].map((v, a) => v - p[0][a]),
        v = p[2].map((v, a) => v - p[0][a]);
      assert.ok(
        Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ) > 1e-8,
      );
    }
  }
});
test('moss breaks low ledges into coherent patches while high summits remain stone', () => {
  let moss = 0,
    rock = 0,
    neighbors = 0,
    agree = 0;
  for (let z = 12; z < 28; z++)
    for (let x = 12; x < 28; x++) {
      const value = rockLedgeHasMoss(42173, x, z, 1);
      value ? moss++ : rock++;
      neighbors++;
      if (value === rockLedgeHasMoss(42173, x + 1, z, 1)) agree++;
      assert.equal(rockLedgeHasMoss(42173, x, z, 3), false);
    }
  assert.ok(moss > 30 && rock > 30);
  assert.ok(agree / neighbors > 0.8, 'no alternating noisy green pixels');
});
test('old depleted saves get new rock surfaces without resource migration or regeneration', () => {
  const state = g.importSave(JSON.stringify(historical), 0);
  const before = JSON.stringify(state);
  const render = (s) =>
    islandTerrain(40, s.mapSeed, (x, z) => g.isLandCell(x, z, s.mapSeed, s.terrainVersion), {
      surface: (x, z) => g.terrainAt(x, z, s.mapSeed, s.terrainVersion),
      resources: s.naturalResources,
    });
  const a = render(state),
    b = render(state);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(g.importSave(g.exportSave(state), 0), expectedSchema10(historical));
  const column = state.naturalResources.find((r) => r.kind === 'stone' && r.amount > 1);
  const result = g.dispatch(state, { type: 'gatherNatural', resourceId: column.id }, 0);
  assert.ok(result.ok, result.error);
  assert.equal(
    result.state.naturalResources.find((r) => r.id === column.id).amount,
    column.amount - 1,
  );
  assert.equal(result.state.inventory.stone, state.inventory.stone);
  assert.equal(looseAmount(result.state, 'stone'), looseAmount(state, 'stone') + 1);
  assert.notDeepEqual(render(result.state), a);
});
test('old and new mountains remain below mobile mesh budgets across representative seeds', () => {
  for (const version of [2, 3])
    for (const seed of [1, 17, 100, 6279, 42173, 193073, 999999999]) {
      const s = g.createGame(0, seed, version);
      const m = islandTerrain(40, seed, (x, z) => g.isLandCell(x, z, seed, version), {
        surface: (x, z) => g.terrainAt(x, z, seed, version),
        resources: s.naturalResources,
      });
      assert.ok(m.positions.length / 3 < 60000, `${version}/${seed} vertices`);
      assert.ok(m.indices.length / 3 < 65000, `${version}/${seed} triangles`);
      assert.ok(m.positions.every(Number.isFinite));
      assert.ok(m.normals.every(Number.isFinite));
    }
});

test('soil and stone share a continuous edge with no cut-rock hole or cuboid wall', () => {
  const mesh = islandTerrain(5, 17, (x, z) => (x === 1 || x === 2) && z === 1, {
    surface: (x, z) => ({ biome: x === 1 ? 'mountain' : 'hill', elevation: z === 1 ? 2 : 0 }),
    resources: [
      { id: 'stone', kind: 'stone', x: 1, z: 1, amount: 2 },
      { id: 'soil', kind: 'soil', x: 2, z: 1, amount: 2 },
    ],
  });
  const boundaries = mesh.naturalSurface.resources.map((resource) => {
    const vertices = new Set(resource.indices),
      points = new Map();
    for (const i of vertices)
      if (Math.abs(mesh.positions[i * 3] - 2) < 1e-9)
        points.set(mesh.positions[i * 3 + 2], mesh.positions.slice(i * 3, i * 3 + 3));
    return points;
  });
  assert.ok(boundaries[0].size >= 5);
  assert.deepEqual(boundaries[0], boundaries[1]);
  assert.ok([...boundaries[0].values()].some((p) => p[1] > 0.5));
  for (const r of mesh.naturalSurface.resources)
    for (let i = 0; i < r.indices.length; i += 3) {
      const p = r.indices.slice(i, i + 3).map((k) => mesh.positions.slice(k * 3, k * 3 + 3));
      const xzArea = Math.abs(
        (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) - (p[2][0] - p[0][0]) * (p[1][2] - p[0][2]),
      );
      assert.ok(xzArea > 0, 'heightfield does not produce fixed vertical cube walls');
    }
});
