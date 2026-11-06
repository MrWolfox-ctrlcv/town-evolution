const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
function dropped() {
  let s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s = g.dispatch(s, { type: 'plantCell', buildingId: 'b2', cell: 4 }, 1000).state;
  s = g.dispatch(s, { type: 'harvestCell', buildingId: 'b2', cell: 4 }, 16000).state;
  return s;
}
test('schema8 missing drops migrates empty; schema10 requires drops and natural/tool records', () => {
  const s = g.createGame(1000, 1, 1);
  for (const mutate of [
    (s) => delete s.looseDrops,
    (s) => delete s.naturalResources,
    (s) => delete s.fusion,
    (s) => delete s.landExtensions,
    (s) => delete s.terrainVersion,
    (s) => delete s.tools.diggingTool,
    (s) => delete s.toolRecoveryAvailable.diggingTool,
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.throws(() => g.importSave(JSON.stringify(bad), 1000));
  }
  const old = structuredClone(s);
  old.schemaVersion = 8;
  delete old.looseDrops;
  delete old.naturalResources;
  delete old.tools.diggingTool;
  delete old.toolRecoveryAvailable.diggingTool;
  assert.deepEqual(g.importSave(JSON.stringify(old), 1000).looseDrops, []);
});
test('bad drops reject entire save: unknown items, limits, sources, IDs, coordinates and collisions', () => {
  for (const edit of [
    (s) => (s.looseDrops[0].item = 'wood'),
    (s) => (s.looseDrops[0].amount = 11),
    (s) => (s.looseDrops[0].amount = 0),
    (s) => (s.looseDrops[0].x6 = 0.1),
    (s) => (s.looseDrops[0].x6 = -1),
    (s) => (s.looseDrops[0].source.cell = 36),
    (s) => (s.looseDrops[0].source.jobId = 'j999999999'),
    (s) => (s.looseDrops[0].source.unknown = true),
    (s) => (s.looseDrops[0].id = `d${s.nextId}`),
    (s) => s.looseDrops.push({ ...s.looseDrops[0] }),
    (s) => (s.looseDrops[0].x6 = 0),
    (s) => s.trees.push({ id: `t${s.nextTreeId++}`, x: 7, z: 4 }),
  ]) {
    const s = dropped();
    edit(s);
    assert.throws(() => g.importSave(JSON.stringify(s), 16000));
  }
});
test('historical source may be gone, but saved drop position and quantity remain exact', () => {
  const s = dropped();
  s.buildings = s.buildings.filter((b) => b.id !== 'b2');
  assert.deepEqual(g.importSave(g.exportSave(s), 16000), s);
});
test('farm boxes reject duplicated crate identity, nonfarm ownership, unknown goods and overcapacity', () => {
  for (const edit of [
    (b) => (b.collectionBox.crateId = 'b1'),
    (b) => (b.kind = 'house'),
    (b) => (b.collectionBox.stock.wood = 1),
    (b) => (b.collectionBox.stock.rice = 17),
    (b) => delete b.collectionBox.stock.rice,
    (b) => (b.collectionBox.capacity = 0),
    (b) => (b.collectionBox.unknown = 1),
  ]) {
    const s = g.createGame(1000, 1, 1);
    s.trees = [];
    s.naturalResources = [];
    const b = s.buildings[1];
    b.collectionBox = {
      crateId: 'b3',
      capacity: 16,
      stock: Object.fromEntries(g.ITEM_KEYS.map((i) => [i, 0])),
    };
    s.nextId = 4;
    edit(b);
    assert.throws(() => g.importSave(JSON.stringify(s), 1000));
  }
});
