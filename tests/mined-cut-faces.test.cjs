const test = require('node:test');
const assert = require('node:assert/strict');
const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
const { NaturalPicking } = require('../.domain-build/application/NaturalPicking');
function setup() {
  const resources = [];
  for (let x = 2; x <= 5; x++)
    for (let z = 2; z <= 5; z++)
      resources.push({ id: `n${x}_${z}`, x, z, kind: 'stone', amount: 4 });
  const view = new ContinuousResources(8, 17, (x, z) =>
    x >= 2 && x <= 5 && z >= 2 && z <= 5 ? { biome: 'mountain', elevation: 4 } : null,
  );
  return { resources, view };
}
function triangles(result) {
  return Array.from({ length: result.mesh.indices.length / 3 }, (_, i) => ({
    owner: result.triangleOwners[i],
    points: result.mesh.indices
      .slice(i * 3, i * 3 + 3)
      .map((k) => result.mesh.positions.slice(k * 3, k * 3 + 3)),
    normals: result.mesh.indices
      .slice(i * 3, i * 3 + 3)
      .map((k) => result.mesh.normals.slice(k * 3, k * 3 + 3)),
  }));
}
test('one mined layer creates a real planar top, vertical unit-grid walls and hard normals', () => {
  const { resources, view } = setup();
  view.sync(resources);
  resources.find((r) => r.id === 'n3_3').amount--;
  const result = view.sync(resources),
    faces = triangles(result);
  const caps = faces.filter(
    (t) => t.owner === 'n3_3' && t.points.every((p) => Math.abs(p[1] - 3.015) < 1e-10),
  );
  assert.ok(caps.length >= 16, 'the excavated top is a plane, not a smooth depression');
  caps.forEach((t) => t.normals.forEach((n) => assert.deepEqual(n, [0, 1, 0])));
  const walls = faces.filter((t) => t.normals.every((n) => n[1] === 0));
  assert.ok(walls.length > 0, 'actual new vertical triangles close the exposed cut');
  for (const t of walls) {
    const axis = t.normals[0][0] ? 0 : 2;
    assert.ok(t.points.every((p) => p[axis] === t.points[0][axis] && Number.isInteger(p[axis])));
    t.normals.forEach((n) => assert.equal(Math.hypot(...n), 1));
  }
});
test('mining changes no uncut natural height, even immediately across a cut boundary', () => {
  const { resources, view } = setup();
  view.sync(resources);
  const points = [];
  for (let x = 2.1; x < 6; x += 0.2)
    for (let z = 2.1; z < 6; z += 0.2)
      if (Math.floor(x) !== 3 || Math.floor(z) !== 3) points.push([x, z]);
  const before = points.map(([x, z]) => view.field.height(x, z));
  resources.find((r) => r.id === 'n3_3').amount = 2;
  view.sync(resources);
  assert.deepEqual(
    points.map(([x, z]) => view.field.height(x, z)),
    before,
  );
  view.sync(resources.filter((r) => r.id !== 'n3_3'));
  assert.deepEqual(
    points.map(([x, z]) => view.field.height(x, z)),
    before,
  );
  assert.equal(view.field.height(3.5, 3.5), 0.015);
});
test('all four excavation walls are selectable as the real surviving neighbor, never the removed column', () => {
  const { resources, view } = setup(),
    live = resources.filter((r) => r.id !== 'n3_3');
  const result = view.sync(live),
    picker = new NaturalPicking();
  picker.sync(result.naturalSurface, live);
  for (const [dx, dz, expected] of [
    [1, 0, 'n4_3'],
    [-1, 0, 'n2_3'],
    [0, 1, 'n3_4'],
    [0, -1, 'n3_2'],
  ]) {
    const hit = picker.pick({ o: { x: 3.5, y: 1.5, z: 3.5 }, d: { x: dx, y: 0, z: dz } });
    assert.equal(hit?.id, expected);
    assert.ok(Math.abs(hit.distance - 0.5) < 1e-10);
  }
  assert.ok(!result.triangleOwners.includes('n3_3'));
});

test('every multi-layer stone column across old and new seeded worlds visibly intersects its first cut', () => {
  const g = require('../.domain-build/domain/game');
  const { ContinuousField } = require('../.domain-build/art/ContinuousField');
  let checked = 0;
  for (const version of [2, 3, 4])
    for (const seed of [1, 17, 1937, 42173, 1000000000]) {
      const state = g.createGame(0, seed, version);
      const field = new ContinuousField(g.worldSize(version), seed, (x, z) =>
        g.terrainAt(x, z, seed, version),
      );
      field.sync(state.naturalResources);
      for (const resource of state.naturalResources.filter(
        (r) => r.kind === 'stone' && r.amount > 1,
      )) {
        assert.ok(
          field.height(resource.x + 0.5, resource.z + 0.5) > resource.amount - 1 + 0.015,
          `${version}/${seed}/${resource.id}: first excavation must intersect real geometry`,
        );
        checked++;
      }
    }
  assert.ok(checked > 3000);
});
