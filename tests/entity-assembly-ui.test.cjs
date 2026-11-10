/** Actual hammer gesture + session dispatch with canonical CPU scene models, no GPU/device claim. */
const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { GameSession } = require('../.domain-build/application/GameSession');
const { stackDropCommand } = require('../.domain-build/application/StackDrop');
const { presentation, SceneNode } = require('./helpers/demo-campaign-scene.cjs');
const { ToolUseDrag } = presentation('ToolUseDrag');
function fixture(base = 'house', addition = 'crate') {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = { ...emptyStock(), wheat: 2 };
  s.buildings = [
    { id: 'b1', kind: 'warehouse', x: 3, z: 3, rotation: 0 },
    { id: 'b3', kind: base, x: 8, z: 5, rotation: 0 },
    { id: 'b4', kind: addition, x: 12, z: 5, rotation: 0 },
  ];
  s.nextId = 5;
  if (base === 'farm') s.buildings[1].cropJobs = Array(9).fill(null);
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    };
  const session = new GameSession(
    storage,
    () => 1000,
    () => g.importSave(g.exportSave(s), 1000),
  );
  const commands = [],
    events = [];
  session.setCollectionListener((e) => events.push(e));
  const run = session.run.bind(session);
  session.run = (c) => {
    commands.push(c);
    return run(c);
  };
  const map = {
    cancelGesture() {},
    contains: (p) => !p.outside,
    screenRay: (p) => p,
    ground: (p) => ({ x: p.x ?? 18, z: p.z ?? 18 }),
  };
  const town = {
    pickBuilding: (p) => p.id ?? null,
    pickTree: (p) => p.tree ?? null,
    pickNatural: (p) => p.natural ?? null,
    pickDrop: (p) => p.drop ?? null,
    pickStack: (p) => p.pile ?? null,
  };
  const tool = new ToolUseDrag(new SceneNode('World'), session, map, town, () => {});
  return { s, session, values, commands, events, tool };
}
for (const [base, addition, result] of [
  ['house', 'crate', 'warehouse'],
  ['house', 'orderBoard', 'shop'],
  ['warehouse', 'handcart', 'transportWarehouse'],
  ['farm', 'crate', 'farm'],
])
  test(`${base} + ${addition} commits only after explicitly passing both entities with hammer`, () => {
    for (const reverse of [false, true]) {
      const f = fixture(base, addition),
        ids = reverse ? ['b4', 'b3'] : ['b3', 'b4'],
        before = g.exportSave(f.session.state),
        stock = { ...f.session.state.inventory };
      f.tool.begin('hammer', 9);
      f.tool.move(9, { id: ids[0] });
      f.tool.move(9, { id: ids[1] });
      assert.equal(g.exportSave(f.session.state), before);
      assert.equal(f.commands.length, 0);
      assert.equal(f.session.message, '');
      assert.ok(f.tool.marker.children.some((n) => n.name === 'EntityAssemblyResult'));
      f.tool.end(9, { id: ids[1] });
      assert.equal(f.commands.length, 1);
      assert.equal(f.commands[0].type, 'hammerAssembly');
      assert.deepEqual(
        f.commands[0].sources.map((s) => s.id),
        ids,
      );
      assert.equal(f.session.state.buildings.find((b) => b.id === 'b3').kind, result);
      assert.ok(!f.session.state.buildings.some((b) => b.id === 'b4'));
      assert.deepEqual(f.session.state.inventory, stock);
      assert.equal(f.events.length, 0);
      assert.deepEqual(g.importSave(g.exportSave(f.session.state), 1000), f.session.state);
      f.tool.end(9, { id: ids[1] });
      assert.equal(f.commands.length, 1);
    }
  });
test('third entities never replace a valid pair, cancellation and stale snapshots do not assemble', () => {
  for (const mode of ['third', 'outside', 'cancel', 'stale', 'drop']) {
    const f = fixture();
    f.tool.begin('hammer', 3);
    f.tool.move(3, { id: 'b3' });
    f.tool.move(3, { id: 'b4' });
    if (mode === 'stale') {
      f.session.state.buildings.find((b) => b.id === 'b3').x++;
      f.tool.move(3, { id: 'b4' });
      f.session.state.buildings.find((b) => b.id === 'b3').x--;
    }
    const before = g.exportSave(f.session.state);
    if (mode === 'cancel') f.tool.cancel();
    else
      f.tool.end(
        3,
        mode === 'outside'
          ? { outside: true }
          : mode === 'third'
            ? { id: 'b1' }
            : mode === 'drop'
              ? { drop: 'd1' }
              : { id: 'b4' },
      );
    assert.equal(f.commands.length, 0, mode);
    assert.equal(g.exportSave(f.session.state), before, mode);
  }
});
test('dock hammer collects exactly three selected entities without a two-part fallback', () => {
  const f = fixture('woodenPier');
  Object.assign(f.session.state.buildings[0], { x: 8, z: 5 });
  Object.assign(f.session.state.buildings[1], { x: 2, z: 2 });
  f.session.state.buildings.push({ id: 'b5', kind: 'orderBoard', x: 13, z: 5, rotation: 0 });
  f.session.state.nextId = 6;
  const before = g.exportSave(f.session.state);
  f.tool.begin('hammer', 5);
  f.tool.move(5, { id: 'b3' });
  f.tool.move(5, { id: 'b4' });
  assert.equal(g.exportSave(f.session.state), before);
  assert.ok(!f.tool.marker.children.some((n) => n.name === 'EntityAssemblyResult'));
  f.tool.move(5, { id: 'b5' });
  assert.equal(f.session.message, '');
  assert.ok(f.tool.marker.children.some((n) => n.name === 'EntityAssemblyResult'));
  f.tool.end(5, { id: 'b5' });
  assert.equal(f.session.state.buildings.find((b) => b.id === 'b3').kind, 'dock');
  assert.equal(f.session.state.buildings.find((b) => b.id === 'b3').dockStyle, 'simple');
  assert.equal(f.commands[0].sources.length, 3);
});
test('ground mud attaches one explicit snapshotted unit, then single-building hammer performs upgrade', () => {
  for (const [base, result] of [
    ['house', 'residence'],
    ['crate', 'nursery'],
  ]) {
    const f = fixture(base, 'orderBoard');
    const pile = { x: 15, z: 5, item: 'mud', amount: 3 };
    f.session.state.groundStacks = [pile];
    const target = f.session.state.buildings.find((b) => b.id === 'b3');
    const c = stackDropCommand(pile, { kind: 'building', building: target }, f.session.state);
    assert.deepEqual(c, {
      type: 'attachMaterial',
      buildingId: 'b3',
      item: 'mud',
      quantity: 1,
      source: pile,
    });
    assert.equal(f.session.run(c), true, f.session.message);
    assert.equal(f.session.state.buildings.find((b) => b.id === 'b3').kind, base);
    assert.equal(f.session.state.groundStacks[0].amount, 2);
    f.tool.begin('hammer', 6);
    f.tool.end(6, { id: 'b3' });
    assert.equal(
      f.session.state.buildings.find((b) => b.id === 'b3').kind,
      result,
      f.session.message,
    );
    assert.equal(f.events.length, 0);
  }
});

test('hammer crossing an unrelated building still upgrades the attached-material release target', () => {
  const f = fixture('warehouse', 'expandedWarehouse');
  f.session.state.fusion.attachments.b3 = { ...emptyStock(), wood: 3 };
  const before = g.exportSave(f.session.state);
  f.tool.begin('hammer', 5);
  f.tool.move(5, { id: 'b4' });
  f.tool.move(5, { id: 'b3' });
  assert.equal(g.exportSave(f.session.state), before, 'hover must not consume or upgrade');
  f.tool.end(5, { id: 'b3' });
  assert.deepEqual(f.commands, [{ type: 'useTool', tool: 'hammer', buildingId: 'b3' }]);
  assert.equal(f.session.state.buildings.find((b) => b.id === 'b3').kind, 'expandedWarehouse');
  assert.equal(f.session.state.buildings.find((b) => b.id === 'b4').kind, 'expandedWarehouse');
  assert.equal(f.session.state.fusion.attachments.b3.wood, 1);
});
