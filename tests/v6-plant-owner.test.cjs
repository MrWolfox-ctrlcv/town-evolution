const { before, test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../.domain-build/domain/game');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { getV6EditSurface } = require('../.domain-build/domain/v6-edit-surface');
const { buildV6SurfaceMesh } = require('../.domain-build/art/V6SurfaceMesh');
const { V6TerrainPicking } = require('../.domain-build/application/V6TerrainPicking');
const fixture = require('./helpers/v6-plant-owner.cjs');
let state, picker, east, south;
const owner = { x: 77, z: 43 };
before(() => {
  const job = new V6WorldPreparation(1937);
  while (job.step(50000).status !== 'ready') {}
  job.takeResult();
  state = game.createGame(1000, 1937, 6);
  state.inventory.soil = 8;
  state.inventory.sapling = 2;
  for (const cell of [{ x: 78, z: 43 }, { x: 77, z: 44 }, owner, owner]) {
    const result = game.dispatch(
      state,
      {
        type: 'editTerrain6',
        kind: 'fill',
        ...cell,
        level: game.terrain6EditLevel(state, cell.x, cell.z, 'fill'),
        expectedOperation: state.terrain6.nextOperation,
        material: 'soil',
        source: { type: 'inventory', item: 'soil', amount: state.inventory.soil },
      },
      state.lastSeenAt + 1,
    );
    assert.equal(result.ok, true, result.error);
    state = result.state;
  }
  for (let i = 0; i < 8; i++) {
    const current = getV6EditSurface(state);
    if (current.range(77, 43)[0] > Math.max(current.range(78, 43)[1], current.range(77, 44)[1]))
      break;
    const result = game.dispatch(
      state,
      {
        type: 'editTerrain6',
        kind: 'fill',
        ...owner,
        level: game.terrain6EditLevel(state, owner.x, owner.z, 'fill'),
        expectedOperation: state.terrain6.nextOperation,
        material: 'soil',
        source: { type: 'inventory', item: 'soil', amount: state.inventory.soil },
      },
      state.lastSeenAt + 1,
    );
    assert.equal(result.ok, true, result.error);
    state = result.state;
  }
  const surface = getV6EditSurface(state),
    mesh = buildV6SurfaceMesh(surface, 76, 42, 4, 4);
  picker = new V6TerrainPicking();
  picker.sync([{ mesh }]);
  const y = surface.range(owner.x, owner.z)[0] - 0.1;
  east = { o: { x: 78.1, y, z: 43.5 }, d: { x: -15, y: -20, z: -18 } };
  south = { o: { x: 77.5, y, z: 44.1 }, d: { x: -15, y: -20, z: -18 } };
  assert.deepEqual(game.importSave(game.exportSave(state), state.lastSeenAt), state);
});
function wall(ray) {
  const hit = picker.pick(ray);
  assert.equal(hit.surface, 'wall');
  assert.deepEqual({ x: hit.x, z: hit.z }, owner);
  assert.notDeepEqual({ x: Math.floor(hit.point.x), z: Math.floor(hit.point.z) }, owner);
  return hit;
}
function planted(f, type) {
  assert.deepEqual(f.commands, [{ type, ...owner }]);
  assert.equal(f.session.state.trees.length, state.trees.length + 1);
  const tree = f.session.state.trees.at(-1);
  assert.deepEqual({ x: tree.x, z: tree.z }, owner);
  const restored = game.importSave(game.exportSave(f.session.state), f.session.state.lastSeenAt);
  assert.deepEqual(restored.trees.at(-1), tree);
}
for (const side of ['east', 'south'])
  test(`stock sapling release plants the picked ${side} wall owner, not its neighbor`, () => {
    const ray = side === 'east' ? east : south,
      hit = wall(ray),
      before = game.exportSave(state);
    const f = fixture(state, picker, ray);
    f.plant();
    planted(f, 'plantSapling');
    assert.equal(f.session.state.inventory.sapling, state.inventory.sapling - 1);
    assert.equal(f.ground().y, hit.point.y);
    assert.equal(game.exportSave(state), before);
    f.dispose();
    assert.ok(f.shapes.every((shape) => shape.destroyed));
  });
test('map tap planting uses the same wall owner and spends the stated coins once', () => {
  wall(east);
  const f = fixture(state, picker, east);
  f.tapTree();
  planted(f, 'placeTree');
  assert.equal(f.session.state.coins, state.coins - 5);
  assert.equal(f.session.state.inventory.sapling, state.inventory.sapling);
  assert.equal(f.controller.ui.plantingTree, false);
  f.dispose();
});
test('top interior contact preserves its exact point and normal target', () => {
  const ray = { o: { x: 77.5, y: 20, z: 43.5 }, d: { x: 0, y: -1, z: 0 } };
  const hit = picker.pick(ray);
  assert.notEqual(hit.surface, 'wall');
  const f = fixture(state, picker, ray);
  assert.deepEqual({ ...f.ground() }, hit.point);
  f.plant();
  planted(f, 'plantSapling');
  f.dispose();
});
test('unready terrain and covered releases cannot spend saplings or coins', () => {
  for (const covered of [false, true]) {
    const f = fixture(state, picker, east);
    if (covered) f.point.covered = true;
    else f.ready(false);
    const before = game.exportSave(f.session.state);
    f.plant();
    f.tapTree();
    assert.equal(f.commands.length, 0);
    assert.equal(f.writes, 0);
    assert.equal(game.exportSave(f.session.state), before);
    f.dispose();
  }
});
test('cancelling a sapling drag discards its wall preview without a command', () => {
  const f = fixture(state, picker, east),
    before = game.exportSave(f.session.state);
  f.stock.begin('sapling', 1);
  f.stock.move(1, f.point);
  f.stock.cancel();
  f.stock.end(1, f.point);
  assert.equal(f.commands.length, 0);
  assert.equal(f.writes, 0);
  assert.equal(game.exportSave(f.session.state), before);
  f.dispose();
  assert.ok(f.shapes.every((shape) => shape.destroyed));
});
test('legacy map grounding remains the original zero-height plane', () => {
  const legacy = game.createGame(1000, 1, 1);
  const ray = { o: { x: 7.25, y: 20, z: 8.75 }, d: { x: 0, y: -1, z: 0 } };
  const f = fixture(
    legacy,
    {
      pick() {
        throw Error('Legacy map must not use terrain6 picking');
      },
    },
    ray,
  );
  assert.deepEqual({ ...f.ground() }, { x: 7.25, y: 0, z: 8.75 });
  f.dispose();
});

test('wall previews stay above the owning cell top for saplings and loose materials', () => {
  const top = getV6EditSurface(state).range(owner.x, owner.z)[1];
  for (const ray of [east, south])
    for (const item of ['sapling', 'soil']) {
      const f = fixture(state, picker, ray);
      f.stock.begin(item, 1);
      f.stock.move(1, f.point);
      const marker = f.shapes.filter((shape) => shape.name === 'ProductDropPreview').at(-1);
      assert.ok(marker);
      assert.deepEqual(
        { ...marker.position },
        { x: owner.x + 0.5, y: top + 0.09, z: owner.z + 0.5 },
      );
      assert.equal(f.commands.length, 0);
      assert.equal(f.writes, 0);
      f.dispose();
      assert.ok(f.shapes.every((shape) => shape.destroyed));
    }
});
