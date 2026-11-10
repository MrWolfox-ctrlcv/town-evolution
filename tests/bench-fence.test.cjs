const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { GameSession } = require('../.domain-build/application/GameSession');
const { SAVE_KEY, BACKUP_KEY } = require('../.domain-build/domain/storage');
function town(amount = 1) {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = emptyStock();
  s.groundStacks = [{ x: 9, z: 5, item: 'wood', amount }];
  return s;
}
const command = { type: 'useTool', tool: 'saw', x: 9, z: 5 };
function commit(s, c = command) {
  const r = g.dispatch(s, c, 1000);
  assert.equal(r.ok, true, r.error);
  return r.state;
}
function rejected(s, c = command) {
  const before = JSON.stringify(s);
  const r = g.dispatch(s, c, 1000);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
}
function storage(s) {
  const values = new Map([[SAVE_KEY, g.exportSave(s)]]);
  let fail = false;
  const adapter = {
    getItem: (k) => values.get(k) ?? null,
    setItem(k, v) {
      if (fail) throw new Error('test quota');
      values.set(k, v);
    },
    removeItem: (k) => values.delete(k),
  };
  return {
    values,
    adapter,
    fail: (value) => {
      fail = value;
    },
  };
}
for (const [amount, kind] of [
  [1, 'fence'],
  [2, 'bench'],
]) {
  test(`${kind}: exact recipe, immutable preview, infinite tool, one discovery and durable rotation/move`, () => {
    const s = town(amount),
      before = JSON.stringify(s);
    const plan = g.toolCraftPlan(s, 'saw', 9, 5);
    assert.equal(plan.reason, null);
    assert.equal(plan.building.kind, kind);
    assert.deepEqual([plan.width, plan.depth], [1, 1]);
    assert.equal(JSON.stringify(s), before);
    let result = commit(s);
    assert.deepEqual(result.buildings.at(-1), plan.building);
    assert.deepEqual(result.inventory, s.inventory);
    assert.deepEqual(result.tools, s.tools);
    assert.equal(result.coins, s.coins);
    assert.equal(result.groundStacks.length, 0);
    assert.deepEqual(Object.keys(result.fusion.discoveries), [`build-${kind}`]);
    assert.equal(result.fusion.discoveries[`build-${kind}`].count, 1);
    rejected(result);
    const id = result.buildings.at(-1).id;
    result = commit(result, { type: 'rotateBuilding', buildingId: id });
    result = commit(result, { type: 'moveBuilding', buildingId: id, x: 10, z: 5 });
    assert.equal(result.buildings.at(-1).rotation, 1);
    assert.deepEqual(g.importSave(g.exportSave(result), 1000), result);
    const bytes = JSON.parse(g.exportSave(result));
    assert.equal(
      bytes.schemaVersion,
      11,
      'New content must reject safely at old client version gate',
    );
    assert.equal(result.schemaVersion, 10, 'Internal state contract is unchanged');
    assert.equal(g.RECIPE_DEFINITIONS.find((r) => r.id === `build-${kind}`).tool, 'saw');
  });
  test(`${kind}: each occupied or wet cell rejects without consuming the selected pile`, () => {
    for (const obstacle of ['tree', 'building', 'natural', 'drop', 'farm', 'paddy']) {
      const s = town(amount);
      if (obstacle === 'tree') s.trees.push({ id: 't99', x: 9, z: 5 });
      if (obstacle === 'natural')
        s.naturalResources.push({ id: 'stone-9-5', x: 9, z: 5, kind: 'stone', amount: 2 });
      if (obstacle === 'drop')
        s.looseDrops.push({
          id: 'd99',
          x6: 57,
          z6: 33,
          item: 'wood',
          amount: 1,
          source: { type: 'natural', resourceId: 'stone-9-5', kind: 'stone' },
        });
      if (['building', 'farm', 'paddy'].includes(obstacle))
        s.buildings.push({
          id: 'b99',
          kind: obstacle === 'building' ? 'crate' : 'farm',
          x: 9,
          z: 5,
          rotation: 0,
          ...(obstacle === 'paddy' ? { irrigated: true } : {}),
        });
      rejected(s);
    }
    const s = town(amount);
    s.groundStacks[0].x = 0;
    s.groundStacks[0].z = 0;
    rejected(s, { ...command, x: 0, z: 0 });
    for (const x of [-1, 1.5, NaN, Infinity, 100000]) rejected(town(amount), { ...command, x });
  });
  test(`${kind}: save failure retains one in-memory craft and retries without duplicate consumption`, () => {
    const f = storage(town(amount)),
      session = new GameSession(f.adapter, () => 1000);
    const bytes = [...f.values];
    f.fail(true);
    assert.equal(session.run(command), true);
    assert.equal(session.state.buildings.at(-1).kind, kind);
    assert.equal(session.hasUnsavedChanges, true);
    assert.deepEqual([...f.values], bytes);
    assert.equal(session.run(command), false);
    f.fail(false);
    assert.equal(session.save(), true);
    const loaded = new GameSession(f.adapter, () => 1000);
    assert.deepEqual(loaded.state, session.state);
    assert.equal(loaded.state.fusion.discoveries[`build-${kind}`].count, 1);
  });
  test(`${kind}: stale session cannot replace another saved town or consume its own pile`, () => {
    const f = storage(town(amount)),
      session = new GameSession(f.adapter, () => 1000);
    const external = town(amount);
    external.coins++;
    f.values.set(SAVE_KEY, g.exportSave(external));
    const before = JSON.stringify(session.state),
      bytes = [...f.values];
    assert.equal(session.run(command), false);
    assert.equal(session.hasSaveConflict, true);
    assert.equal(JSON.stringify(session.state), before);
    assert.deepEqual([...f.values], bytes);
  });
}
test('new discovery without a remaining entity still raises wire version; old content stays byte-compatible', () => {
  const old = town();
  assert.equal(JSON.parse(g.exportSave(old)).schemaVersion, 10);
  assert.deepEqual(g.importSave(g.exportSave(old), 1000), old);
  for (const kind of ['fence', 'bench']) {
    const discovered = town();
    discovered.fusion.discoveries[`build-${kind}`] = { count: 1, firstDiscoveredAt: 1000 };
    assert.equal(JSON.parse(g.exportSave(discovered)).schemaVersion, 11);
    assert.deepEqual(g.importSave(g.exportSave(discovered), 1000), discovered);
    const entityOnly = town();
    entityOnly.groundStacks = [];
    entityOnly.buildings.push({ id: `b${entityOnly.nextId++}`, kind, x: 9, z: 5, rotation: 0 });
    assert.equal(JSON.parse(g.exportSave(entityOnly)).schemaVersion, 11);
    assert.deepEqual(g.importSave(g.exportSave(entityOnly), 1000), entityOnly);
  }
});
test('invalid saw counts, materials, missing resources and unavailable tools reject atomically', () => {
  for (const amount of [0, -1, 0.5, 1.5, 2.5, 5, 6, NaN, Infinity]) rejected(town(amount));
  for (const item of ['stone', 'soil', 'mud', 'vegetable']) {
    const s = town(1);
    s.groundStacks[0].item = item;
    rejected(s);
  }
  const empty = town();
  empty.groundStacks = [];
  rejected(empty);
  rejected(town(2), { ...command, tool: 'fertilizer' });
  rejected(town(2), { ...command, tool: 'unknown' });
});
