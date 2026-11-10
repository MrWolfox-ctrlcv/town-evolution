const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const {
  loadGame,
  saveGame,
  SAVE_KEY,
  BACKUP_KEY,
  MIGRATION_BACKUP_KEY,
} = require('../.domain-build/domain/storage');
const { emptyStock, initializeFacility } = require('../.domain-build/domain/commerce');
const added = ['rice', 'sapling', 'milledRice', 'flour', 'bread', 'roastedCarrot'];
function oldSave() {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory.wood = 2;
  s.fusion.attachments.b1 = { ...emptyStock(), stone: 1 };
  const shop = { id: `b${s.nextId++}`, kind: 'shop', x: 9, z: 5, rotation: 0 };
  s.buildings.push(shop);
  initializeFacility(s.commerce, shop);
  const raw = JSON.parse(g.exportSave(s));
  raw.schemaVersion = 8;
  for (const stock of [
    raw.inventory,
    ...Object.values(raw.fusion.attachments),
    ...Object.values(raw.commerce.shopStock),
  ])
    for (const key of added) delete stock[key];
  return JSON.stringify(raw);
}
function storage(entries) {
  const data = new Map(entries);
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}
test('schema8 migrates in memory without writes and the first save preserves original bytes as backup', () => {
  const original = oldSave(),
    store = storage([[SAVE_KEY, original]]);
  const loaded = loadGame(store, 2000);
  assert.equal(loaded.status, 'loaded');
  assert.equal(loaded.state.schemaVersion, 10);
  assert.equal(store.getItem(SAVE_KEY), original);
  assert.equal(store.getItem(BACKUP_KEY), null);
  for (const item of added) assert.equal(loaded.state.inventory[item], 0);
  assert.equal(loaded.state.inventory.wood, 2);
  assert.equal(loaded.state.fusion.attachments.b1.stone, 1);
  saveGame(store, loaded.state, loaded.revision);
  assert.equal(store.getItem(BACKUP_KEY), original);
  assert.equal(JSON.parse(store.getItem(SAVE_KEY)).schemaVersion, 10);
  assert.equal(store.getItem(MIGRATION_BACKUP_KEY), original);
  const later = { ...loaded.state, lastSeenAt: 3000 };
  saveGame(store, later);
  assert.equal(store.getItem(MIGRATION_BACKUP_KEY), original);
  assert.equal(JSON.parse(store.getItem(BACKUP_KEY)).schemaVersion, 10);
});
test('future versions retain primary and backup verbatim instead of falling back to older progress', () => {
  const old = oldSave(),
    future = JSON.stringify({ ...JSON.parse(old), schemaVersion: 12 });
  const store = storage([
    [SAVE_KEY, future],
    [BACKUP_KEY, old],
  ]);
  const result = loadGame(store, 2000);
  assert.equal(result.status, 'corrupt');
  assert.equal(result.state, null);
  assert.match(result.warning, /版本不兼容/);
  assert.equal(store.getItem(SAVE_KEY), future);
  assert.equal(store.getItem(BACKUP_KEY), old);
});
test('schema10 stocks are complete, bounded and reject unknown or malformed product keys', () => {
  const saved = g.exportSave(g.createGame(1000, 1, 1));
  for (const mutate of [
    (s) => delete s.inventory.rice,
    (s) => {
      s.inventory.sapling = -1;
    },
    (s) => {
      s.inventory.flour = '1';
    },
    (s) => {
      s.inventory.unapprovedProduct = 1;
    },
  ]) {
    const raw = JSON.parse(saved);
    mutate(raw);
    assert.throws(() => g.importSave(JSON.stringify(raw), 1000));
  }
});
test('new items survive every active storage owner without being silently stripped', () => {
  let state = g.createGame(1000, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.inventory = { ...emptyStock(), rice: 1, sapling: 1, milledRice: 1, flour: 1, bread: 1 };
  state.fusion.attachments.b1 = { ...emptyStock(), sapling: 1, flour: 1 };
  state.groundStacks = [{ x: 9, z: 5, item: 'bread', amount: 2 }];
  const restored = g.importSave(g.exportSave(state), 1000);
  assert.deepEqual(restored, state);
});

test('migration archive quota failure never overwrites the version-eight primary', () => {
  const original = oldSave(),
    store = storage([[SAVE_KEY, original]]);
  const loaded = loadGame(store, 2000),
    set = store.setItem;
  store.setItem = (key, value) => {
    if (key === MIGRATION_BACKUP_KEY) throw new Error('quota');
    set(key, value);
  };
  assert.throws(() => saveGame(store, loaded.state, loaded.revision), /quota/);
  assert.equal(store.getItem(SAVE_KEY), original);
  assert.equal(store.getItem(BACKUP_KEY), null);
});
