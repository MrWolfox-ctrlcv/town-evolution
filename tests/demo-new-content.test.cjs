const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const {
  townSession,
  profileStorage,
  DEMO_REVISION_KEY,
} = require('../.domain-build/application/TownProfiles');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
const NOW = 100000;
function run(s, c) {
  const text = g.exportSave(s),
    r = g.dispatch(s, c, NOW);
  assert.equal(r.ok, true, r.error);
  assert.equal(g.exportSave(s), text);
  assert.deepEqual(g.importSave(g.exportSave(r.state), NOW), r.state);
  return r.state;
}
const snapshot = ({ id, item, amount, x6, z6 }) => ({ id, item, amount, x6, z6 });
test('new demo has a separate outside-box field and two usable same-crop drops with real saved identities', () => {
  const s = g.createDemoGame(NOW),
    box = s.buildings.filter((b) => b.collectionBox);
  assert.equal(box.length, 1);
  const farm = box[0];
  assert.equal(farm.kind, 'farm');
  assert.notEqual(farm.id, 'b2');
  assert.equal(farm.collectionBox.capacity, 16);
  assert.equal(farm.collectionBox.stock.vegetable, 2);
  assert.equal(farm.collectionBox.stock.wheat, 2);
  assert.equal(g.buildingOccupiedCells(farm).length, 5);
  assert.equal(farm.cropJobs.filter(Boolean).length, 3);
  const drops = s.looseDrops.filter(
    (d) => d.source.type === 'crop' && d.source.buildingId === farm.id,
  );
  assert.equal(drops.length, 2);
  assert.deepEqual(
    drops.map((d) => [d.item, d.amount]),
    [
      ['vegetable', 2],
      ['vegetable', 2],
    ],
  );
  for (const d of drops) {
    assert.equal(farm.cropJobs[d.source.cell], null);
    assert.deepEqual({ x6: d.x6, z6: d.z6 }, g.cropDropAnchor(farm, d.source.cell));
    assert.notEqual(d.source.jobId, farm.cropJobs[0].id);
  }
  assert.equal(new Set(drops.map((d) => d.id)).size, 2);
  assert.deepEqual(g.importSave(g.exportSave(s), NOW), s);
});
test('showcase preserves starter practice fields, legacy dock, wood recipes and warehouse capacity', () => {
  const s = g.createDemoGame(NOW),
    farm = s.buildings.find((b) => b.id === 'b2'),
    warehouse = s.buildings.find((b) => b.id === 'b7');
  assert.equal(
    s.buildings.filter((b) => !b.collectionBox && b.kind !== 'compostBarrel').length,
    30,
  );
  assert.deepEqual(
    { x: farm.x, z: farm.z, rotation: farm.rotation, box: farm.collectionBox },
    { x: 6, z: 3, rotation: 0, box: undefined },
  );
  assert.equal(farm.cropJobs.filter(Boolean).length, 6);
  assert.deepEqual(warehouse, { id: 'b7', kind: 'expandedWarehouse', x: 3, z: 9, rotation: 0 });
  assert.deepEqual(
    s.buildings.find((b) => b.id === 'b5'),
    { id: 'b5', kind: 'dock', x: 3, z: 19, rotation: 3 },
  );
  assert.deepEqual(
    s.groundStacks.filter((p) => p.item === 'wood'),
    [
      { x: 7, z: 9, item: 'wood', amount: 4 },
      { x: 13, z: 10, item: 'wood', amount: 2 },
      { x: 15, z: 9, item: 'wood', amount: 1 },
    ],
  );
  assert.equal(g.getCapacity(s) - g.getUsedStorage(s), 49);
  for (const water of [false, true]) {
    const fields = s.buildings.filter(
      (b) => b.kind === 'farm' && !b.farmSize && !b.collectionBox && Boolean(b.irrigated) === water,
    );
    assert.ok(
      fields.some((a) =>
        fields.some((b) => {
          try {
            return Boolean(g.farmMergePreview(s, a.id, b.id));
          } catch {
            return false;
          }
        }),
      ),
    );
  }
});
test('showcase drops merge directly and move to ground without stock credit; box harvest and withdrawal are playable', () => {
  let s = g.createDemoGame(NOW);
  const farm = s.buildings.find((b) => b.collectionBox),
    inventory = { ...s.inventory },
    [a, b] = s.looseDrops;
  s = run(s, {
    type: 'moveDrop',
    source: snapshot(a),
    target: { type: 'drop', drop: snapshot(b) },
  });
  assert.deepEqual(s.inventory, inventory);
  assert.equal(s.looseDrops.length, 1);
  assert.equal(s.looseDrops[0].amount, 4);
  let command;
  search: for (let z = 1; z < g.worldSize(s.terrainVersion) - 1; z++)
    for (let x = 1; x < g.worldSize(s.terrainVersion) - 1; x++) {
      const c = {
        type: 'moveDrop',
        source: snapshot(s.looseDrops[0]),
        target: { type: 'ground', x, z },
      };
      if (!g.dropMovePlan(s, c).reason) {
        command = c;
        break search;
      }
    }
  assert.ok(command);
  s = run(s, command);
  assert.equal(s.looseDrops.length, 0);
  assert.deepEqual(s.inventory, inventory);
  s = run(s, { type: 'harvestCell', buildingId: farm.id, cell: 0 });
  assert.equal(s.buildings.find((b) => b.id === farm.id).collectionBox.stock.vegetable, 4);
  assert.deepEqual(s.inventory, inventory);
  s = run(s, { type: 'withdrawFarmBox', buildingId: farm.id, item: 'vegetable', quantity: 2 });
  assert.equal(s.inventory.vegetable, inventory.vegetable + 2);
});
test('updating the template never adds showcase goods or a box to an existing saved demo', () => {
  const old = g.createDemoGame(NOW);
  old.buildings = old.buildings.filter((b) => !b.collectionBox);
  old.looseDrops = [];
  old.inventory.wood = 1;
  const oldBytes = g.exportSave(old),
    normalBytes = g.exportSave(g.createGame(NOW, 1, 1)),
    values = new Map(),
    store = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    };
  profileStorage(store, 'demo').setItem(SAVE_KEY, oldBytes);
  profileStorage(store, 'normal').setItem(SAVE_KEY, normalBytes);
  store.setItem(DEMO_REVISION_KEY, '2026-11-06-production-routes-6');
  const session = townSession(store, 'demo', () => NOW);
  assert.equal(session.mode, 'normal');
  assert.deepEqual(session.state, old);
  assert.equal(session.state.looseDrops.length, 0);
  assert.ok(!session.state.buildings.some((b) => b.collectionBox));
  assert.equal(profileStorage(store, 'demo').getItem(SAVE_KEY), oldBytes);
  assert.equal(profileStorage(store, 'normal').getItem(SAVE_KEY), normalBytes);
  assert.match(session.message, /当前进度未改动/);
});
