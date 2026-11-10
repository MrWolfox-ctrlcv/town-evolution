/** Real starter resources and command routes, with CPU doubles for picking; no WebGL claim. */
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { FarmSweep } = require('../.domain-build/application/FarmSweep');
const { GameSession } = require('../.domain-build/application/GameSession');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
const { presentation, SceneNode } = require('./helpers/demo-campaign-scene.cjs');
const { ToolUseDrag } = presentation('ToolUseDrag');
const { commerceActions } = presentation('CommercePanel');

test('fresh v6 starter grows, gathers, crafts a shop, sells and replants without gifted resources', () => {
  const prep = new V6WorldPreparation(42173);
  for (let i = 0; i < 200 && prep.progress.status === 'building'; i++) prep.step(50000);
  assert.equal(prep.progress.status, 'ready');
  prep.takeResult();
  let now = 1000;
  const storage = new Map();
  const session = new GameSession(
    {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    () => now,
    () => g.createGame(now, 42173, 6),
  );
  const run = (command) => {
    assert.ok(command);
    assert.equal(session.run(command), true, session.message);
  };
  const roundtrip = () => {
    const saved = g.exportSave(session.state);
    assert.equal(session.hasUnsavedChanges, false);
    assert.equal(storage.get(SAVE_KEY), saved);
    assert.equal(g.exportSave(g.importSave(saved, now)), saved);
  };
  assert.equal(session.state.coins, 120);
  assert.equal(session.state.inventory.vegetable, 1);
  assert.equal(session.state.inventory.wood, 0);
  assert.equal(session.state.inventory.treeSeed, 0);
  assert.equal(session.save(), true);
  roundtrip();
  const sweep = new FarmSweep();
  const crop = (kind) => {
    sweep.begin(kind);
    run(sweep.command(session.state, 'b2', 0));
    assert.equal(sweep.command(session.state, 'b2', 0), null);
    sweep.cancel();
  };
  crop('plant');
  now = session.state.buildings.find((b) => b.id === 'b2').cropJobs[0].readyAt;
  crop('harvest');
  assert.equal(session.state.inventory.vegetable, 0);
  assert.equal(
    session.state.looseDrops.reduce((sum, d) => sum + d.amount, 0),
    2,
  );
  for (const drop of [...session.state.looseDrops]) run({ type: 'pickupDrop', dropId: drop.id });
  assert.equal(session.state.inventory.vegetable, 2);
  roundtrip();

  const map = {
    cancelGesture() {},
    contains: () => true,
    screenRay: (p) => p,
    ground: (p) => ({ x: p.x ?? 0, z: p.z ?? 0 }),
  };
  const town = {
    pickBuilding: (p) => p.id ?? null,
    pickTree: (p) => p.tree ?? null,
    pickNatural: () => null,
    pickDrop: () => null,
    pickStack: (p) => p.pile ?? null,
  };
  const tool = new ToolUseDrag(new SceneNode('World'), session, map, town, () => {});
  const use = (kind, point) => {
    tool.begin(kind, 1);
    tool.end(1, point);
  };
  const nearest = [...session.state.trees]
    .sort((a, b) => (a.x - 5) ** 2 + (a.z - 5) ** 2 - ((b.x - 5) ** 2 + (b.z - 5) ** 2))
    .slice(0, 3);
  assert.equal(nearest.length, 3);
  for (const tree of nearest) use('axe', { tree: tree.id });
  assert.equal(session.state.inventory.wood, 6);
  assert.equal(session.state.inventory.treeSeed, 6);
  roundtrip();

  // Fixed nearby cells from the real seed; individual drops match tray gestures.
  const craft = (amount, x, z, kind) => {
    for (let i = 0; i < amount; i++) run({ type: 'dropProduct', item: 'wood', x, z });
    use('hammer', { pile: { x, z } });
    const result = session.state.buildings.find((b) => b.kind === kind && b.x === x && b.z === z);
    assert.ok(result, session.message);
    return result;
  };
  const house = craft(4, 2, 5, 'house');
  const board = craft(1, 5, 1, 'orderBoard');
  roundtrip();
  tool.begin('hammer', 2);
  tool.move(2, { id: house.id });
  tool.move(2, { id: board.id });
  assert.equal(session.state.buildings.find((b) => b.id === house.id).kind, 'house');
  tool.end(2, { id: board.id });
  assert.equal(session.state.buildings.find((b) => b.id === house.id).kind, 'shop');
  roundtrip();

  const actions = commerceActions(
    session,
    { selected: house.id, tradeItem: 'vegetable', quantity: 1 },
    { command: run, item() {}, quantity() {} },
  );
  const sell = actions.find((action) => action.text.startsWith('卖1'));
  assert.equal(sell.enabled, true);
  sell.run();
  assert.equal(session.state.coins, 125);
  assert.equal(session.state.inventory.vegetable, 1);
  crop('plant');
  assert.equal(session.state.inventory.vegetable, 0);
  assert.equal(session.state.inventory.wood, 1);
  assert.equal(session.state.inventory.treeSeed, 6);
  assert.equal(session.state.looseDrops.length, 0);
  assert.deepEqual(session.state.buildings.map((b) => b.kind).sort(), [
    'farm',
    'shop',
    'warehouse',
  ]);
  roundtrip();
  tool.dispose();
});
