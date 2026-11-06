const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stoneOvenParts,
  stoneOven,
  bakery,
  breadProductUnit,
  BAKERY_OVEN_POSITION,
  BAKERY_OVEN_SCALE,
} = require('../.domain-build/art/BakeryKit');
const { houseCore } = require('../.domain-build/art/BuildingCore');
const { mount } = require('../.domain-build/art/BuildingAccessories');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');

function validateMesh(asset, budget) {
  const mesh = compileAsset(asset);
  const count = mesh.positions.length / 3;
  assert.ok(count > 0 && count < 6000, asset.id);
  assert.ok(mesh.indices.length / 3 < budget, `${asset.id}: triangle budget`);
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.colors.length, count * 4);
  for (const key of ['positions', 'normals', 'colors'])
    assert.ok(mesh[key].every(Number.isFinite), `${asset.id}: finite ${key}`);
  assert.ok(mesh.indices.every((index) => Number.isInteger(index) && index >= 0 && index < count));
  assert.ok(mesh.colors.every((value) => value >= 0 && value <= 1));
  for (let i = 0; i < mesh.normals.length; i += 3)
    assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i + 3)) - 1) < 1e-6);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = mesh.indices
      .slice(i, i + 3)
      .map((index) => mesh.positions.slice(index * 3, index * 3 + 3));
    const u = b.map((value, axis) => value - a[axis]);
    const v = c.map((value, axis) => value - a[axis]);
    assert.ok(
      Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) >
        1e-8,
      `${asset.id}: non-degenerate triangle`,
    );
  }
  return mesh;
}

test('stone oven and bakery use finite canonical geometry within building budgets', () => {
  for (const asset of [stoneOven(), bakery()]) {
    assert.equal(asset.category, 'buildings');
    validateMesh(asset, 3000);
  }
});

test('oven and bakery stay grounded and within their existing footprint in all four rotations', () => {
  for (const asset of [stoneOven(), bakery()]) {
    const mesh = compileAsset(asset);
    assert.ok(mesh.min[1] >= -1e-9, asset.id);
    for (let quarter = 0; quarter < 4; quarter++) {
      const angle = (quarter * Math.PI) / 2;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i];
        const z = mesh.positions[i + 2];
        const rx = x * Math.cos(angle) + z * Math.sin(angle);
        const rz = -x * Math.sin(angle) + z * Math.cos(angle);
        assert.ok(Math.abs(rx) <= asset.footprint[quarter % 2] / 2 + 1e-9, asset.id);
        assert.ok(Math.abs(rz) <= asset.footprint[(quarter + 1) % 2] / 2 + 1e-9, asset.id);
      }
    }
  }
});

test('bakery preserves every original house part and mounts the entire standalone oven', () => {
  const asset = bakery();
  const core = houseCore();
  const oven = mount(stoneOvenParts(), BAKERY_OVEN_POSITION, 0, BAKERY_OVEN_SCALE);
  assert.deepEqual(asset.parts.slice(0, core.length), core);
  assert.deepEqual(asset.parts.slice(core.length, core.length + oven.length), oven);
  assert.deepEqual(stoneOven().parts, stoneOvenParts());
  assert.deepEqual(asset.sockets.oven, BAKERY_OVEN_POSITION);
  assert.ok(asset.parts.some((part) => part.name === 'bakery-shelter-roof-tile'));
  assert.ok(asset.parts.some((part) => part.name === 'bakery-counter-top'));
});

test('oven is stone masonry with a real arch, inset fire, stored logs and open chimney', () => {
  const parts = stoneOvenParts();
  const named = (name) => parts.filter((part) => part.name === name);
  assert.equal(named('oven-arch-stone').length, 7);
  assert.equal(named('oven-stored-log').length, 3);
  assert.equal(named('oven-fire-flame').length, 3);
  const opening = named('oven-mouth-dark')[0];
  const arch = named('oven-arch-stone');
  assert.ok(arch.every((part) => part.position[2] > opening.position[2]));
  assert.ok(named('oven-fire-flame').every((part) => part.position[2] > opening.position[2]));
  const rim = named('oven-chimney-rim')[0];
  const chimney = named('oven-chimney-opening')[0];
  assert.ok(chimney.position[1] > rim.position[1] + rim.size[1] / 2);
  assert.ok(parts.every((part) => !/text|label|badge|number/i.test(part.name)));
});

test('each bread unit is a single scored loaf and the bakery uses that same product geometry', () => {
  const bread = breadProductUnit();
  assert.equal(bread.filter((part) => part.name === 'bread-loaf').length, 1);
  assert.equal(bread.filter((part) => part.name === 'bread-score').length, 3);
  const mesh = validateMesh({ id: 'bread-unit', footprint: [1, 1], parts: bread }, 300);
  assert.ok(mesh.min[1] >= -1e-9);
  assert.ok(mesh.max[0] - mesh.min[0] > mesh.max[2] - mesh.min[2]);
  const counterBread = bakery().parts.filter((part) => part.name.startsWith('bread-'));
  const expected = Array.from({ length: 3 }, (_, i) =>
    mount(breadProductUnit(), [-0.095 + i * 0.15, 0.4275, 0.805], 0, 0.36),
  ).flat();
  assert.deepEqual(counterBread, expected);
});

test('assembly calls are deterministic and do not share mutable parts between variants', () => {
  const original = stoneOven();
  const upgraded = bakery();
  const baseline = JSON.stringify(original);
  const part = upgraded.parts.find((part) => part.name === 'oven-hearth');
  part.position[0] = 99;
  part.color = '#000000';
  assert.equal(JSON.stringify(original), baseline);
  assert.deepEqual(stoneOven(), original);
  assert.notEqual(bakery().parts.find((part) => part.name === 'oven-hearth').position[0], 99);
});
