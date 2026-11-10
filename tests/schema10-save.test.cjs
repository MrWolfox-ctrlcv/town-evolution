const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { createCompostState } = require('../.domain-build/domain/compost');
const {
  saveGame,
  acceptRecovery,
  loadGame,
  SAVE_KEY,
  BACKUP_KEY,
  SCHEMA10_BACKUP_KEY,
  MIGRATION_BACKUP_KEY,
  SaveConflictError,
} = require('../.domain-build/domain/storage');
const oldText = fs.readFileSync(require.resolve('./fixtures/schema9-before-compost.json'), 'utf8');
function allStocks(s) {
  return [
    s.inventory,
    ...Object.values(s.fusion.attachments),
    ...Object.values(s.commerce.shopStock),
    ...Object.values(s.commerce.dockCargo),
    ...Object.values(s.commerce.shipments).flatMap((j) => [
      j.cargo,
      ...(j.unitPrices ? [j.unitPrices] : []),
    ]),
    ...s.buildings.flatMap((b) => (b.collectionBox ? [b.collectionBox.stock] : [])),
  ];
}
function store(entries = []) {
  const data = new Map(entries);
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}
function barrel() {
  let s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.buildings.push({
    id: 'b3',
    kind: 'compostBarrel',
    x: 9,
    z: 5,
    rotation: 0,
    compost: createCompostState(),
  });
  s.nextId = 4;
  s.inventory.vegetable = 4;
  const r = g.dispatch(
    s,
    {
      type: 'depositCompost',
      buildingId: 'b3',
      quantity: 3,
      source: { type: 'inventory', item: 'vegetable', amount: 4 },
    },
    1000,
  );
  assert.equal(r.ok, true, r.error);
  return r.state;
}
test('complete frozen v9 assets migrate by adding only roastedCarrot zero and runtime schema10', () => {
  const old = JSON.parse(oldText),
    s = g.importSave(oldText, old.lastSeenAt);
  assert.equal(s.schemaVersion, 10);
  for (const stock of allStocks(s)) assert.equal(stock.roastedCarrot, 0);
  const projected = structuredClone(s);
  projected.schemaVersion = 9;
  for (const stock of allStocks(projected)) delete stock.roastedCarrot;
  assert.deepEqual(projected, old);
  assert.deepEqual(g.importSave(g.exportSave(s), s.lastSeenAt), s);
  assert.equal(
    fs.readFileSync(require.resolve('./fixtures/schema9-before-compost.json'), 'utf8'),
    oldText,
  );
});
test('v9 nested attachment and voyage price stocks receive zero without losing their old amounts', () => {
  const old = JSON.parse(oldText);
  old.fusion.attachments.b1 = { ...old.inventory };
  for (const item in old.fusion.attachments.b1) old.fusion.attachments.b1[item] = 0;
  old.fusion.attachments.b1.treeSeed = 2;
  const shipment = Object.values(old.commerce.shipments)[0];
  shipment.durationMs = 30000;
  shipment.unitPrices = { ...old.fusion.attachments.b1 };
  for (const item in shipment.unitPrices) shipment.unitPrices[item] = 0;
  shipment.unitPrices.lettuce = 6;
  const s = g.importSave(JSON.stringify(old), old.lastSeenAt);
  assert.equal(s.fusion.attachments.b1.treeSeed, 2);
  assert.equal(s.fusion.attachments.b1.roastedCarrot, 0);
  const next = Object.values(s.commerce.shipments)[0];
  assert.equal(next.reward, shipment.reward);
  assert.equal(next.unitPrices.lettuce, 6);
  assert.equal(next.unitPrices.roastedCarrot, 0);
});
test('v9 remains strict for previously required keys, and current10 requires every new stock key', () => {
  const old = JSON.parse(oldText);
  delete old.inventory.rice;
  assert.throws(() => g.importSave(JSON.stringify(old), 100000));
  const s = g.importSave(oldText, 100000);
  for (let index = 0; index < allStocks(s).length; index++) {
    const raw = structuredClone(s);
    delete allStocks(raw)[index].roastedCarrot;
    assert.throws(() => g.importSave(JSON.stringify(raw), 100000));
  }
  for (const value of [-1, 1.5, '1', null, 1000000001]) {
    const raw = structuredClone(s);
    raw.inventory.roastedCarrot = value;
    assert.throws(() => g.importSave(JSON.stringify(raw), 100000));
  }
});
test('first v9 write archives exact bytes once, load is read-only and archive failures never replace primary', () => {
  const storage = store([[SAVE_KEY, oldText]]),
    loaded = loadGame(storage, 100000);
  assert.equal(loaded.status, 'loaded');
  assert.equal(storage.getItem(SAVE_KEY), oldText);
  assert.equal(storage.getItem(SCHEMA10_BACKUP_KEY), null);
  saveGame(storage, loaded.state, loaded.revision);
  assert.equal(storage.getItem(SCHEMA10_BACKUP_KEY), oldText);
  assert.equal(storage.getItem(BACKUP_KEY), oldText);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).schemaVersion, 10);
  saveGame(storage, { ...loaded.state, lastSeenAt: 100001 });
  assert.equal(storage.getItem(SCHEMA10_BACKUP_KEY), oldText);
  const failure = store([[SAVE_KEY, oldText]]),
    realSet = failure.setItem;
  failure.setItem = (k, v) => {
    if (k === SCHEMA10_BACKUP_KEY) throw Error('disk full');
    realSet(k, v);
  };
  assert.throws(() => saveGame(failure, loaded.state));
  assert.equal(failure.getItem(SAVE_KEY), oldText);
  assert.equal(failure.getItem(BACKUP_KEY), null);
});
test('schema8 keeps both exact pre9 and pre10 archives, future versions and stale tabs remain protected', () => {
  const old = JSON.parse(oldText);
  old.schemaVersion = 8;
  const raw = JSON.stringify(old),
    storage = store([[SAVE_KEY, raw]]);
  const loaded = loadGame(storage, 100000);
  assert.equal(loaded.status, 'loaded');
  saveGame(storage, loaded.state, loaded.revision);
  assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), raw);
  assert.equal(storage.getItem(SCHEMA10_BACKUP_KEY), raw);
  assert.throws(() => saveGame(storage, loaded.state, loaded.revision), SaveConflictError);
  const future = JSON.stringify({ ...old, schemaVersion: 12 }),
    incompatible = store([
      [SAVE_KEY, future],
      [BACKUP_KEY, raw],
    ]);
  assert.equal(loadGame(incompatible, 100000).status, 'corrupt');
  assert.equal(incompatible.getItem(SAVE_KEY), future);
  assert.equal(incompatible.getItem(BACKUP_KEY), raw);
});
test('barrel partial stock and active promise round-trip, with isolated mutable snapshots', () => {
  const s = barrel(),
    encoded = g.exportSave(s),
    loaded = g.importSave(encoded, 1000),
    b = loaded.buildings[2];
  assert.equal(b.compost.stock.vegetable, 1);
  assert.deepEqual(b.compost.job.inputs, [{ item: 'vegetable', amount: 2 }]);
  b.compost.job.inputs[0].amount = 1;
  b.compost.stock.vegetable = 2;
  assert.equal(s.buildings[2].compost.job.inputs[0].amount, 2);
  assert.equal(g.exportSave(s), encoded);
});
test('malformed or misplaced barrel state, conflicting jobs and duplicate IDs never silently lose assets', () => {
  const state = barrel();
  for (const mutate of [
    (s) => delete s.buildings[2].compost,
    (s) => delete s.buildings[2].compost.stock.roastedCarrot,
    (s) => (s.buildings[2].compost.stock.wood = 1),
    (s) => (s.buildings[2].compost.capacity = 2),
    (s) => s.buildings[2].compost.job.readyAt++,
    (s) => (s.buildings[2].compost.job.inputs[0].item = 'bread'),
    (s) => (s.buildings[2].compost.job.fertilizerYield = 0),
    (s) => (s.buildings[2].compost.job.id = 'b4'),
    (s) => (s.buildings[2].job = { id: 'j9', startedAt: 1000, readyAt: 2000 }),
    (s) => (s.buildings[0].compost = createCompostState()),
    (s) => (s.schemaVersion = 9),
    (s) => {
      s.buildings[1].cropJobs[0] = {
        id: s.buildings[2].compost.job.id,
        crop: 'vegetable',
        startedAt: 1000,
        readyAt: 16000,
      };
    },
  ]) {
    const raw = structuredClone(state);
    mutate(raw);
    const text = JSON.stringify(raw);
    assert.throws(() => g.importSave(text, 1000));
    const storage = store([[SAVE_KEY, text]]);
    assert.equal(loadGame(storage, 1000).status, 'corrupt');
    assert.equal(storage.getItem(SAVE_KEY), text);
  }
});
test('new demo supplies real compost and roast content while old saved demo gains neither automatically', () => {
  const s = g.createDemoGame(100000),
    b = s.buildings.find((b) => b.kind === 'compostBarrel');
  assert.ok(b);
  assert.equal(b.compost.stock.treeSeed, 1);
  assert.equal(b.compost.job, undefined);
  assert.equal(s.inventory.roastedCarrot, 2);
  assert.ok(s.groundStacks.some((p) => p.item === 'roastedCarrot' && p.amount === 2));
  const old = g.importSave(oldText, 100000);
  assert.equal(
    old.buildings.some((b) => b.kind === 'compostBarrel'),
    false,
  );
  assert.equal(old.inventory.roastedCarrot, 0);
  assert.deepEqual(old.trees, JSON.parse(oldText).trees);
  assert.deepEqual(old.naturalResources, JSON.parse(oldText).naturalResources);
});

for (const version of [8, 9])
  for (const primary of [null, 'broken primary'])
    test(`backup recovery from v${version} with ${primary === null ? 'missing' : 'broken'} primary preserves original bytes after later saves`, () => {
      const raw = JSON.parse(oldText);
      raw.schemaVersion = version;
      const old = JSON.stringify(raw),
        storage = store([
          [SAVE_KEY, primary],
          [BACKUP_KEY, old],
        ]);
      const loaded = loadGame(storage, 100000);
      assert.equal(loaded.status, 'recovered');
      const revision = acceptRecovery(storage, loaded.state, loaded.revision);
      assert.equal(storage.getItem(SCHEMA10_BACKUP_KEY), old);
      if (version === 8) assert.equal(storage.getItem(MIGRATION_BACKUP_KEY), old);
      assert.equal(storage.getItem(`${SAVE_KEY}.unreadable`), primary);
      saveGame(storage, { ...loaded.state, lastSeenAt: 100001 }, revision);
      assert.equal(JSON.parse(storage.getItem(BACKUP_KEY)).schemaVersion, 10);
      assert.equal(storage.getItem(SCHEMA10_BACKUP_KEY), old);
      const failed = store([
          [SAVE_KEY, primary],
          [BACKUP_KEY, old],
        ]),
        put = failed.setItem;
      failed.setItem = (key, value) => {
        if (key === SCHEMA10_BACKUP_KEY) throw Error('disk full');
        put(key, value);
      };
      const pending = loadGame(failed, 100000);
      assert.throws(() => acceptRecovery(failed, pending.state, pending.revision));
      assert.equal(failed.getItem(SAVE_KEY), primary);
      assert.equal(failed.getItem(BACKUP_KEY), old);
    });
