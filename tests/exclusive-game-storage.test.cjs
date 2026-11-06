const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  ExclusiveGameStorage,
  GAME_WRITE_LOCK,
} = require('../.domain-build/application/ExclusiveGameStorage.js');
const { GameSession } = require('../.domain-build/application/GameSession.js');
const { GameStart } = require('../.domain-build/application/GameStart.js');
const { writeSlot, inspectSlot } = require('../.domain-build/application/ManualSaves.js');
const { createGame } = require('../.domain-build/domain/game.js');
const { SAVE_KEY, BACKUP_KEY, saveGame, loadGame } = require('../.domain-build/domain/storage.js');
const flush = () => new Promise((resolve) => setImmediate(resolve));
/** A deterministic FIFO model of Web Locks exclusion, not a claim of browser execution. */
function exclusiveProvider() {
  const queue = [];
  let owner = false;
  const pump = () => {
    if (owner || !queue.length) return;
    owner = true;
    const { run, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(run)
      .then(resolve, reject)
      .finally(() => {
        owner = false;
        pump();
      });
  };
  return {
    request(name, run) {
      assert.equal(name, GAME_WRITE_LOCK);
      return new Promise((resolve, reject) => {
        queue.push({ run, resolve, reject });
        pump();
      });
    },
  };
}
function fixture(provider = exclusiveProvider()) {
  const data = new Map();
  const raw = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  saveGame(raw, createGame(60000));
  return { data, raw, page: () => new ExclusiveGameStorage(raw, provider) };
}
test('only one page can write; waiting pages remain readable and cannot enter gameplay', async () => {
  const f = fixture(),
    a = f.page(),
    b = f.page();
  a.start();
  b.start();
  await flush();
  assert.equal(a.writable, true);
  assert.equal(b.writable, false);
  assert.equal(loadGame(b, 60000).status, 'loaded');
  const flow = new GameStart(
    b,
    () => 60000,
    () => b.warning,
  );
  const before = [...f.data.entries()];
  assert.equal(flow.start(), false);
  assert.equal(flow.session, null);
  assert.match(flow.message, /只读/);
  assert.throws(() => b.setItem(SAVE_KEY, 'bad'));
  assert.throws(() => b.removeItem(SAVE_KEY));
  assert.deepEqual([...f.data.entries()], before);
  a.dispose();
  b.dispose();
  await flush();
});
test('exact final-set save interleaving cannot make a second page writer succeed', async () => {
  const f = fixture(),
    aStore = f.page(),
    bStore = f.page();
  aStore.start();
  bStore.start();
  await flush();
  const a = new GameSession(aStore, () => 60000),
    b = new GameSession(bStore, () => 60000);
  a.state.coins = 97;
  b.state.coins = 64;
  const set = f.raw.setItem;
  let injected = false,
    second;
  f.raw.setItem = (key, value) => {
    if (key === SAVE_KEY && !injected) {
      injected = true;
      second = b.save();
    }
    set(key, value);
  };
  assert.equal(a.save(), true);
  assert.equal(second, false);
  assert.equal(loadGame(f.raw, 60000).state.coins, 97);
  assert.equal(JSON.parse(f.raw.getItem(BACKUP_KEY)).coins, 120);
  assert.equal(b.state.coins, 64);
  b.suspend();
  b.suspend();
  assert.equal(loadGame(f.raw, 60000).state.coins, 97);
  aStore.dispose();
  bStore.dispose();
  await flush();
});
test('exact final-set reset interleaving cannot lose a successful second-page save', async () => {
  const f = fixture(),
    aStore = f.page(),
    bStore = f.page();
  aStore.start();
  bStore.start();
  await flush();
  const a = new GameSession(aStore, () => 60000),
    b = new GameSession(bStore, () => 60000);
  b.state.coins = 64;
  const set = f.raw.setItem;
  let injected = false,
    second;
  f.raw.setItem = (key, value) => {
    if (key === SAVE_KEY && !injected) {
      injected = true;
      second = b.save();
    }
    set(key, value);
  };
  assert.equal(a.reset(), true);
  assert.equal(second, false);
  assert.equal(b.state.coins, 64);
  assert.equal(loadGame(f.raw, 60000).state.coins, 120);
  aStore.dispose();
  bStore.dispose();
  await flush();
});
test('manual final-set interleaving is guarded by the same page lock', async () => {
  const f = fixture(),
    a = f.page(),
    b = f.page();
  a.start();
  b.start();
  await flush();
  writeSlot(a, 1, { ...createGame(60000), coins: 14 }, 60000);
  const expected = inspectSlot(a, 1, 60000).revision,
    set = f.raw.setItem;
  let injected = false;
  f.raw.setItem = (key, value) => {
    if (key === `${SAVE_KEY}.manual.1` && !injected) {
      injected = true;
      assert.throws(() => writeSlot(b, 1, { ...createGame(60000), coins: 37 }, 60000, expected));
    }
    set(key, value);
  };
  writeSlot(a, 1, { ...createGame(60000), coins: 81 }, 60000, expected);
  assert.equal(inspectSlot(a, 1, 60000).state.coins, 81);
  assert.equal(
    JSON.parse(JSON.parse(f.raw.getItem(`${SAVE_KEY}.manual.1.before-overwrite`)).save).coins,
    14,
  );
  a.dispose();
  b.dispose();
  await flush();
});
test('ownership transfer revokes old page before allowing the next; stale reads still conflict', async () => {
  const f = fixture(),
    a = f.page(),
    b = f.page();
  a.start();
  b.start();
  await flush();
  const first = new GameSession(a, () => 60000),
    stale = new GameSession(b, () => 60000);
  first.state.coins = 97;
  first.save();
  a.dispose();
  await flush();
  assert.equal(a.writable, false);
  assert.equal(b.writable, true);
  assert.throws(() => a.setItem(SAVE_KEY, 'old page overwrite'));
  assert.equal(stale.save(), false);
  assert.equal(stale.hasSaveConflict, true);
  const current = new GameSession(b, () => 60000);
  current.state.coins = 91;
  assert.ok(current.save());
  assert.equal(loadGame(f.raw, 60000).state.coins, 91);
  b.dispose();
  await flush();
});
test('a closed waiting page never becomes a writer and does not block the next page', async () => {
  const f = fixture(),
    a = f.page(),
    b = f.page(),
    c = f.page();
  a.start();
  b.start();
  c.start();
  await flush();
  b.dispose();
  a.dispose();
  await flush();
  assert.equal(b.writable, false);
  assert.equal(c.writable, true);
  assert.throws(() => b.setItem(SAVE_KEY, 'closed'));
  c.dispose();
  await flush();
});
test('missing or rejected Web Locks fail closed without modifying any save key', async () => {
  for (const provider of [
    null,
    { request: () => Promise.reject(Error('denied')) },
    {
      request: () => {
        throw Error('denied');
      },
    },
  ]) {
    const f = fixture(provider),
      page = f.page(),
      before = [...f.data.entries()];
    page.start();
    await flush();
    assert.equal(page.writable, false);
    assert.match(page.warning, /禁止写入/);
    assert.equal(loadGame(page, 60000).status, 'loaded');
    assert.throws(() => page.setItem(SAVE_KEY, 'bad'));
    assert.throws(() => page.removeItem(SAVE_KEY));
    assert.deepEqual([...f.data.entries()], before);
    page.dispose();
  }
});
test('the real Cocos bootstrap has one guarded storage entry point and no controller bypass', () => {
  const bootstrap = fs.readFileSync('assets/scripts/presentation/TownBootstrap.ts', 'utf8');
  const controller = fs.readFileSync('assets/scripts/presentation/TownController.ts', 'utf8');
  assert.match(bootstrap, /navigator\.locks\.request\(name, \{ mode: 'exclusive' \}, run\)/);
  assert.match(bootstrap, /new ExclusiveGameStorage\(sys\.localStorage/);
  assert.match(bootstrap, /new GameStart\(\s*this\.storage/);
  assert.doesNotMatch(controller, /sys\.localStorage|new GameSession/);
  assert.match(bootstrap, /this\.storage\?\.dispose\(\)/);
});
