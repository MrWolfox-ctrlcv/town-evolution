const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const g = require('../.domain-build/domain/game');
const { peekTerrain6Save } = require('../.domain-build/domain/v6-save-header');
const { V6_GENERATOR_REVISION } = require('../.domain-build/domain/v6-world');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { validatePlacement } = require('../.domain-build/domain/geometry');
const {
  inspectSlot,
  writeSlot,
  manualSlotKey,
} = require('../.domain-build/application/ManualSaves');
const {
  townSession,
  DEMO_REVISION,
  DEMO_REVISION_KEY,
  profileStorage,
} = require('../.domain-build/application/TownProfiles');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
function store(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}
function simple(kind) {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.buildings.push({ id: `b${s.nextId++}`, kind, x: 9, z: 5, rotation: 3 });
  return s;
}
test('wire11 retains strict schema10 fields, unknown kinds/recipes and future versions still reject', () => {
  const raw = JSON.parse(g.exportSave(simple('bench')));
  for (const change of [
    (s) => {
      delete s.inventory.roastedCarrot;
    },
    (s) => {
      delete s.tools;
    },
    (s) => {
      delete s.looseDrops;
    },
    (s) => {
      s.buildings.at(-1).kind = 'unknown';
    },
    (s) => {
      s.fusion.discoveries['future-recipe'] = { count: 1, firstDiscoveredAt: 1 };
    },
    (s) => {
      s.buildings.at(-1).compost = {};
    },
    (s) => {
      s.buildings.at(-1).job = { id: 'j999', startedAt: 0, readyAt: 1000 };
    },
  ]) {
    const mutated = structuredClone(raw);
    change(mutated);
    assert.throws(() => g.importSave(JSON.stringify(mutated), 1000));
  }
  assert.throws(
    () => g.importSave(JSON.stringify({ ...raw, schemaVersion: 12 }), 1000),
    g.SaveVersionError,
  );
  const old = fs.readFileSync(require.resolve('./fixtures/schema9-before-compost.json'), 'utf8');
  const migrated = g.importSave(old, JSON.parse(old).lastSeenAt);
  assert.equal(JSON.parse(g.exportSave(migrated)).schemaVersion, 10);
});
test('new manual slots inspect and restore both decorative entities without writes on inspection', () => {
  for (const kind of ['bench', 'fence']) {
    const storage = store(),
      s = simple(kind);
    writeSlot(storage, 1, s, 1000, null);
    const raw = storage.getItem(manualSlotKey(1));
    assert.equal(JSON.parse(JSON.parse(raw).save).schemaVersion, 11);
    const before = [...storage.values];
    const slot = inspectSlot(storage, 1, 1000);
    assert.equal(slot.status, 'ready');
    assert.deepEqual(slot.state, s);
    assert.deepEqual([...storage.values], before);
  }
});
test('wire11 terrain6 header uses unchanged preparation identity and full imports preserve actual support heights', () => {
  const preparation = new V6WorldPreparation(1937);
  while (preparation.step(50000).status !== 'ready') {}
  preparation.takeResult();
  const s = g.createGame(1000, 1937, 6);
  for (const kind of ['fence', 'bench']) {
    let found = false;
    outer: for (let z = 8; z < 60; z++)
      for (let x = 8; x < 60; x++) {
        const b = { id: `b${s.nextId}`, kind, x, z, rotation: 0 };
        try {
          validatePlacement(s, b);
        } catch {
          continue;
        }
        s.buildings.push(b);
        s.nextId++;
        found = true;
        break outer;
      }
    assert.equal(found, true);
  }
  const bytes = g.exportSave(s);
  assert.equal(JSON.parse(bytes).schemaVersion, 11);
  assert.deepEqual(peekTerrain6Save(bytes), {
    mapSeed: 1937,
    terrainVersion: 6,
    terrainRevision: V6_GENERATOR_REVISION,
  });
  assert.deepEqual(g.importSave(bytes, 1000), s);
  const raw = JSON.parse(bytes);
  raw.schemaVersion = 12;
  assert.throws(() => peekTerrain6Save(JSON.stringify(raw)), g.SaveVersionError);
});
test('new demo shows both props but neither discovery, and old saved demo is never reset or populated', () => {
  const fresh = g.createDemoGame(1000);
  for (const kind of ['fence', 'bench']) {
    assert.ok(fresh.buildings.some((b) => b.kind === kind));
    assert.equal(fresh.fusion.discoveries[`build-${kind}`], undefined);
  }
  assert.equal(JSON.parse(g.exportSave(fresh)).schemaVersion, 11);
  const older = structuredClone(fresh);
  older.buildings = older.buildings.filter((b) => !['fence', 'bench'].includes(b.kind));
  const storage = store([[DEMO_REVISION_KEY, 'older-template']]),
    scoped = profileStorage(storage, 'demo');
  const raw = g.exportSave(older);
  scoped.setItem(SAVE_KEY, raw);
  const before = [...storage.values];
  const loaded = townSession(storage, 'demo', () => 1000);
  assert.deepEqual(loaded.state, older);
  assert.deepEqual([...storage.values], before);
  assert.notEqual(storage.getItem(DEMO_REVISION_KEY), DEMO_REVISION);
  assert.match(loaded.message, /模板已更新/);
});
