/** Pure advisory route regression, not a claim of browser interaction passing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { createGame, dispatch } = require('../.domain-build/domain/game');
const { getV6EditSurface } = require('../.domain-build/domain/v6-edit-surface');
const { v6EditPlane, V6_EDIT_MAX_LEVEL } = require('../.domain-build/domain/v6-material-volume');
test.before(() => {
  const prep = new V6WorldPreparation(42173);
  for (let i = 0; i < 200 && prep.progress.status === 'building'; i++) prep.step(50000);
  assert.equal(prep.progress.status, 'ready');
  prep.takeResult();
});
test('bounded browser advisory selector rejects the exhausted shallow cap and plans a funded route', () => {
  const state = createGame(1000, 42173, 6);
  const before = JSON.stringify(state);
  const session = {
    state,
    preview(command) {
      return dispatch(this.state, command, 1000);
    },
  };
  const code = fs.readFileSync('scripts/preview/v6-interactions.cjs', 'utf8');
  const source = code.slice(
    code.indexOf('      const advisory ='),
    code.indexOf('      if (request.cell)'),
  );
  const choose = new Function('control', 'state', 'surface', 'planes', 'request', 'status', source);
  const result = choose(
    { session },
    state,
    getV6EditSurface(state),
    Array.from({ length: V6_EDIT_MAX_LEVEL + 1 }, (_, i) => v6EditPlane(i)),
    { candidates: true },
    {},
  );
  assert.ok(result.candidates.length > 0, 'at least one fully funded route exists');
  assert.ok(
    !result.candidates.some((c) => c.x === 11 && c.z === 11),
    'thin exhausted cap is not a complete route',
  );
  assert.equal(JSON.stringify(state), before, 'planning never mutates the live snapshot');
  assert.equal(session.state, state);
});

test('real starter excavation spills conserved products outside the opaque pit onto visible support', () => {
  const initial = createGame(1000, 42173, 6);
  const result = dispatch(
    initial,
    {
      type: 'editTerrain6',
      kind: 'dig',
      x: 18,
      z: 17,
      level: 0,
      expectedOperation: 1,
    },
    1000,
  );
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.state.inventory, initial.inventory, 'excavation never auto-collects');
  const drop = result.state.looseDrops[0];
  assert.equal(drop.amount, 1.537109375, 'the entire real stone yield stays on the ground');
  const { dropPosition } = require('../.domain-build/domain/game');
  const { dropRect, dropShape } = require('../.domain-build/application/DropGeometry');
  const { buildV6SurfaceMesh } = require('../.domain-build/art/V6SurfaceMesh');
  const { V6SurfaceSupport } = require('../.domain-build/application/V6SurfaceSupport');
  const { V6TerrainPicking } = require('../.domain-build/application/V6TerrainPicking');
  const { compileAsset } = require('../.domain-build/art/MeshCompiler');
  const { ASSETS } = require('../.domain-build/art/AssetCatalog');
  const p = dropPosition(drop);
  assert.ok(Math.floor(p.x) !== 18 || Math.floor(p.z) !== 17);
  assert.ok(
    Math.abs(drop.x6 - 111) <= 12 && Math.abs(drop.z6 - 105) <= 12,
    'original local radius remains',
  );
  const mesh = buildV6SurfaceMesh(getV6EditSurface(result.state), 14, 14, 12, 12);
  const support = new V6SurfaceSupport(mesh.positions, mesh.indices);
  while (!support.step(10000)) {}
  const rect = dropRect(drop);
  const height = support.height({
    minX: rect.x,
    maxX: rect.x + rect.width,
    minZ: rect.z,
    maxZ: rect.z + rect.depth,
  });
  assert.notEqual(height, null, 'actual published triangles support the full model footprint');
  const picker = new V6TerrainPicking();
  picker.sync([{ mesh }]);
  const shape = dropShape(drop),
    model = compileAsset(ASSETS[shape.asset]);
  const centerY = height + 0.008 + ((model.max[1] - shape.minY) * shape.scale) / 2;
  const ray = { o: { x: p.x + 15, y: centerY + 20, z: p.z + 18 }, d: { x: -15, y: -20, z: -18 } };
  const terrain = picker.pick(ray);
  assert.ok(
    !terrain || terrain.distance > 1,
    'actual camera-to-product ray is not blocked by the near slope',
  );
  const collected = dispatch(result.state, { type: 'pickupDrop', dropId: drop.id }, 1000);
  assert.equal(collected.ok, true, collected.error);
  assert.equal(collected.state.inventory.stone, initial.inventory.stone + drop.amount);
  assert.equal(collected.state.looseDrops.length, 0);
});
