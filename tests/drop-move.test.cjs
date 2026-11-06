const test = require('node:test'),
  assert = require('node:assert/strict'),
  g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
function town() {
  let s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = { ...emptyStock(), vegetable: 1 };
  s = g.dispatch(s, { type: 'plantCell', buildingId: 'b2', cell: 4 }, 1000).state;
  s = g.dispatch(s, { type: 'harvestCell', buildingId: 'b2', cell: 4 }, 16000).state;
  return s;
}
const snapshot = (d) => ({ id: d.id, item: d.item, amount: d.amount, x6: d.x6, z6: d.z6 });
function total(s, item) {
  return (
    s.inventory[item] +
    s.looseDrops.filter((d) => d.item === item).reduce((n, d) => n + d.amount, 0) +
    s.groundStacks.filter((p) => p.item === item).reduce((n, p) => n + p.amount, 0)
  );
}
function accept(s, c) {
  const text = JSON.stringify(s),
    totals = Object.fromEntries(g.ITEM_KEYS.map((i) => [i, total(s, i)])),
    r = g.dispatch(s, c, s.lastSeenAt);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), text);
  assert.deepEqual(r.state.inventory, s.inventory);
  assert.deepEqual(Object.fromEntries(g.ITEM_KEYS.map((i) => [i, total(r.state, i)])), totals);
  assert.deepEqual(g.importSave(g.exportSave(r.state), r.state.lastSeenAt), r.state);
  return r.state;
}
function reject(s, c) {
  const text = JSON.stringify(s),
    r = g.dispatch(s, c, s.lastSeenAt);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), text);
}
function ground(s, x = 9, z = 5) {
  return { type: 'moveDrop', source: snapshot(s.looseDrops[0]), target: { type: 'ground', x, z } };
}
test('drop moves straight to an empty ground pile without inventory, ID or discovery side effects', () => {
  const s = town(),
    c = ground(s),
    text = JSON.stringify(s),
    plan = g.dropMovePlan(s, c);
  assert.deepEqual(plan, { transferAmount: 2, remaining: 0, reason: null });
  assert.equal(JSON.stringify(s), text);
  const next = accept(s, c);
  assert.equal(next.looseDrops.length, 0);
  assert.deepEqual(next.groundStacks, [{ x: 9, z: 5, item: 'vegetable', amount: 2 }]);
  assert.equal(next.nextId, s.nextId);
  assert.deepEqual(next.fusion.discoveries, s.fusion.discoveries);
  reject(next, c);
});
test('partial merge into a ground stack retains exact source identity, history and precise position', () => {
  const s = town();
  s.looseDrops[0].amount = 4;
  s.groundStacks = [{ x: 9, z: 5, item: 'vegetable', amount: 8 }];
  const source = structuredClone(s.looseDrops[0]),
    c = ground(s);
  c.target.stack = { ...s.groundStacks[0] };
  const next = accept(s, c);
  assert.equal(next.groundStacks[0].amount, 10);
  assert.deepEqual(next.looseDrops[0], { ...source, amount: 2 });
  reject(next, {
    ...c,
    source: snapshot(next.looseDrops[0]),
    target: { ...c.target, stack: { ...next.groundStacks[0] } },
  });
});
test('two precise drops merge at the target point, with excess left at the unchanged source point', () => {
  let s = town();
  s.looseDrops[0].amount = 4;
  const a = s.looseDrops[0];
  s.looseDrops.push({
    ...a,
    id: `d${s.nextId++}`,
    x6: a.x6 + 2,
    amount: 8,
    source: { ...a.source },
  });
  const source = snapshot(a),
    target = snapshot(s.looseDrops[1]),
    targetHistory = structuredClone(s.looseDrops[1].source);
  s = accept(s, { type: 'moveDrop', source, target: { type: 'drop', drop: target } });
  assert.equal(s.looseDrops[1].amount, 10);
  assert.equal(s.looseDrops[0].amount, 2);
  assert.deepEqual(snapshot(s.looseDrops[0]), { ...source, amount: 2 });
  assert.deepEqual(s.looseDrops[1].source, targetHistory);
  assert.equal(s.looseDrops[1].x6, target.x6);
});
test('normal ground pile can merge back into a precise drop, preserving overflow on the ground', () => {
  let s = town();
  s.looseDrops[0].amount = 8;
  s.groundStacks = [{ x: 9, z: 5, item: 'vegetable', amount: 5 }];
  const command = {
    type: 'mergeStackIntoDrop',
    source: { ...s.groundStacks[0] },
    target: snapshot(s.looseDrops[0]),
  };
  assert.deepEqual(g.stackIntoDropPlan(s, command), {
    transferAmount: 2,
    remaining: 3,
    reason: null,
  });
  s = accept(s, command);
  assert.equal(s.looseDrops[0].amount, 10);
  assert.equal(s.groundStacks[0].amount, 3);
  reject(s, command);
});
test('stale source and destination snapshots, wrong materials, same ID and invalid targets reject atomically', () => {
  for (const edit of [
    (c) => c.source.amount++,
    (c) => c.source.x6++,
    (c) => (c.source.item = 'wheat'),
    (c) => (c.source.id = 'd999'),
    (c) => (c.target.x = Infinity),
    (c) => (c.target.type = 'inventory'),
  ]) {
    const s = town(),
      c = ground(s);
    edit(c);
    reject(s, c);
  }
  let s = town();
  const c = ground(s);
  s.groundStacks = [{ x: 9, z: 5, item: 'vegetable', amount: 1 }];
  reject(s, c);
  reject(s, { ...c, target: { ...c.target, stack: { ...s.groundStacks[0], amount: 2 } } });
  s.groundStacks[0].item = 'wheat';
  reject(s, { ...c, target: { ...c.target, stack: { ...s.groundStacks[0] } } });
  reject(s, {
    type: 'moveDrop',
    source: snapshot(s.looseDrops[0]),
    target: { type: 'drop', drop: snapshot(s.looseDrops[0]) },
  });
});
test('moving out of a field is allowed, but occupied fields, trees, water and other drops remain blocked', () => {
  for (const setup of [
    (s) => {
      s.trees.push({ id: `t${s.nextTreeId++}`, x: 9, z: 5 });
    },
    (s) => {
      s.buildings.push({ id: `b${s.nextId++}`, kind: 'crate', x: 9, z: 5, rotation: 0 });
    },
    (s) => {
      const d = s.looseDrops[0];
      s.looseDrops.push({ ...d, id: `d${s.nextId++}`, x6: 9 * 6 + 3, z6: 5 * 6 + 3 });
    },
  ]) {
    const s = town();
    setup(s);
    reject(s, ground(s));
  }
  const s = town();
  reject(s, ground(s, 6, 3));
  reject(s, ground(s, 0, 0));
});
test('cleared ordinary land can convert its own drop into a regular stack without moving through inventory', () => {
  let s = town();
  s = g.dispatch(s, { type: 'moveBuilding', buildingId: 'b2', x: 10, z: 7 }, s.lastSeenAt).state;
  const drop = s.looseDrops[0],
    x = Math.floor(drop.x6 / 6),
    z = Math.floor(drop.z6 / 6);
  s = accept(s, ground(s, x, z));
  assert.equal(s.looseDrops.length, 0);
  assert.equal(s.groundStacks[0].x, x);
  assert.equal(s.groundStacks[0].z, z);
});
test('full town inventory never blocks any legal ground-to-ground move', () => {
  let s = town();
  s.inventory.wood = g.getCapacity(s);
  s = accept(s, ground(s));
  assert.equal(s.groundStacks[0].amount, 2);
  assert.equal(g.getUsedStorage(s), g.getCapacity(s));
});
test('excavated soil can become mud entirely on the ground while the town warehouse stays full', () => {
  let s = g.createGame(1000, 1, 3);
  s.trees = [];
  const mound = s.naturalResources.find((p) => p.kind === 'soil');
  s.naturalResources = [mound];
  s.inventory = emptyStock();
  s.inventory.wood = g.getCapacity(s);
  let r = g.dispatch(s, { type: 'gatherNatural', resourceId: mound.id }, 1000);
  assert.equal(r.ok, true, r.error);
  s = r.state;
  const inventory = { ...s.inventory };
  while (s.looseDrops.length) {
    const source = snapshot(s.looseDrops[0]);
    let command;
    search: for (let z = 1; z < g.worldSize(s.terrainVersion) - 1; z++)
      for (let x = 1; x < g.worldSize(s.terrainVersion) - 1; x++) {
        const c = { type: 'moveDrop', source, target: { type: 'ground', x, z } };
        if (!g.dropMovePlan(s, c).reason) {
          command = c;
          break search;
        }
      }
    assert.ok(command);
    s = accept(s, command);
  }
  assert.deepEqual(
    s.groundStacks.map((p) => p.amount),
    [5, 4],
  );
  const [a, b] = s.groundStacks;
  r = g.dispatch(
    s,
    {
      type: 'useTool',
      tool: 'wateringCan',
      x: a.x,
      z: a.z,
      sources: [
        { x: a.x, z: a.z },
        { x: b.x, z: b.z },
      ],
    },
    1000,
  );
  assert.equal(r.ok, true, r.error);
  s = r.state;
  assert.deepEqual(s.inventory, inventory);
  assert.deepEqual(s.groundStacks, [{ x: a.x, z: a.z, item: 'mud', amount: 1 }]);
  assert.deepEqual(g.importSave(g.exportSave(s), 1000), s);
});
