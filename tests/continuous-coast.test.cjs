const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildContinuousCoast,
  coastProtectionSignature,
} = require('../.domain-build/art/ContinuousCoast.js');
const { buildCoastalWater, coastalWaveHeight } = require('../.domain-build/art/CoastalWater.js');
function valid(mesh) {
  for (const name of ['positions', 'normals', 'colors', 'min', 'max'])
    assert.ok(mesh[name].every(Number.isFinite), name);
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.colors.length / 4, mesh.positions.length / 3);
  assert.ok(
    mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i < mesh.positions.length / 3),
  );
}
function topArea(mesh) {
  let area = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const p = mesh.indices.slice(i, i + 3).map((j) => mesh.positions.slice(j * 3, j * 3 + 3));
    if (p.some((v) => Math.abs(v[1] - 0.015) > 1e-9)) continue;
    const [a, b, c] = p;
    area += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2;
  }
  return area;
}
test('continuous coast is seeded, curved, finite and deterministic', () => {
  const land = (x, z) => x > 1 && x < 12 && z > 1 && z < 12;
  const a = buildContinuousCoast(15, 34, land),
    b = buildContinuousCoast(15, 34, land),
    c = buildContinuousCoast(15, 35, land);
  assert.equal(a.coastFallback, false);
  valid(a.mesh);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.outlines, c.outlines);
  assert.ok(a.outlines[0].some(([x, z]) => x % 1 !== 0 && z % 1 !== 0));
});
test('full upgraded 4x4 farm footprint retains its entire coast contact', () => {
  const a = buildContinuousCoast(16, 12, (x, z) => x >= 2 && x < 13 && z >= 2 && z < 13, [
    { x: 2, z: 3, width: 4, depth: 4 },
  ]);
  assert.equal(a.coastFallback, false);
  for (let z = 3; z <= 7; z += 0.25)
    assert.ok(
      a.outlines[0].some((p) => p[0] === 2 && p[1] === z),
      `lost contact ${z}`,
    );
});
test('dock footprint and explicitly protected seaward exit stay aligned in each direction', () => {
  for (const rect of [
    { x: 1, z: 5, width: 2, depth: 2 },
    { x: 12, z: 5, width: 2, depth: 2 },
    { x: 5, z: 1, width: 2, depth: 2 },
    { x: 5, z: 12, width: 2, depth: 2 },
  ]) {
    const a = buildContinuousCoast(16, 12, (x, z) => x >= 2 && x < 13 && z >= 2 && z < 13, [rect]);
    valid(a.mesh);
    assert.equal(a.coastFallback, false);
    const at = rect.x === 1 ? [2, 6] : rect.x === 12 ? [13, 6] : rect.z === 1 ? [6, 2] : [6, 13];
    assert.ok(a.outlines[0].some((p) => p[0] === at[0] && p[1] === at[1]));
  }
});
test('lake holes use exact-mask tops rather than filling the lake', () => {
  const a = buildContinuousCoast(7, 1, (x, z) => !(x >= 2 && x <= 4 && z >= 2 && z <= 4));
  assert.equal(a.coastFallback, true);
  assert.equal(a.outlines.length, 2);
  assert.equal(topArea(a.mesh), 40);
  valid(a.mesh);
  for (let i = 0; i < a.mesh.indices.length; i += 3) {
    const p = a.mesh.indices.slice(i, i + 3).map((j) => a.mesh.positions.slice(j * 3, j * 3 + 3));
    if (p.every((v) => v[1] === 0.015)) {
      const x = p.reduce((s, v) => s + v[0], 0) / 3,
        z = p.reduce((s, v) => s + v[2], 0) / 3;
      assert.ok(!(x > 2 && x < 5 && z > 2 && z < 5));
    }
  }
});
test('protected concave shoreline ears do not overlap or bridge across water', () => {
  const land = (x, z) => (x === 0 && (z === 0 || z === 1)) || (x === 1 && z === 1);
  const coast = buildContinuousCoast(4, 1, land, [{ x: 0, z: 0, width: 4, depth: 4 }]);
  valid(coast.mesh);
  assert.equal(topArea(coast.mesh), 3);
  for (let i = 0; i < coast.mesh.indices.length; i += 3) {
    const p = coast.mesh.indices
      .slice(i, i + 3)
      .map((j) => coast.mesh.positions.slice(j * 3, j * 3 + 3));
    if (!p.every((v) => v[1] === 0.015)) continue;
    const x = p.reduce((sum, v) => sum + v[0], 0) / 3;
    const z = p.reduce((sum, v) => sum + v[2], 0) / 3;
    assert.ok(land(Math.floor(x), Math.floor(z)), `triangle covers water at ${x},${z}`);
  }
});
test('corner touches, disconnected pieces, empty masks and thin necks never crash', () => {
  for (const land of [
    (x, z) => x === z,
    () => false,
    (x, z) => (x === 1 && z < 4) || (z === 3 && x < 5),
    (x, z) => (x < 2 && z < 2) || (x > 3 && z > 3),
  ]) {
    const a = buildContinuousCoast(6, 5, land);
    valid(a.mesh);
    if (a.coastFallback) {
      let count = 0;
      for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) if (land(x, z)) count++;
      assert.equal(topArea(a.mesh), count);
    }
    valid(buildCoastalWater(6, 5, a.outlines));
  }
});
test('water has restrained coherent motion and depth color without checkerboard cells', () => {
  const coast = buildContinuousCoast(8, 1, () => true),
    water = buildCoastalWater(8, 1, coast.outlines);
  valid(water);
  assert.ok(water.max[1] <= -0.592 && water.min[1] >= -0.642);
  assert.ok(Math.abs(coastalWaveHeight(1, 2, 1) - coastalWaveHeight(1.01, 2, 1)) < 0.001);
  assert.notDeepEqual(water.positions, buildCoastalWater(8, 1, coast.outlines, 2).positions);
});
test('256 adversarial masks retain finite topology and read immutable land once', () => {
  for (let seed = 0; seed < 256; seed++) {
    let reads = 0;
    const a = buildContinuousCoast(6, seed, (x, z) => {
      reads++;
      return !!(
        (Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663) ^ Math.imul(seed + 1, 83492791)) &
        16
      );
    });
    assert.equal(reads, 36);
    valid(a.mesh);
  }
});

test('coast dependency masks ignore inland buildings and rectangle identity or order', () => {
  const land = () => true,
    a = { x: 1, z: 8, width: 2, depth: 2 },
    b = { x: 36, z: 13, width: 2, depth: 2 },
    inland = { x: 16, z: 16, width: 4, depth: 4 },
    initial = buildContinuousCoast(40, 12, land, [a, b]);
  const signature = coastProtectionSignature(initial, [a, b]);
  for (const rects of [
    [b, a],
    [a, b, inland],
    [a, a, b],
  ]) {
    assert.equal(coastProtectionSignature(initial, rects), signature);
    assert.deepEqual(buildContinuousCoast(40, 12, land, rects).mesh, initial.mesh);
  }
});

test('final curve protection detects wall-only changes with identical raw coverage', () => {
  const land = (x, z) => x >= 2 && x < 13 && z >= 2 && z < 13;
  const a = { x: 2, z: 5, width: 2, depth: 2, margin: 0.1 },
    b = { ...a, margin: 0.4 },
    before = buildContinuousCoast(16, 12, land, [a]),
    after = buildContinuousCoast(16, 12, land, [b]);
  const oldKey = coastProtectionSignature(before, [a]),
    nextKey = coastProtectionSignature(before, [b]);
  assert.equal(oldKey.split('|')[0], nextKey.split('|')[0]);
  assert.notEqual(oldKey, nextKey);
  assert.deepEqual(before.outlines, after.outlines);
  assert.notDeepEqual(before.mesh, after.mesh);
});

test('cached protection transitions match fresh coast across moves, deletion and hole fallback', () => {
  for (const land of [
    (x, z) => x >= 2 && x < 13 && z >= 2 && z < 13,
    (x, z) => x >= 2 && x < 13 && z >= 2 && z < 13 && !(x === 6 && z === 6),
  ]) {
    let current = buildContinuousCoast(16, 12, land),
      signature = coastProtectionSignature(current, []);
    const a = { x: 2, z: 5, width: 2, depth: 2 },
      b = { x: 9, z: 11, width: 4, depth: 4 };
    for (const rects of [[a], [b], [a], [a, a], [a], []]) {
      if (coastProtectionSignature(current, rects) !== signature) {
        current = buildContinuousCoast(16, 12, land, rects);
        signature = coastProtectionSignature(current, rects);
      }
      assert.deepEqual(current.mesh, buildContinuousCoast(16, 12, land, rects).mesh);
      assert.equal(coastProtectionSignature(current, rects), signature, 'repeat sync is cached');
    }
  }
});

test('actual legal docks retain exact seaward contact for all versions and facings', () => {
  const g = require('../.domain-build/domain/game');
  for (const version of [1, 2, 3, 4]) {
    const size = g.worldSize(version),
      state = g.createGame(0, 42173, version),
      before = g.exportSave(state),
      land = (x, z) => !!g.terrainAt(x, z, state.mapSeed, version, state.landExtensions);
    for (const rotation of [0, 1, 2, 3]) {
      let dock;
      for (let x = 0; x < size - 1 && !dock; x++)
        for (let z = 0; z < size - 1; z++) {
          const candidate = { kind: 'dock', x, z, rotation };
          if (g.isDockShore(candidate, state.mapSeed, version)) {
            dock = candidate;
            break;
          }
        }
      assert.ok(dock);
      const rect = { x: dock.x, z: dock.z, ...g.footprint(dock) },
        coast = buildContinuousCoast(size, state.mapSeed, land, [rect]);
      const contact =
        rotation === 0
          ? [dock.x + 1, dock.z + 2]
          : rotation === 1
            ? [dock.x + 2, dock.z + 1]
            : rotation === 2
              ? [dock.x + 1, dock.z]
              : [dock.x, dock.z + 1];
      assert.ok(
        coast.outlines.some((loop) => loop.some(([x, z]) => x === contact[0] && z === contact[1])),
      );
      assert.ok(
        coast.waterlines.some((loop) =>
          loop.some(([x, z]) => x === contact[0] && z === contact[1]),
        ),
        'the beach does not reclaim a legal dock exit',
      );
      const turnedRect = { ...rect, ...g.footprint({ ...dock, rotation: (rotation + 1) % 4 }) };
      assert.equal(
        coastProtectionSignature(coast, [turnedRect]),
        coastProtectionSignature(coast, [rect]),
      );
    }
    assert.equal(g.exportSave(state), before);
    assert.deepEqual(g.importSave(before, 0), state);
  }
});
