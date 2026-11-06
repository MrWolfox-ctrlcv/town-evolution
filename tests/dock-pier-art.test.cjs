const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const art = process.env.DOCK_PIER_ART_BUILD || '../.domain-build/art';
const load = (name) => require(path.resolve(__dirname, art, name));
const {
  woodenPierParts,
  woodenPier,
  simpleDock,
  dockPierExtension,
  woodenBoat,
  DOCK_CRATE_POSITION,
  DOCK_CRATE_SCALE,
} = load('DockPierKit');
const { woodenCrate } = load('BuildingAccessories');
const { move } = load('AssetTypes');
const { compileAsset } = load('MeshCompiler');

test('simple dock inherits the entire timber platform and the existing open crate exactly', () => {
  const original = woodenPierParts(),
    dock = simpleDock();
  assert.deepEqual(woodenPier().parts, original);
  assert.deepEqual(dock.parts.slice(0, original.length), original);
  assert.deepEqual(
    dock.parts.slice(original.length),
    move(woodenCrate(), DOCK_CRATE_POSITION, DOCK_CRATE_SCALE),
  );
  assert.equal(dock.parts.filter((p) => p.name === 'crate-floor').length, 1);
  assert.ok(!dock.parts.some((p) => /kiosk|roof|boat|sail|crate-body/.test(p.name)));
  assert.deepEqual(woodenPier().parts, woodenPier().parts, 'deterministic geometry');
});

test('platform and dock match the timber-deck, round-piling, sagging-rope reference', () => {
  for (const recipe of [woodenPier(), simpleDock()]) {
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-piling').length, 4);
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-deck-plank').length, 9);
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-iron-nail').length, 18);
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-rope-binding').length, 8);
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-rope-rail').length, 12);
    assert.ok(recipe.parts.filter((p) => p.name === 'pier-piling').every((p) => p.shape === 'log'));
    const ropes = recipe.parts.filter((p) => p.name === 'pier-rope-rail');
    assert.ok(Math.min(...ropes.map((p) => p.position[1])) < 0.81);
    const ropeMesh = compileAsset({ id: 'rope-check', footprint: [2, 2], parts: ropes });
    assert.ok(ropeMesh.max[1] > 0.93, 'round rope reaches the post binding');
  }
});

test('wooden boat is a separate hollow pointed hull with two benches and two oars', () => {
  const boat = woodenBoat();
  assert.equal(boat.parts.filter((p) => p.name === 'boat-seat').length, 2);
  assert.equal(boat.parts.filter((p) => p.name === 'boat-oar-shaft').length, 2);
  assert.equal(boat.parts.filter((p) => p.name === 'boat-oar-paddle').length, 2);
  assert.equal(boat.parts.filter((p) => p.name === 'boat-hull-slat').length, 27);
  assert.ok(!boat.parts.some((p) => /roof|mast|sail|cabin|body/.test(p.name)));
  assert.ok(boat.parts.some((p) => p.name === 'boat-gunwale' && p.position[2] > 0.7));
  assert.deepEqual(boat.parts, woodenBoat().parts);
});

test('all models have finite real meshes, textured timber and round ropes within mesh budgets', () => {
  for (const recipe of [woodenPier(), simpleDock(), dockPierExtension(), woodenBoat()]) {
    const mesh = compileAsset(recipe);
    assert.ok(mesh.positions.every(Number.isFinite), recipe.id);
    assert.ok(mesh.normals.every(Number.isFinite), recipe.id);
    assert.ok(mesh.uvs.every(Number.isFinite), recipe.id);
    assert.equal(mesh.uvs.length, (mesh.positions.length / 3) * 2);
    assert.ok(mesh.indices.length > 0 && mesh.indices.length / 3 < 3000, recipe.id);
    assert.ok(mesh.positions.length / 3 < 6000, recipe.id);
    assert.ok(mesh.texturedIndices.length > 0, recipe.id);
    assert.ok(mesh.normals.some((_, i) => i % 3 === 2 && mesh.normals[i] < -0.9));
    assert.ok(mesh.normals.some((_, i) => i % 3 === 0 && mesh.normals[i] > 0.9));
  }
});

test('platform, dock and boat respect their collision footprints in all four rotations', () => {
  for (const recipe of [woodenPier(), simpleDock(), woodenBoat()]) {
    const mesh = compileAsset(recipe);
    for (let turn = 0; turn < 4; turn++)
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const a = (turn * Math.PI) / 2,
          x = mesh.positions[i],
          z = mesh.positions[i + 2];
        assert.ok(
          Math.abs(x * Math.cos(a) + z * Math.sin(a)) <= recipe.footprint[turn % 2] / 2 + 1e-6,
          `${recipe.id}/${turn}/x`,
        );
        assert.ok(
          Math.abs(-x * Math.sin(a) + z * Math.cos(a)) <=
            recipe.footprint[(turn + 1) % 2] / 2 + 1e-6,
          `${recipe.id}/${turn}/z`,
        );
      }
  }
});

test('seaward extension stays inside the reserved two-cell water corridor and has submerged pilings', () => {
  const recipe = dockPierExtension(),
    mesh = compileAsset(recipe);
  assert.ok(mesh.min[0] >= -1 && mesh.max[0] <= 1);
  assert.ok(mesh.min[2] >= 0.89 && mesh.max[2] <= 3);
  assert.ok(mesh.min[1] < -0.4);
  assert.equal(recipe.parts.filter((p) => p.name === 'pier-piling').length, 4);
  assert.ok(!recipe.parts.some((p) => p.name.startsWith('boat')));
});
