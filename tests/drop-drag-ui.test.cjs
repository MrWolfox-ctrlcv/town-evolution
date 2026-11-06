/** Production long-press drag routes, exact snapshots and saved states. CPU only. */
const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { GameSession } = require('../.domain-build/application/GameSession');
const { presentation, SceneNode } = require('./helpers/demo-campaign-scene.cjs');
const { DropDrag } = presentation('DropDrag'),
  { StackDrag } = presentation('StackDrag');
const { createUiState } = presentation('UiContracts');
function ray(x, z, extra = {}) {
  return { o: { x, y: 20, z }, d: { x: 0, y: -1, z: 0 }, ...extra };
}
function fixture(item = 'vegetable') {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.groundStacks = [];
  s.inventory = emptyStock();
  s.nextId = 7;
  const source =
    item === 'vegetable'
      ? { type: 'crop', buildingId: 'b2', cell: 0, jobId: 'j3' }
      : { type: 'natural', resourceId: 'n10_10', kind: item };
  s.looseDrops = [
    { id: 'd5', item, amount: 4, x6: 63, z6: 63, source },
    { id: 'd6', item, amount: item === 'vegetable' ? 8 : 3, x6: 69, z6: 63, source: { ...source } },
  ];
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
  assert.equal(session.mode, 'normal');
  const commands = [],
    events = [];
  session.setCollectionListener((e) => events.push(e));
  const run = session.run.bind(session);
  session.run = (c) => {
    commands.push(c);
    return run(c);
  };
  let liftedDrop = null,
    liftedStack = null;
  const town = {
    pickDrop: (r) => (r.dropId === liftedDrop ? null : (r.dropId ?? null)),
    pickStack: (r) => (r.pile?.id === liftedStack ? null : (r.pile ?? null)),
    pickBuilding: (r) => r.buildingId ?? null,
    pickNatural: (r) => r.natural ?? null,
    pickTree: (r) => r.tree ?? null,
    dropOrigin: (id) => {
      const d = session.state.looseDrops.find((d) => d.id === id);
      return d ? { ...g.dropPosition(d), y: 0.023 } : null;
    },
    setLiftedDrop: (id) => (liftedDrop = id),
    setLiftedStack: (id) => (liftedStack = id),
  };
  const ui = createUiState(),
    products = { acceptsProductDrop: (p) => p.x < 0, highlightProductDrop() {} };
  const drag = new DropDrag(new SceneNode('World'), session, ui, town, () => {}, products),
    stack = new StackDrag(new SceneNode('World'), session, ui, town, () => {}, products);
  function begin() {
    const r = ray(10.5, 10.5, { dropId: 'd5' }),
      key = drag.candidate(r);
    assert.equal(key, 'drop:d5');
    return key;
  }
  return {
    session,
    commands,
    events,
    values,
    ui,
    drag,
    stack,
    begin,
    persist() {
      assert.deepEqual(g.importSave(g.exportSave(session.state), 1000), session.state);
    },
  };
}
for (const target of ['empty', 'stack', 'drop'])
  test(`long-press drop moves directly to ${target}, without touching inventory, and keeps exact partial remainder`, () => {
    const f = fixture();
    if (target === 'stack')
      f.session.state.groundStacks = [{ x: 12, z: 10, item: 'vegetable', amount: 8 }];
    const r =
        target === 'drop'
          ? ray(11.5, 10.5, { dropId: 'd6' })
          : target === 'stack'
            ? ray(12.5, 10.5, { pile: { id: 'pile:12:10', x: 12, z: 10 } })
            : ray(12.5, 12.5),
      key = f.begin(),
      point = { x: r.o.x, y: 0, z: r.o.z };
    const before = g.exportSave(f.session.state),
      stock = { ...f.session.state.inventory };
    f.drag.move(key, point, r, { x: 10, y: 10 });
    assert.equal(g.exportSave(f.session.state), before);
    assert.equal(f.commands.length, 0);
    f.drag.drop(key, r, { x: 10, y: 10 });
    assert.equal(f.commands.length, 1);
    assert.equal(f.commands[0].type, 'moveDrop');
    assert.deepEqual(f.session.state.inventory, stock);
    assert.equal(f.events.length, 0);
    const source = f.session.state.looseDrops.find((d) => d.id === 'd5');
    if (target === 'empty') {
      assert.equal(source, undefined);
      assert.deepEqual(f.session.state.groundStacks[0], {
        x: 12,
        z: 12,
        item: 'vegetable',
        amount: 4,
      });
    } else {
      assert.equal(source.amount, 2);
      assert.deepEqual([source.x6, source.z6], [63, 63]);
      assert.equal(
        target === 'drop'
          ? f.session.state.looseDrops.find((d) => d.id === 'd6').amount
          : f.session.state.groundStacks[0].amount,
        10,
      );
    }
    f.persist();
    const saved = g.exportSave(f.session.state);
    f.drag.drop(key, r, { x: 10, y: 10 });
    assert.equal(f.commands.length, 1);
    assert.equal(g.exportSave(f.session.state), saved);
  });
test('ground stack reverses into an exact loose drop and keeps excess at its source tile', () => {
  const f = fixture();
  f.session.state.groundStacks = [{ x: 12, z: 10, item: 'vegetable', amount: 4 }];
  const key = f.stack.candidate(ray(12.5, 10.5, { pile: { id: 'pile:12:10', x: 12, z: 10 } }));
  assert.equal(key, 'pile:12:10');
  const target = ray(11.5, 10.5, { dropId: 'd6' }),
    before = g.exportSave(f.session.state);
  f.stack.move(key, { x: 11.5, y: 0, z: 10.5 }, target, { x: 10, y: 10 });
  assert.equal(g.exportSave(f.session.state), before);
  f.stack.drop(key, target, { x: 10, y: 10 });
  assert.equal(f.commands[0].type, 'mergeStackIntoDrop');
  assert.equal(f.session.state.groundStacks[0].amount, 2);
  assert.equal(f.session.state.looseDrops.find((d) => d.id === 'd6').amount, 10);
  assert.equal(f.events.length, 0);
  f.persist();
});
for (const mode of [
  'cancel',
  'outside',
  'source-change',
  'target-change',
  'full',
  'different',
  'tree',
  'building',
  'resource',
])
  test(`drop ${mode} cannot lose or duplicate goods`, () => {
    const f = fixture(),
      key = f.begin();
    let r = ray(11.5, 10.5, { dropId: 'd6' });
    if (mode === 'full') f.session.state.looseDrops[1].amount = 10;
    if (mode === 'different') {
      f.session.state.looseDrops[1].item = 'soil';
      f.session.state.looseDrops[1].amount = 3;
      f.session.state.looseDrops[1].source = {
        type: 'natural',
        resourceId: 'n11_10',
        kind: 'soil',
      };
    }
    if (['tree', 'building', 'resource'].includes(mode))
      r = ray(
        13.5,
        13.5,
        mode === 'tree'
          ? { tree: 't1' }
          : mode === 'resource'
            ? { natural: 'n1' }
            : { buildingId: 'b2' },
      );
    f.drag.move(key, { x: r.o.x, y: 0, z: r.o.z }, r, { x: 10, y: 10 });
    if (mode === 'source-change') {
      f.session.state.looseDrops[0].amount = 3;
      f.drag.move(key, { x: r.o.x, y: 0, z: r.o.z }, r, { x: 10, y: 10 });
      f.session.state.looseDrops[0].amount = 4;
    }
    if (mode === 'target-change') f.session.state.looseDrops[1].amount = 7;
    const before = g.exportSave(f.session.state),
      writes = [...f.values];
    if (mode === 'cancel') f.drag.clear();
    else f.drag.drop(key, mode === 'outside' ? null : r, { x: 10, y: 10 });
    assert.equal(g.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], writes);
    assert.equal(f.events.length, 0);
  });
test('explicit sidebar drop remains a pickup action and only this route produces inventory gain', () => {
  const f = fixture(),
    key = f.begin();
  f.drag.move(key, { x: 10.5, y: 0, z: 10.5 }, null, { x: -1, y: 10 });
  f.drag.drop(key, null, { x: -1, y: 10 });
  assert.deepEqual(f.commands, [{ type: 'pickupDrop', dropId: 'd5' }]);
  assert.equal(f.session.state.inventory.vegetable, 4);
  assert.deepEqual(f.events[0].gains, [{ kind: 'vegetable', amount: 4 }]);
  f.persist();
});
