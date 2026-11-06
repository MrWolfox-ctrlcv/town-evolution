/** Canonical mesh tests, independent of catalog registration and the Cocos renderer. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  handcartParts,
  handcart,
  transportWarehouse,
} = require('../.domain-build/art/TransportKit');
const { warehouse } = require('../.domain-build/art/WarehouseKit');
const { move } = require('../.domain-build/art/AssetTypes');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');

test('transport warehouse retains every existing part, footprint and loading socket', () => {
  const base = warehouse('warehouse-base');
  const upgraded = transportWarehouse();
  assert.equal(upgraded.id, 'warehouse-transport');
  assert.deepEqual(upgraded.footprint, base.footprint);
  assert.deepEqual(upgraded.parts.slice(0, base.parts.length), base.parts);
  for (const [name, value] of Object.entries(base.sockets))
    assert.deepEqual(upgraded.sockets[name], value);
  assert.deepEqual(
    upgraded.parts.slice(base.parts.length),
    move(handcartParts(), [0.61, 0.22, 0.585], 0.8),
    'The upgrade mounts the identical cart, rather than a simplified decorative replacement',
  );
  assert.deepEqual(handcart().parts, handcartParts());
});

test('the handcart is open slatted geometry with handles, hollow rims and six spokes per wheel', () => {
  const cart = handcart();
  const named = (name) => cart.parts.filter((part) => part.name === name);
  assert.deepEqual(cart.footprint, [1, 1]);
  assert.equal(named('handcart-floor-plank').length, 5);
  assert.equal(named('handcart-side-slat').length, 6);
  assert.equal(named('handcart-end-slat').length, 6);
  assert.equal(named('handcart-corner-post').length, 4);
  assert.equal(named('handcart-handle').length, 2);
  assert.equal(named('handcart-wheel-rim').length, 2);
  assert.ok(named('handcart-wheel-rim').every((part) => part.shape === 'binding'));
  assert.equal(named('handcart-wheel-spoke').length, 6, 'Three diameter bars make six spokes');
  assert.ok(!cart.parts.some((part) => part.name.includes('lid') || part.name.includes('body')));
  assert.ok(named('handcart-handle').every((part) => part.position[2] > 0.15));
});

test('cart stays visibly in front of the inherited crates, clear of the door and under its canopy', () => {
  const cart = compileAsset({
    ...handcart(),
    parts: move(handcartParts(), [0.61, 0.22, 0.585], 0.8),
  });
  const base = warehouse('warehouse-base');
  const crates = compileAsset({
    ...base,
    parts: base.parts.filter(
      (p) => p.name.startsWith('crate-') && !p.name.includes('canopy') && !p.name.includes('deck'),
    ),
  });
  const door = base.parts.find((p) => p.name === 'home-door');
  assert.ok(cart.min[2] > crates.max[2], 'Cart is not buried in the stored crates');
  assert.ok(cart.min[0] > door.position[0] + door.size[0] / 2, 'Entrance stays unobstructed');
  assert.ok(cart.max[1] < 1.06, 'Cart remains below the original side canopy');
});

test('both transport assets compile deterministically within shared triangle and vertex budgets', () => {
  for (const recipe of [handcart(), transportWarehouse()]) {
    const mesh = compileAsset(recipe);
    const vertices = mesh.positions.length / 3;
    assert.deepEqual(compileAsset(recipe), mesh);
    assert.ok(mesh.indices.length / 3 < 3000, `${recipe.id} triangle budget`);
    assert.ok(vertices < 6000, `${recipe.id} vertex budget`);
    assert.equal(mesh.normals.length, mesh.positions.length);
    assert.equal(mesh.colors.length, vertices * 4);
    assert.equal(mesh.uvs.length, vertices * 2);
    assert.ok(
      [...mesh.positions, ...mesh.normals, ...mesh.colors, ...mesh.uvs].every(Number.isFinite),
    );
    assert.ok(mesh.texturedIndices.length > 0 && mesh.texturedIndices.length < mesh.indices.length);
    assert.ok(
      mesh.indices.every((index) => Number.isInteger(index) && index >= 0 && index < vertices),
    );
    for (let i = 0; i < mesh.normals.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i + 3)) - 1) < 1e-6);
  }
});

test('both assets have real back and side faces and stay inside their footprints in all rotations', () => {
  for (const recipe of [handcart(), transportWarehouse()]) {
    const mesh = compileAsset(recipe);
    assert.ok(mesh.min[1] >= -1e-6, `${recipe.id} sits above ground`);
    assert.ok(mesh.normals.some((normal, i) => i % 3 === 0 && normal > 0.9));
    assert.ok(mesh.normals.some((normal, i) => i % 3 === 2 && normal < -0.9));
    for (let turn = 0; turn < 4; turn++) {
      const angle = (turn * Math.PI) / 2;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i],
          z = mesh.positions[i + 2];
        assert.ok(
          Math.abs(x * Math.cos(angle) + z * Math.sin(angle)) <=
            recipe.footprint[turn % 2] / 2 + 1e-6,
          `${recipe.id}/${turn}/x`,
        );
        assert.ok(
          Math.abs(-x * Math.sin(angle) + z * Math.cos(angle)) <=
            recipe.footprint[(turn + 1) % 2] / 2 + 1e-6,
          `${recipe.id}/${turn}/z`,
        );
      }
    }
  }
});
