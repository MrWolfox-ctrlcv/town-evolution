const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { entityAssemblyPlan } = require('../.domain-build/domain/entity-assembly');
const { hammerAssembly } = require('../.domain-build/domain/actions/entity-assembly');
const { emptyStock, stockTotal } = require('../.domain-build/domain/commerce');
const { validatePlacement } = require('../.domain-build/domain/geometry');
const { createLocalContainer } = require('../.domain-build/domain/local-container');
const foundation = require('../.domain-build/domain/foundation');

function town(base = 'house', addition = 'crate') {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = { ...emptyStock(), wheat: 2 };
  s.buildings = [
    { id: 'b1', kind: 'warehouse', x: 3, z: 3, rotation: 0 },
    { id: 'b3', kind: base, x: 8, z: 5, rotation: 0 },
    { id: 'b4', kind: addition, x: 12, z: 5, rotation: 0 },
  ];
  if (base === 'farm') s.buildings[1].cropJobs = Array(9).fill(null);
  s.nextId = 5;
  return s;
}
function dockTown() {
  const s = town('woodenPier');
  Object.assign(s.buildings[0], { x: 8, z: 5 });
  Object.assign(s.buildings[1], { x: 2, z: 2 });
  s.buildings.push({ id: 'b5', kind: 'orderBoard', x: 13, z: 5, rotation: 0 });
  s.nextId = 6;
  return s;
}
function sources(s, ids = ['b3', 'b4']) {
  return ids.map((id) => {
    const { kind, x, z, rotation } = s.buildings.find((b) => b.id === id);
    return { id, kind, x, z, rotation };
  });
}
function command(s, ids) {
  return { type: 'hammerAssembly', tool: 'hammer', sources: sources(s, ids) };
}
function reject(s, c, pattern) {
  const before = JSON.stringify(s);
  assert.throws(() => hammerAssembly(s, c), pattern);
  assert.equal(JSON.stringify(s), before, 'rejected action changed its input state');
}

for (const [base, addition, kind, recipeId] of [
  ['house', 'crate', 'warehouse', 'build-warehouse'],
  ['house', 'orderBoard', 'shop', 'build-shop'],
  ['warehouse', 'handcart', 'transportWarehouse', 'build-transport-warehouse'],
  ['farm', 'crate', 'farm', 'attach-farm-box'],
]) {
  test(`hammer assembles ${base} + ${addition} in either direction without inventory or coins`, () => {
    for (const reverse of [false, true]) {
      const s = town(base, addition);
      const c = command(s);
      if (reverse) c.sources.reverse();
      const before = JSON.stringify(s);
      const plan = entityAssemblyPlan(s, c.sources);
      assert.deepEqual(plan, entityAssemblyPlan(s, [...c.sources].reverse()));
      assert.equal(JSON.stringify(s), before);
      assert.equal(plan.retainedId, 'b3');
      assert.deepEqual(plan.consumedIds, ['b4']);
      assert.equal(plan.recipeId, recipeId);
      assert.equal(plan.cost, 0);
      const inventory = { ...s.inventory },
        coins = s.coins,
        nextId = s.nextId;
      hammerAssembly(s, c);
      const result = s.buildings.find((b) => b.id === 'b3');
      assert.equal(result.kind, kind);
      assert.equal(result.x, 8);
      assert.equal(result.z, 5);
      assert.equal(result.rotation, 0);
      assert.equal(
        s.buildings.some((b) => b.id === 'b4'),
        false,
      );
      assert.deepEqual(s.inventory, inventory);
      assert.equal(s.coins, coins);
      assert.equal(s.nextId, nextId);
      if (kind === 'shop') assert.equal(s.commerce.shopStock.b3.vegetable, 8);
      if (kind === 'farm') {
        assert.equal(result.collectionBox.crateId, 'b4');
        assert.equal(stockTotal(result.collectionBox.stock), 0);
        assert.equal(result.collectionBox.capacity, 16);
      }
      assert.deepEqual(g.importSave(g.exportSave(s), 1000), s);
    }
  });
}

test('only selected original attachment owners contribute to the retained building', () => {
  const s = town();
  s.buildings.push({ id: 'b5', kind: 'crate', x: 11, z: 5, rotation: 0 });
  s.nextId = 6;
  s.fusion.attachments.b3 = { ...emptyStock(), wheat: 2 };
  s.fusion.attachments.b4 = { ...emptyStock(), stone: 3 };
  s.fusion.attachments.b5 = { ...emptyStock(), wood: 5 };
  const untouched = JSON.stringify(s.fusion.attachments.b5);
  const inventory = { ...s.inventory };
  hammerAssembly(s, command(s, ['b4', 'b3']));
  assert.equal(s.fusion.attachments.b3.wheat, 2);
  assert.equal(s.fusion.attachments.b3.stone, 3);
  assert.equal(s.fusion.attachments.b3.wood, 0);
  assert.equal(s.fusion.attachments.b4, undefined);
  assert.equal(JSON.stringify(s.fusion.attachments.b5), untouched);
  assert.ok(s.buildings.some((b) => b.id === 'b5'));
  assert.deepEqual(s.inventory, inventory);
});

for (const field of ['id', 'kind', 'x', 'z', 'rotation'])
  test(`stale selected ${field} rejects without consuming any source`, () => {
    const s = town();
    const c = command(s);
    c.sources[1][field] =
      field === 'id' ? 'b99' : field === 'kind' ? 'orderBoard' : c.sources[1][field] + 1;
    reject(s, c, /部件/);
  });

test('missing, duplicate, excess and malformed selections never scan nearby entities or inventory', () => {
  const s = dockTown();
  s.inventory.wood = 5;
  for (const selected of [
    [],
    sources(s, ['b3']),
    sources(s, ['b3', 'b4']),
    sources(s, ['b3', 'b4', 'b4']),
    sources(s, ['b3', 'b4', 'b5', 'b1']),
    [null, ...sources(s, ['b4'])],
    null,
  ])
    reject(s, { type: 'hammerAssembly', tool: 'hammer', sources: selected });
  const removed = command(s, ['b3', 'b4', 'b5']);
  s.buildings = s.buildings.filter((b) => b.id !== 'b5');
  reject(s, removed, /不存在/);
});

test('building-only recipes and the wrong tool do not go through hammer assembly', () => {
  for (const addition of ['stoneMill', 'stoneOven', 'house', 'boat']) {
    const s = town('house', addition);
    reject(s, command(s), /配方/);
  }
  const s = town();
  reject(s, { ...command(s), tool: 'saw' }, /锤子/);
});

test('all selected producers must be idle and combined attachments must fit before deductions', () => {
  for (const id of ['b3', 'b4'])
    for (const field of ['job', 'processingJob', 'cropJobs']) {
      const s = town();
      const b = s.buildings.find((b) => b.id === id);
      b[field] = field === 'cropJobs' ? [{ id: 'j1' }] : { id: 'j1' };
      reject(s, command(s), /生产/);
    }
  const s = town();
  s.fusion.attachments.b3 = { ...emptyStock(), wood: 3 };
  s.fusion.attachments.b4 = { ...emptyStock(), stone: 3 };
  reject(s, command(s), /容量/);
});

test('blocked final placement leaves sources, attachments, coins and tools untouched', () => {
  for (const blocker of ['trees', 'naturalResources', 'groundStacks', 'buildings']) {
    const s = town();
    s.fusion.attachments.b4 = { ...emptyStock(), stone: 1 };
    const p = { x: 8, z: 5 };
    if (blocker === 'trees') s.trees.push({ ...p, id: 't1' });
    if (blocker === 'naturalResources')
      s.naturalResources.push({ ...p, id: 'n1', kind: 'stone', amount: 1 });
    if (blocker === 'groundStacks') s.groundStacks.push({ ...p, item: 'wood', amount: 1 });
    if (blocker === 'buildings')
      s.buildings.push({ ...p, id: 'b5', kind: 'orderBoard', rotation: 0 });
    reject(s, command(s));
  }
});

test('farm box requires its own outside space and never absorbs crate attachments', () => {
  const s = town('farm');
  const plan = entityAssemblyPlan(s, sources(s));
  const base = s.buildings.find((b) => b.id === 'b3');
  const cleared = { ...s, buildings: s.buildings.filter((b) => b.id !== 'b4') };
  let outside;
  for (let x = 0; x < g.worldSize(s.terrainVersion) && !outside; x++)
    for (let z = 0; z < g.worldSize(s.terrainVersion) && !outside; z++) {
      const candidate = { ...cleared, groundStacks: [{ x, z, item: 'wood', amount: 1 }] };
      try {
        validatePlacement(candidate, base);
      } catch {
        continue;
      }
      try {
        validatePlacement(candidate, plan.building);
      } catch {
        outside = { x, z, item: 'wood', amount: 1 };
      }
    }
  assert.ok(outside, 'collection box must reserve an additional external cell');
  s.groundStacks.push(outside);
  reject(s, command(s));
  s.groundStacks = [];
  s.fusion.attachments.b4 = { ...emptyStock(), wheat: 1 };
  reject(s, command(s), /挂载/);
});

test('an existing full farm box and ripe crops remain unchanged when a second crate is selected', () => {
  const s = town('farm');
  const farm = s.buildings[1];
  farm.collectionBox = { crateId: 'b9', ...createLocalContainer() };
  farm.collectionBox.stock.wheat = 16;
  reject(s, command(s), /已有收获箱/);
  farm.cropJobs[0] = { id: 'j1', crop: 'wheat', startedAt: 0, readyAt: 1000 };
  reject(s, command(s), /已有收获箱/);
  assert.equal(farm.collectionBox.stock.wheat, 16);
  assert.ok(farm.cropJobs[0]);
});

test('farm assembly preserves growing and ripe crop jobs; a full box cannot discard the harvest', () => {
  const s = town('farm');
  const farm = s.buildings[1];
  farm.cropJobs[0] = { id: 'j5', crop: 'wheat', startedAt: 0, readyAt: 15000 };
  farm.cropJobs[1] = { id: 'j6', crop: 'vegetable', startedAt: 1000, readyAt: 16000 };
  s.nextId = 7;
  const jobs = JSON.stringify(farm.cropJobs);
  const inventory = { ...s.inventory };
  hammerAssembly(s, command(s));
  const result = s.buildings[1];
  assert.equal(JSON.stringify(result.cropJobs), jobs);
  assert.equal(stockTotal(result.collectionBox.stock), 0);
  result.collectionBox.stock.wheat = result.collectionBox.capacity;
  const before = JSON.stringify(s);
  const harvested = g.dispatch(s, { type: 'harvestCell', buildingId: 'b3', cell: 0 }, 15000);
  assert.equal(harvested.ok, false);
  assert.equal(harvested.state, s);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(s.inventory, inventory);
  assert.equal(s.looseDrops.length, 0);
});

test('dock assembly consumes exactly pier + crate + board in every ordering, with no free boat', () => {
  for (const ids of [
    ['b3', 'b4', 'b5'],
    ['b3', 'b5', 'b4'],
    ['b4', 'b3', 'b5'],
    ['b4', 'b5', 'b3'],
    ['b5', 'b3', 'b4'],
    ['b5', 'b4', 'b3'],
  ]) {
    const s = dockTown();
    s.fusion.attachments.b3 = { ...emptyStock(), wood: 1 };
    s.fusion.attachments.b4 = { ...emptyStock(), wheat: 2 };
    s.fusion.attachments.b5 = { ...emptyStock(), stone: 2 };
    const before = JSON.stringify(s);
    const plan = entityAssemblyPlan(s, sources(s, ids));
    assert.equal(JSON.stringify(s), before);
    assert.equal(plan.retainedId, 'b3');
    assert.deepEqual(plan.consumedIds, ['b4', 'b5']);
    assert.equal(plan.recipeId, 'build-dock');
    hammerAssembly(s, command(s, ids));
    const dock = s.buildings.find((b) => b.id === 'b3');
    assert.equal(dock.kind, 'dock');
    assert.equal(dock.dockStyle, 'simple');
    assert.equal(dock.boatAttached, undefined);
    assert.equal(
      s.buildings.some((b) => b.kind === 'boat'),
      false,
    );
    assert.ok(g.hasDockExit(s, dock));
    assert.deepEqual(s.commerce.dockCargo.b3, emptyStock());
    assert.deepEqual(s.commerce.shipments, {});
    assert.equal(stockTotal(s.fusion.attachments.b3), 5);
    assert.equal(s.fusion.attachments.b4, undefined);
    assert.equal(s.fusion.attachments.b5, undefined);
    assert.deepEqual(g.importSave(g.exportSave(s), 1000), s);
  }
});

test('dock coast, third-source production and aggregate-capacity failures are atomic', () => {
  const inland = dockTown();
  Object.assign(inland.buildings[1], { x: 5, z: 8 });
  reject(inland, command(inland, ['b3', 'b4', 'b5']), /海岸/);
  const shallow = dockTown();
  Object.assign(shallow.buildings[1], { x: 4, z: 1, rotation: 2 });
  reject(shallow, command(shallow, ['b3', 'b4', 'b5']), /海岸/);
  const busy = dockTown();
  busy.buildings[3].job = { id: 'j1' };
  reject(busy, command(busy, ['b3', 'b4', 'b5']), /生产/);
  const full = dockTown();
  for (const id of ['b3', 'b4', 'b5']) full.fusion.attachments[id] = { ...emptyStock(), wood: 2 };
  reject(full, command(full, ['b3', 'b4', 'b5']), /容量/);
});

test('hammer durability is used once after preflight, never on rejected selection', () => {
  const original = foundation.useDurability;
  const calls = [];
  foundation.useDurability = (s, tool) => {
    calls.push(tool);
    original(s, tool);
  };
  try {
    const s = town();
    reject(s, command(s, ['b3', 'b3']));
    assert.deepEqual(calls, []);
    hammerAssembly(s, command(s));
    assert.deepEqual(calls, ['hammer']);
  } finally {
    foundation.useDurability = original;
  }
});

test('dispatch publishes a new state and records only successful assembly discoveries', () => {
  const s = town();
  const c = command(s);
  const before = JSON.stringify(s);
  const result = g.dispatch(s, c, 1000);
  assert.equal(result.ok, true, result.error);
  assert.notEqual(result.state, s);
  assert.equal(JSON.stringify(s), before);
  assert.equal(result.state.fusion.discoveries['build-warehouse'].count, 1);
  const retry = g.dispatch(result.state, c, 1000);
  assert.equal(retry.ok, false);
  assert.equal(retry.state, result.state);
  assert.equal(retry.state.fusion.discoveries['build-warehouse'].count, 1);
});
