/** Canonical geometry + production adapters on CPU, not rendered browser/device evidence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { GameSession } = require('../.domain-build/application/GameSession');
const { collectionGains, collectionOrigin } = require('../.domain-build/application/Collections');
const { dropShape, dropRect } = require('../.domain-build/application/DropGeometry');
const { buildContinuousCoast } = require('../.domain-build/art/ContinuousCoast');
const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
const { load } = require('./helpers/farm-picking-ui.cjs');
const { Node: BaseNode, Factory, ModelPicking } = require('./helpers/resource-picking-ui.cjs');
const ui = require('./helpers/selection-ui.cjs');
const { DropSupport } = ui.load('DropSupport');
class Node extends BaseNode {
  setPosition(x, y, z) {
    this.position = Object.assign([x, y, z], { x, y, z });
  }
}
const { LooseDropView } = load('LooseDropView', {
  cc: { Node },
  './ModelFactory': { ModelFactory: Factory },
  './ModelPicking': { ModelPicking },
  './ObjectBounds': {},
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function drop(item = 'stone', amount = 1, x6 = 15, z6 = 15) {
  return {
    id: 'd1',
    item,
    amount,
    x6,
    z6,
    source: { type: 'natural', resourceId: 'n1', kind: 'stone' },
  };
}
function supportMesh(y) {
  return { positions: [0, y, 0, 10, y, 0, 0, y, 10, 10, y, 10], indices: [0, 2, 1, 1, 2, 3] };
}
function support() {
  const s = new DropSupport();
  s.set('coast', supportMesh(0.015));
  return s;
}
test('every legal loose stack uses canonical art, fits the one-third spacing and keeps its saved origin', () => {
  for (const item of ['soil', 'stone', ...g.CROP_KEYS])
    for (let amount = 1; amount <= g.stackLimitFor(item); amount++) {
      const d = drop(item, amount),
        shape = dropShape(d),
        r = dropRect(d);
      assert.ok(shape.width <= 0.28000001 && shape.depth <= 0.28000001);
      close(r.x + r.width / 2, d.x6 / 6);
      close(r.z + r.depth / 2, d.z6 / 6);
    }
});
test('drop model bottom sits on exact curved triangles and follows depletion height without moving X/Z', () => {
  const field = new ContinuousResources(5, 73129, () => ({ biome: 'mountain', elevation: 3 }));
  const s = support(),
    state = { looseDrops: [drop()] },
    world = new Node('World'),
    view = new LooseDropView(world);
  const before = JSON.stringify(state);
  const first = field.sync([{ id: 'n1', x: 2, z: 2, kind: 'stone', amount: 3 }]);
  s.set('natural', first.mesh);
  view.sync(state, s);
  const d = state.looseDrops[0],
    r = dropRect(d),
    shape = dropShape(d);
  const y = s.height({ minX: r.x, maxX: r.x + r.width, minZ: r.z, maxZ: r.z + r.depth });
  close(view.origin(d.id).y + shape.minY * shape.scale, y + 0.008);
  assert.ok(y > 0.015);
  const old = view.entries.get(d.id).node;
  view.sync(state, s);
  assert.strictEqual(view.entries.get(d.id).node, old);
  s.set('natural', field.sync([]).mesh);
  view.sync(state, s);
  const p = view.origin(d.id);
  close(p.x, 2.5);
  close(p.z, 2.5);
  close(p.y + shape.minY * shape.scale, 0.023);
  assert.ok(old.destroyed);
  assert.equal(JSON.stringify(state), before);
  const ray = { o: { x: p.x, y: 12, z: p.z }, d: { x: 0, y: -1, z: 0 } };
  assert.equal(view.pick(ray)?.id, d.id);
  view.sync({ looseDrops: [] }, s);
  assert.equal(view.pick(ray), null);
  assert.equal(view.origin(d.id), null);
});
test('field move does not carry historic crop drop, and current real bed takes precedence over flat land', () => {
  const s = support(),
    farm = { id: 'f', kind: 'farm', x: 2, z: 2, rotation: 0, irrigated: true };
  s.setFarms([farm]);
  const d = {
    ...drop('rice', 2, 17, 17),
    source: { type: 'crop', buildingId: 'f', cell: 0, jobId: 'j1' },
  };
  const view = new LooseDropView(new Node('World'));
  view.sync({ looseDrops: [d] }, s);
  const shape = dropShape(d);
  close(view.origin(d.id).y + shape.minY * shape.scale, 0.188);
  s.setFarms([{ ...farm, x: 5, z: 5 }]);
  view.sync({ looseDrops: [d] }, s);
  close(view.origin(d.id).x, 17 / 6);
  close(view.origin(d.id).z, 17 / 6);
  close(view.origin(d.id).y + shape.minY * shape.scale, 0.023);
});
test('shore protection reserves actual drop rectangle and preserves old no-drop geometry deterministically', () => {
  const land = (x, z) => x >= 0 && z >= 0 && x < 2 && z < 2,
    d = drop('stone', 1, 1, 1),
    r = dropRect(d);
  const plain = buildContinuousCoast(3, 73129, land),
    protectedCoast = buildContinuousCoast(3, 73129, land, [r]);
  const s = new DropSupport();
  s.set('coast', protectedCoast.mesh);
  for (const x of [r.x, r.x + r.width / 2, r.x + r.width])
    for (const z of [r.z, r.z + r.depth / 2, r.z + r.depth])
      assert.ok(s.height({ minX: x, maxX: x, minZ: z, maxZ: z }) >= 0.015 - 1e-9);
  assert.deepEqual(buildContinuousCoast(3, 73129, land, []).mesh, plain.mesh);
});
function ripe(box = false) {
  const state = g.createGame(1000, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.inventory = emptyStock();
  const farm = state.buildings.find((b) => b.kind === 'farm');
  farm.cropJobs = Array(9).fill(null);
  farm.cropJobs[4] = {
    id: 'j1',
    crop: 'vegetable',
    startedAt: 0,
    readyAt: 1000,
    yield: 2,
    durationMs: 1000,
  };
  if (box) farm.collectionBox = { crateId: 'b40', capacity: 16, stock: emptyStock() };
  return { state, farm };
}
test('harvest and box harvest have no inventory flight; only successful explicit withdrawal does', () => {
  for (const boxed of [false, true]) {
    const { state, farm } = ripe(boxed),
      result = g.dispatch(state, { type: 'harvestCell', buildingId: farm.id, cell: 4 }, 1000);
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(collectionGains(state, result.state), []);
    const c = boxed
      ? { type: 'withdrawFarmBox', buildingId: farm.id, item: 'vegetable', quantity: 1 }
      : { type: 'pickupDrop', dropId: result.state.looseDrops[0].id };
    const picked = g.dispatch(result.state, c, 1000);
    assert.equal(picked.ok, true, picked.error);
    assert.deepEqual(collectionGains(result.state, picked.state), [
      { kind: 'vegetable', amount: boxed ? 1 : 2 },
    ]);
    const p = { x: 2, y: 3.4, z: 5 };
    const origin = collectionOrigin(
      { before: result.state, command: c, gains: [] },
      undefined,
      () => p,
    );
    if (boxed) {
      const cell = g.farmBoxCell(farm);
      assert.deepEqual(origin, { x: cell.x + 0.5, y: 0.6, z: cell.z + 0.5 });
    } else assert.strictEqual(origin, p);
  }
});
test('drop context exposes one exact pickup, and full warehouse disables it without losing ground goods', () => {
  const { state, farm } = ripe();
  let result = g.dispatch(state, { type: 'harvestCell', buildingId: farm.id, cell: 4 }, 1000);
  assert.ok(result.ok);
  const session = {
    state: result.state,
    mode: 'normal',
    reason(c) {
      const r = g.dispatch(this.state, c, 1000);
      return r.ok ? null : r.error;
    },
  };
  const stateUi = ui.load('UiContracts').createUiState();
  stateUi.selectedResource = { kind: 'drop', id: session.state.looseDrops[0].id };
  const sent = [],
    handlers = { command: (c) => sent.push(c) };
  let actions = ui.load('HudActions').actions(session, stateUi, handlers);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].enabled, true);
  actions[0].run();
  assert.deepEqual(sent, [{ type: 'pickupDrop', dropId: stateUi.selectedResource.id }]);
  session.state.inventory.wood = g.getCapacity(session.state);
  const before = g.exportSave(session.state);
  actions = ui.load('HudActions').actions(session, stateUi, handlers);
  assert.equal(actions[0].enabled, false);
  assert.match(actions[0].reason, /仍保留地上/);
  assert.equal(g.exportSave(session.state), before);
});

test('live field box models follow the external occupied tile in every rotation without shifting any crop cell', () => {
  const { presentation, collaborators } = require('./helpers/demo-campaign-scene.cjs');
  const Factory = collaborators['./ModelFactory'].ModelFactory;
  const { RenderedCropPicking } = presentation('RenderedCropPicking');
  const factory = new Factory();
  for (const size of [3, 6])
    for (let rotation = 0; rotation < 4; rotation++) {
      const b = {
        id: 'b9',
        kind: 'farm',
        x: 8,
        z: 5,
        rotation,
        cropJobs: Array(size * size).fill(null),
        ...(size === 6 ? { farmSize: 6 } : {}),
        collectionBox: { crateId: 'b8', capacity: 16, stock: { ...emptyStock(), rice: 3 } },
      };
      const node = factory.building(b, 1000),
        plain = factory.building({ ...b, collectionBox: undefined }, 1000);
      const grid = node.getChildByName('FarmGrid'),
        oldGrid = plain.getChildByName('FarmGrid'),
        box = grid.getChildByName('FarmCollectionBox');
      assert.equal(box.asset, 'farm-collection-box-8');
      const matrix = {};
      box.getWorldMatrix(matrix);
      const cell = g.farmBoxCell(b);
      close(matrix.affine[3], cell.x + 0.5);
      close(matrix.affine[11], cell.z + 0.5);
      for (let i = 0; i < size * size; i++)
        assert.deepEqual(
          grid.getChildByName(`Cell${i}`).position,
          oldGrid.getChildByName(`Cell${i}`).position,
        );
      const picking = new RenderedCropPicking(node);
      assert.equal(picking.cellAt(box), null);
      assert.equal(picking.isSoil(box), false);
    }
});
test('field box controls show saved quantity and capacity, never collect maturity automatically, and expose bounded manual withdrawal', () => {
  const { state, farm } = ripe(true);
  farm.collectionBox.stock.vegetable = 3;
  const session = {
    state,
    mode: 'normal',
    reason(c) {
      const r = g.dispatch(this.state, c, 1000);
      return r.ok ? null : r.error;
    },
  };
  const stateUi = ui.load('UiContracts').createUiState();
  stateUi.selected = farm.id;
  stateUi.quantity = 1;
  const sent = [],
    handlers = { command: (c) => sent.push(c), quantity() {} };
  let actions = ui.load('HudActions').actions(session, stateUi, handlers);
  assert.match(ui.load('HudDescription').description(session, stateUi), /田箱3\/16/);
  const action = actions.find((a) => a.text.startsWith('取回'));
  assert.equal(action.enabled, true);
  action.run();
  assert.deepEqual(sent, [
    { type: 'withdrawFarmBox', buildingId: farm.id, item: 'vegetable', quantity: 1 },
  ]);
  assert.ok(!actions.some((a) => /收割|自动收/.test(a.text)));
  session.state.inventory.wood = g.getCapacity(session.state);
  actions = ui.load('HudActions').actions(session, stateUi, handlers);
  assert.equal(actions.find((a) => a.text.startsWith('取回')).enabled, false);
  assert.equal(farm.collectionBox.stock.vegetable, 3);
  assert.ok(farm.cropJobs[4]);
});
