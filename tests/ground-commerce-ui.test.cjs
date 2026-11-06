/** Production StackDrag + GameSession, with scene/picking doubles. Not a GPU/device test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
const { GameSession } = require('../.domain-build/application/GameSession.js');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
class Node {
  constructor(name) {
    this.name = name;
    this.children = [];
  }
  addChild(node) {
    this.children.push(node);
  }
  setPosition(...point) {
    this.position = point;
  }
  destroy() {
    this.destroyed = true;
  }
}
class Factory {
  shape(parent, name, ...values) {
    const node = new Node(name);
    node.values = values;
    parent.addChild(node);
    return node;
  }
  dispose() {}
}
const dependencies = {
  '../application/DropSnapshot': require('../.domain-build/application/DropSnapshot'),
  './TerrainInteraction': require('./helpers/selection-ui.cjs').load('TerrainInteraction'),
  './UiContracts': require('./helpers/selection-ui.cjs').load('UiContracts'),
  cc: {
    Node,
    Vec3: class {
      constructor(x, y, z) {
        Object.assign(this, { x, y, z });
      }
    },
  },
  '../application/StackDrop': require('../.domain-build/application/StackDrop.js'),
  './ModelFactory': { ModelFactory: Factory },
  './PileModel': { pileModel: () => new Node('Pile') },
};
const { outputText } = ts.transpileModule(
  fs.readFileSync('assets/scripts/presentation/StackDrag.ts', 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  },
);
const loaded = { exports: {} };
new Function('require', 'module', 'exports', outputText)(
  (id) => {
    assert.ok(id in dependencies, id);
    return dependencies[id];
  },
  loaded,
  loaded.exports,
);
const { StackDrag } = loaded.exports;
const baseline = game.createDemoGame(60000);
function fixture(crop = 'vegetable') {
  const state = structuredClone(baseline);
  state.inventory = { ...emptyStock(), vegetable: game.getCapacity(state) };
  const pile = state.groundStacks.find((p) => p.item === crop);
  const shop = state.buildings.find((b) => b.kind === 'shop');
  const dock = state.buildings.find((b) => b.kind === 'dock');
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const session = new GameSession(
    storage,
    () => 60000,
    () => state,
  );
  const town = {
    pickBuilding: (ray) => ray.buildingId ?? null,
    pickStack: (ray) => ray.pile ?? null,
    pickTree: () => null,
    pickNatural: () => null,
    setLiftedStack(id) {
      this.lifted = id;
    },
  };
  const products = { acceptsProductDrop: () => false, highlightProductDrop() {} };
  const ui = {};
  const drag = new StackDrag(new Node('World'), session, ui, town, () => {}, products);
  const id = `pile:${pile.x}:${pile.z}`;
  const ray = (building) => ({
    o: { x: building.x + 0.5, y: 20, z: building.z + 0.5 },
    d: { x: 0, y: -1, z: 0 },
    buildingId: building.id,
  });
  function lift(building) {
    assert.equal(drag.candidate({ ...ray(pile), pile: { id, x: pile.x, z: pile.z } }), id);
    drag.move(id, { x: building.x, y: 0, z: building.z }, ray(building), {});
  }
  return { state, session, storage, drag, town, ui, pile, id, shop, dock, ray, lift };
}
for (const crop of game.CROP_KEYS)
  for (const kind of ['shop', 'dock'])
    test(`${crop} whole-pile ${kind} hover previews; release commits once and persists`, () => {
      const f = fixture(crop),
        target = f[kind];
      const before = game.exportSave(f.session.state);
      f.lift(target);
      assert.equal(game.exportSave(f.session.state), before);
      assert.equal(f.town.lifted, f.id);
      assert.match(f.session.message, kind === 'shop' ? /松手卖10份/ : /松手装货10份/);
      assert.equal(f.drag.ring.values.at(-1), '#EFD377');
      f.drag.drop(f.id, f.ray(target), {});
      assert.equal(f.town.lifted, null);
      assert.equal(f.drag.ring, null);
      assert.equal(f.drag.ghost, null);
      assert.equal(
        f.session.state.groundStacks.some((p) => p.x === f.pile.x && p.z === f.pile.z),
        false,
      );
      assert.deepEqual(f.session.state.inventory, f.state.inventory);
      assert.equal(f.session.state.coins, f.state.coins + (kind === 'shop' ? 50 : 0));
      if (kind === 'dock') {
        assert.equal(
          f.session.state.commerce.dockCargo[target.id][crop],
          f.state.commerce.dockCargo[target.id][crop] + 10,
        );
        assert.deepEqual(f.session.state.commerce.shipments, f.state.commerce.shipments);
      }
      const after = game.exportSave(f.session.state);
      f.drag.drop(f.id, f.ray(target), {});
      assert.equal(game.exportSave(f.session.state), after);
      assert.deepEqual(new GameSession(f.storage, () => 60000).state, f.session.state);
    });
test('cancel and off-map release preserve the whole crop pile and clear lifted visuals', () => {
  for (const cancel of [true, false]) {
    const f = fixture(),
      before = game.exportSave(f.session.state);
    f.lift(f.shop);
    if (cancel) f.drag.clear();
    else f.drag.drop(f.id, null, {});
    f.drag.drop(f.id, f.ray(f.shop), {});
    assert.equal(game.exportSave(f.session.state), before);
    assert.equal(f.town.lifted, null);
    assert.equal(f.drag.ghost, null);
    assert.equal(f.drag.ring, null);
  }
});
test('a release for another pile cannot sell or clear the currently lifted pile', () => {
  const f = fixture(),
    before = game.exportSave(f.session.state);
  f.lift(f.shop);
  f.drag.drop('pile:999:999', f.ray(f.shop), {});
  assert.equal(game.exportSave(f.session.state), before);
  assert.equal(f.town.lifted, f.id);
  f.drag.drop(f.id, f.ray(f.shop), {});
  assert.equal(f.session.state.coins, f.state.coins + 50);
});
test('dock capacity is rechecked at release and a failed drop leaves no ghost or lost crop', () => {
  const f = fixture();
  f.lift(f.dock);
  assert.equal(f.drag.ring.values.at(-1), '#EFD377');
  f.session.state.commerce.dockCargo[f.dock.id].lettuce = 7;
  const before = game.exportSave(f.session.state);
  f.drag.move(f.id, { x: f.dock.x, y: 0, z: f.dock.z }, f.ray(f.dock), {});
  assert.equal(f.drag.ring.values.at(-1), '#D87163');
  assert.match(f.session.message, /船坞货区已满/);
  f.drag.drop(f.id, f.ray(f.dock), {});
  assert.equal(game.exportSave(f.session.state), before);
  assert.match(f.session.message, /船坞货区已满/);
  assert.equal(f.town.lifted, null);
  assert.equal(f.drag.ghost, null);
});

for (const kind of ['shop', 'dock'])
  test(`${kind} release rejects a pile enlarged after lift instead of transferring unseen goods`, () => {
    const f = fixture(),
      target = f[kind];
    f.pile.amount = 9;
    f.lift(target);
    assert.match(f.session.message, /9份/);
    assert.equal(
      f.session.run({
        type: 'dropProduct',
        item: 'vegetable',
        quantity: 1,
        x: f.pile.x,
        z: f.pile.z,
      }),
      true,
    );
    const changed = game.exportSave(f.session.state);
    f.drag.drop(f.id, f.ray(target), {});
    assert.equal(
      game.exportSave(f.session.state),
      changed,
      'New tenth unit is never silently included',
    );
    assert.match(f.session.message, /产品堆已变化.*重新拖动/);
    assert.equal(f.town.lifted, null);
    assert.equal(f.drag.ghost, null);
    assert.equal(f.drag.ring, null);
    f.drag.drop(f.id, f.ray(target), {});
    assert.equal(game.exportSave(f.session.state), changed);
    f.lift(target);
    assert.match(f.session.message, /10份/);
    f.drag.drop(f.id, f.ray(target), {});
    assert.equal(
      f.session.state.groundStacks.some((p) => p.x === f.pile.x && p.z === f.pile.z),
      false,
    );
    assert.deepEqual(new GameSession(f.storage, () => 60000).state, f.session.state);
  });

test('same-count crop replacement after lift is not sold and cancellation allows an explicit new lift', () => {
  const f = fixture();
  f.pile.amount = 9;
  f.state.inventory = { ...emptyStock(), wheat: 9 };
  f.lift(f.shop);
  assert.equal(f.session.run({ type: 'pickupStack', x: f.pile.x, z: f.pile.z }), true);
  assert.equal(
    f.session.run({ type: 'dropProduct', item: 'wheat', quantity: 9, x: f.pile.x, z: f.pile.z }),
    true,
  );
  const changed = game.exportSave(f.session.state);
  f.drag.move(f.id, { x: f.shop.x, y: 0, z: f.shop.z }, f.ray(f.shop), {});
  assert.match(f.session.message, /产品堆已变化.*重新拖动/);
  assert.equal(f.drag.command(f.ray(f.shop), {}), null);
  f.drag.clear();
  f.drag.drop(f.id, f.ray(f.shop), {});
  assert.equal(game.exportSave(f.session.state), changed);
  f.lift(f.shop);
  f.drag.drop(f.id, f.ray(f.shop), {});
  assert.equal(f.session.state.coins, f.state.coins + 45);
  assert.equal(
    f.session.state.groundStacks.some((p) => p.x === f.pile.x && p.z === f.pile.z),
    false,
  );
});

test('a disappeared source cannot leave a valid target or replay an earlier sale', () => {
  const f = fixture();
  f.lift(f.shop);
  assert.equal(
    f.session.run({
      type: 'shopTrade',
      buildingId: f.shop.id,
      item: 'vegetable',
      quantity: 10,
      side: 'sell',
      source: { x: f.pile.x, z: f.pile.z },
    }),
    true,
  );
  const changed = game.exportSave(f.session.state);
  f.drag.move(f.id, { x: f.shop.x, y: 0, z: f.shop.z }, f.ray(f.shop), {});
  assert.match(f.session.message, /产品堆已变化.*重新拖动/);
  assert.equal(f.drag.ring, null);
  f.drag.drop(f.id, f.ray(f.shop), {});
  assert.equal(game.exportSave(f.session.state), changed);
  assert.equal(f.drag.ghost, null);
  assert.equal(f.town.lifted, null);
});

test('once observed source changes cannot rearm the gesture by restoring its old count', () => {
  const f = fixture();
  f.pile.amount = 9;
  f.lift(f.shop);
  assert.equal(
    f.session.run({
      type: 'dropProduct',
      item: 'vegetable',
      quantity: 1,
      x: f.pile.x,
      z: f.pile.z,
    }),
    true,
  );
  f.drag.move(f.id, { x: f.shop.x, y: 0, z: f.shop.z }, f.ray(f.shop), {});
  assert.match(f.session.message, /产品堆已变化.*重新拖动/);
  assert.equal(
    f.session.run({
      type: 'pickupProduct',
      item: 'vegetable',
      quantity: 1,
      x: f.pile.x,
      z: f.pile.z,
    }),
    true,
  );
  const restored = game.exportSave(f.session.state);
  f.drag.move(f.id, { x: f.shop.x, y: 0, z: f.shop.z }, f.ray(f.shop), {});
  assert.equal(f.drag.command(f.ray(f.shop), {}), null);
  f.drag.drop(f.id, f.ray(f.shop), {});
  assert.equal(game.exportSave(f.session.state), restored);
  f.lift(f.shop);
  f.drag.drop(f.id, f.ray(f.shop), {});
  assert.equal(f.session.state.coins, f.state.coins + 45);
});
