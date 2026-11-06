/** New-world boundaries compared with independent pre-terrain6 legacy evidence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const g = require('../.domain-build/domain/game');
const v6 = require('../.domain-build/domain/v6-world');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { SAVE_KEY, GAME_SAVE_KEYS, loadGame } = require('../.domain-build/domain/storage');
const { townSession, profileStorage } = require('../.domain-build/application/TownProfiles');
const oracle = JSON.parse(
  zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/terrain6-legacy-oracle.json.gz'))),
);
const now = oracle.now;
const preparedResults = new Map();
let pinnedWorld;
function memory() {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}
function prepare(seed) {
  if (v6.hasPreparedV6World(seed)) return v6.getV6World(seed);
  const job = new V6WorldPreparation(seed);
  let steps = 0,
    previous = 0;
  while (job.progress.status === 'building') {
    const progress = job.step(256);
    assert.ok(progress.stepWork >= 1 && progress.stepWork <= 256);
    assert.ok(Number.isSafeInteger(job.progress.completedWork));
    assert.ok(job.progress.completedWork >= previous);
    previous = job.progress.completedWork;
    assert.ok(++steps < 10000, 'Staged construction must reach a terminal state');
  }
  assert.equal(job.progress.status, 'ready');
  preparedResults.set(seed, job.takeResult());
  assert.throws(() => job.takeResult(), 'Completed builders can publish only once');
  assert.equal(v6.hasPreparedV6World(seed), true);
  return v6.getV6World(seed);
}
function rejectsBytes(bytes) {
  const store = memory();
  store.setItem(SAVE_KEY, bytes);
  const before = [...store.data];
  assert.throws(() => g.importSave(bytes, now));
  assert.equal(loadGame(store, now).status, 'corrupt');
  assert.deepEqual([...store.data], before);
  if (pinnedWorld)
    assert.equal(v6.getV6World(1), pinnedWorld, 'Bad candidates cannot evict the active world');
}

for (const seed of [1, 7, 42173])
  test(`terrain6 seed ${seed} is explicit, prepared, deterministic and never replaces old caches`, () => {
    const old = oracle.records.filter(
      (r) => r.seed === seed && (r.version === 4 || r.version === 5),
    );
    for (const record of old)
      assert.equal(g.exportSave(g.createGame(now, seed, record.version)), record.initial);
    if (!v6.hasPreparedV6World(seed)) {
      assert.throws(() => v6.getV6World(seed));
      assert.throws(() => g.createGame(now, seed, 6));
    }
    prepare(seed);
    if (seed === 1) {
      pinnedWorld = v6.getV6World(1);
      v6.setActiveV6World(1);
    } else {
      assert.equal(
        v6.getV6World(1),
        pinnedWorld,
        'Preparing a candidate cannot evict the active seed',
      );
    }
    const state = g.createGame(now, seed, 6),
      bytes = g.exportSave(state);
    assert.equal(state.schemaVersion, 10);
    assert.equal(state.terrainVersion, 6);
    assert.equal(state.terrainRevision, 'v6-natural-grass-edits-1');
    assert.equal(state.terrainRevision, v6.V6_GENERATOR_REVISION);
    assert.equal(state.terrain6.format, 1);
    assert.deepEqual(state.terrain6.cells, []);
    assert.equal(g.exportSave(g.createGame(now, seed, 6)), bytes);
    assert.equal(g.exportSave(g.importSave(bytes, now)), bytes);
    assert.ok(state.trees.length > 0 && state.naturalResources.length > 0);
    const ids = new Set();
    for (const entity of [...state.trees, ...state.naturalResources]) {
      assert.equal(ids.has(entity.id), false);
      ids.add(entity.id);
      assert.ok(g.isLandCell(entity.x, entity.z, seed, 6));
    }
    for (const record of old)
      assert.equal(g.exportSave(g.createGame(now, seed, record.version)), record.initial);
    assert.equal(
      g.exportSave(g.createGame(now, seed)),
      oracle.records.find((r) => r.seed === seed).defaultSave,
    );
  });

test('terrain6 missing or foreign revisions/checkpoints are rejected without rewriting raw bytes', () => {
  prepare(1);
  const initial = g.createGame(now, 1, 6);
  const mutate = [
    (s) => {
      delete s.terrainRevision;
    },
    (s) => {
      s.terrainRevision = 'v5-natural-coast-starter-1';
    },
    (s) => {
      s.terrainRevision = 'future-v6';
    },
    (s) => {
      delete s.terrain6;
    },
    (s) => {
      s.terrain6 = null;
    },
    (s) => {
      s.terrain6.format = 2;
    },
    (s) => {
      s.terrain6.nextOperation = -1;
    },
    (s) => {
      s.terrain6.nextOperation = 1.5;
    },
    (s) => {
      s.terrain6.cells = {};
    },
    (s) => {
      s.schemaVersion = 8;
    },
    (s) => {
      s.schemaVersion = 9;
    },
    (s) => {
      delete s.naturalResources;
    },
    (s) => {
      delete s.looseDrops;
    },
    (s) => {
      s.inventory.soil = 1 / 8192;
    },
    (s) => {
      s.inventory.stone = 0.1;
    },
    (s) => {
      s.inventory.mud = 0.5;
    },
    (s) => {
      s.naturalResources[0].amount += 1;
    },
    (s) => {
      s.trees[0].id = s.trees[1].id;
    },
  ];
  for (const change of mutate) {
    const raw = structuredClone(initial);
    change(raw);
    rejectsBytes(JSON.stringify(raw));
  }
  for (const version of [1, 2, 3, 4, 5]) {
    const raw = g.createGame(now, 1, version);
    raw.terrain6 = structuredClone(initial.terrain6);
    rejectsBytes(JSON.stringify(raw));
  }
});

test('terrain6 initial absent and partially depleted resources never regenerate through repeated reload', () => {
  prepare(1);
  const initial = g.createGame(now, 1, 6);
  const target = initial.naturalResources.find((r) => r.amount > 1);
  assert.ok(target);
  const partial = structuredClone(initial);
  partial.naturalResources.find((r) => r.id === target.id).amount -= 1;
  partial.trees = partial.trees.slice(2);
  for (const state of [partial, { ...initial, naturalResources: [], trees: [] }]) {
    const bytes = g.exportSave(state);
    let restored = g.importSave(bytes, now);
    for (let i = 0; i < 3; i++) restored = g.importSave(g.exportSave(restored), now);
    assert.equal(g.exportSave(restored), bytes);
    assert.deepEqual(restored.inventory, initial.inventory);
    assert.deepEqual(restored.looseDrops, initial.looseDrops);
  }
});

test('v6 preview writes only its own revision namespace and preserves all older profile bytes', () => {
  prepare(42173);
  const store = memory();
  for (const record of oracle.profiles) {
    const scoped = profileStorage(store, record.profile);
    scoped.setItem(SAVE_KEY, record.save);
    for (const key of GAME_SAVE_KEYS.filter((key) => key !== SAVE_KEY))
      scoped.setItem(key, `unreadable old bytes ${record.profile} ${key}`);
    scoped.setItem('town-evolution.manual.1', `old manual ${record.profile}`);
  }
  const old = [...store.data];
  const session = townSession(store, 'v6-preview', () => now);
  assert.equal(session.mode, 'normal');
  assert.equal(session.state.terrainVersion, 6);
  assert.equal(session.save(), true);
  for (const [key, bytes] of old) assert.equal(store.getItem(key), bytes);
  const oldKeys = new Set(old.map(([key]) => key));
  const added = [...store.data].filter(([key]) => !oldKeys.has(key));
  assert.ok(added.length > 0);
  assert.ok(
    added.every(([key]) => key.startsWith('town-evolution.v6-preview.v6-natural-grass-edits-1.')),
  );
  const scoped = profileStorage(store, 'v6-preview');
  scoped.setItem(SAVE_KEY, ' { broken v6 \u0000 }\n');
  const before = [...store.data];
  const corrupt = townSession(store, 'v6-preview', () => now);
  assert.equal(corrupt.mode, 'corrupt');
  assert.equal(corrupt.save(), false);
  assert.deepEqual([...store.data], before);
});

test('terrain6 cancelled or forged preparation never publishes a partial world', () => {
  const seed = 42;
  assert.equal(v6.hasPreparedV6World(seed), false);
  const job = new V6WorldPreparation(seed);
  assert.throws(() => job.takeResult());
  job.step(1);
  assert.equal(v6.hasPreparedV6World(seed), false);
  assert.equal(job.cancel(), true);
  assert.equal(job.progress.status, 'cancelled');
  assert.throws(() => job.takeResult());
  assert.equal(job.step(256).stepWork, 0);
  assert.equal(v6.hasPreparedV6World(seed), false);
  assert.throws(() =>
    v6.publishPreparedV6World({ terrain: { seed, revision: v6.V6_GENERATOR_REVISION } }),
  );
  assert.equal(v6.hasPreparedV6World(seed), false);
  assert.equal(v6.getV6World(1), pinnedWorld);
  const cached = new V6WorldPreparation(1);
  assert.equal(cached.progress.status, 'ready');
  assert.equal(cached.cancel(), true);
  assert.throws(() => cached.takeResult());
  assert.equal(
    v6.getV6World(1),
    pinnedWorld,
    'Cancelling a cached job cannot erase an already published world',
  );
  v6.setActiveV6World(null);
  v6.getV6World(42173);
  // Reuse the authenticated seed7 result prepared above, without generating a fourth world.
  v6.publishPreparedV6World(preparedResults.get(7));
  assert.equal(v6.hasPreparedV6World(1), false, 'Unpinned inactive worlds can rotate normally');
  assert.equal(v6.hasPreparedV6World(7), true);
  assert.equal(v6.hasPreparedV6World(42173), true);
});
