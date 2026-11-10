/** Actual demo operations, not injected discoveries; previews and persistence stay atomic. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game.js');
const { GameSession } = require('../.domain-build/application/GameSession.js');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
const { soilWaterCommand } = require('../.domain-build/application/SoilWatering.js');
const { stackDropCommand } = require('../.domain-build/application/StackDrop.js');
const { handbookView, handbookEntry } = require('../.domain-build/application/HandbookModel.js');
const { ACTIVE_RECIPE_DEFINITIONS } = require('../.domain-build/domain/recipes.js');
const { SAVE_KEY } = require('../.domain-build/domain/storage.js');
const baseline = g.createDemoGame(60000);
const ids = ['gather-soil', 'gather-stone', 'water-soil', 'expand-land', 'build-residence'];
function commandFor(state, id) {
  if (id.startsWith('gather-'))
    return {
      type: 'gatherNatural',
      resourceId: state.naturalResources.find(
        (r) => r.kind === (id === 'gather-soil' ? 'soil' : 'stone'),
      ).id,
    };
  if (id === 'water-soil')
    return soilWaterCommand(
      state.groundStacks.filter((p) => p.item === 'soil').map(({ x, z }) => ({ x, z })),
    );
  const source = state.groundStacks.find(
    (p) => p.item === 'mud' && p.amount === (id === 'expand-land' ? 9 : 1),
  );
  if (id === 'build-residence')
    return stackDropCommand(
      source,
      { kind: 'building', building: state.buildings.find((b) => b.kind === 'house') },
      state,
    );
  for (let z = 1; z < 127; z++)
    for (let x = 1; x < 127; x++) {
      if (g.isLandCell(x, z, state.mapSeed, state.terrainVersion, state.landExtensions)) continue;
      const command = stackDropCommand(source, { kind: 'ground', x, z }, state);
      if (command && g.dispatch(state, command, 60000).ok) return command;
    }
  throw new Error('No legal shore');
}
function fixture() {
  const state = structuredClone(baseline);
  const data = new Map();
  let denied = false,
    now = 60000;
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (denied && key === SAVE_KEY) throw new Error('disk full');
      data.set(key, value);
    },
    removeItem: (key) => data.delete(key),
  };
  const session = new GameSession(
    storage,
    () => now,
    () => state,
  );
  assert.equal(session.save(), true);
  return {
    session,
    data,
    storage,
    setDenied: (v) => {
      denied = v;
    },
    setNow: (v) => {
      now = v;
    },
  };
}
for (const id of ids)
  test(`demo ${id} discovers only after real successful execution and survives reload`, () => {
    const f = fixture(),
      before = g.exportSave(f.session.state),
      bytes = f.data.get(SAVE_KEY);
    let command = commandFor(f.session.state, id);
    assert.equal(
      handbookView(f.session.state).entries.find((e) => e.recipe.id === id).discovered,
      false,
    );
    for (let i = 0; i < 3; i++) assert.equal(f.session.reason(command), null);
    assert.equal(
      g.exportSave(f.session.state),
      before,
      'Repeated valid hover previews never discover',
    );
    assert.equal(f.data.get(SAVE_KEY), bytes, 'Preview never writes storage');
    f.setNow(60100);
    if (id === 'build-residence') {
      assert.equal(command.type, 'attachMaterial');
      assert.equal(f.session.run(command), true, f.session.message);
      assert.equal(
        f.session.state.buildings.find((b) => b.id === command.buildingId).kind,
        'house',
      );
      assert.equal(f.session.state.fusion.discoveries[id], undefined);
      assert.equal(
        f.session.run({ type: 'buildResidence', buildingId: command.buildingId }),
        false,
      );
      command = { type: 'useTool', tool: 'hammer', buildingId: command.buildingId };
      const staged = g.exportSave(f.session.state),
        saved = f.data.get(SAVE_KEY);
      for (let i = 0; i < 3; i++) assert.equal(f.session.reason(command), null);
      assert.equal(g.exportSave(f.session.state), staged);
      assert.equal(f.data.get(SAVE_KEY), saved);
    }
    assert.equal(f.session.run(command), true, f.session.message);
    assert.deepEqual(f.session.state.fusion.discoveries, {
      [id]: { count: 1, firstDiscoveredAt: 60100 },
    });
    assert.match(f.session.message, /图鉴新发现/);
    const after = f.session.state,
      view = handbookView(after);
    assert.equal(view.progress, 1);
    assert.equal(view.entries.find((e) => e.recipe.id === id).discovered, true);
    assert.deepEqual(g.importSave(f.data.get(SAVE_KEY), 60100), after);
    const restored = new GameSession(f.storage, () => 60100);
    assert.deepEqual(handbookView(restored.state), view);
    assert.equal(g.exportSave(baseline), before, 'All demo input objects remain untouched');
  });
for (const id of ids)
  test(`${id} rejected operation cannot create or change a discovery`, () => {
    const f = fixture();
    let command = commandFor(f.session.state, id);
    if (id.startsWith('gather-')) {
      f.session.state.inventory = emptyStock();
      f.session.state.inventory.wood = g.getCapacity(f.session.state);
      f.session.state.nextId = 1_000_000_000; // Drop IDs cannot be allocated; full warehouse alone no longer blocks mining.
    } else if (id === 'water-soil')
      f.session.state.groundStacks.find((p) => p.item === 'soil').amount = 1;
    else if (id === 'expand-land')
      f.session.state.groundStacks.find((p) => p.item === 'mud' && p.amount === 9).amount = 8;
    else
      command = {
        type: 'useTool',
        tool: 'hammer',
        buildingId: f.session.state.buildings.find((b) => b.kind === 'warehouse').id,
      };
    assert.equal(f.session.save(), true);
    const before = g.exportSave(f.session.state),
      bytes = f.data.get(SAVE_KEY);
    assert.equal(typeof f.session.reason(command), 'string');
    assert.equal(f.session.run(command), false);
    assert.equal(g.exportSave(f.session.state), before);
    assert.equal(f.data.get(SAVE_KEY), bytes);
    assert.equal(handbookView(f.session.state).progress, 0);
  });
test('all five real operations compose and preserve legacy and earlier discoveries across saves', () => {
  let state = structuredClone(baseline);
  state.fusion.discoveries['gather-wood'] = { count: 2, firstDiscoveredAt: 100 };
  state.fusion.discoveries['merge-cold'] = { count: 7, firstDiscoveredAt: 90 };
  for (const [index, id] of ids.entries()) {
    const result = g.dispatch(state, commandFor(state, id), 60000 + index);
    assert.equal(result.ok, true, result.error);
    state = g.importSave(g.exportSave(result.state), 60000 + index);
    if (id === 'build-residence') {
      assert.equal(state.fusion.discoveries[id], undefined);
      const buildingId = state.buildings.find(
        (b) => b.kind === 'house' && state.fusion.attachments[b.id]?.mud === 1,
      ).id;
      const hammered = g.dispatch(
        state,
        { type: 'useTool', tool: 'hammer', buildingId },
        60000 + index,
      );
      assert.equal(hammered.ok, true, hammered.error);
      state = g.importSave(g.exportSave(hammered.state), 60000 + index);
    }
  }
  assert.equal(handbookView(state).progress, 6);
  assert.deepEqual(state.fusion.discoveries['gather-wood'], { count: 2, firstDiscoveredAt: 100 });
  assert.deepEqual(state.fusion.discoveries['merge-cold'], { count: 7, firstDiscoveredAt: 90 });
  assert.equal(handbookView(state).entries.length, 38);
});
test('stone discovery includes the final removed cube and only announces once', () => {
  let state = structuredClone(baseline);
  const rock = state.naturalResources.find((r) => r.kind === 'stone'),
    count = rock.amount;
  const command = { type: 'gatherNatural', resourceId: rock.id };
  for (let index = 0; index < count; index++) {
    const result = g.dispatch(state, command, 60100 + index);
    assert.equal(result.ok, true, result.error);
    assert.equal(
      result.events.filter((e) => e.startsWith('图鉴新发现')).length,
      index === 0 ? 1 : 0,
    );
    state = result.state;
    assert.deepEqual(state.fusion.discoveries['gather-stone'], {
      count: index + 1,
      firstDiscoveredAt: 60100,
    });
  }
  assert.equal(
    state.naturalResources.some((r) => r.id === rock.id),
    false,
  );
  const before = g.exportSave(state),
    result = g.dispatch(state, command, 60200);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(g.exportSave(state), before);
});
test('old saves missing new discoveries stay unknown; absent extension and malformed records are safe', () => {
  const raw = JSON.parse(g.exportSave(baseline));
  raw.fusion.discoveries['gather-wood'] = { count: 3, firstDiscoveredAt: 0 };
  const old = JSON.stringify(raw),
    restored = g.importSave(old, 60000);
  assert.equal(g.exportSave(restored), old);
  for (const id of ids) assert.equal(restored.fusion.discoveries[id], undefined);
  delete raw.fusion;
  assert.throws(() => g.importSave(JSON.stringify(raw), 60000), 'Current schema10 remains strict');
  const legacy = JSON.parse(g.exportSave(g.createGame(60000, 1, 1)));
  legacy.schemaVersion = 8;
  delete legacy.fusion;
  delete legacy.looseDrops;
  for (const item of ['rice', 'sapling', 'milledRice', 'flour', 'bread', 'roastedCarrot'])
    delete legacy.inventory[item];
  assert.deepEqual(g.importSave(JSON.stringify(legacy), 60000).fusion, {
    attachments: {},
    discoveries: {},
  });
  for (const id of ids)
    for (const value of [
      null,
      [],
      { count: 0, firstDiscoveredAt: 0 },
      { count: 1, firstDiscoveredAt: 60001 },
      { count: 1.5, firstDiscoveredAt: 0 },
    ]) {
      const invalid = JSON.parse(old);
      invalid.fusion.discoveries[id] = value;
      assert.throws(() => g.importSave(JSON.stringify(invalid), 60000));
    }
});
test('natural-material projection uses actual soil mounds and stone columns without discovering them', () => {
  const before = g.exportSave(baseline);
  for (const [id, kind] of [
    ['gather-soil', 'soil'],
    ['gather-stone', 'stone'],
  ]) {
    const entry = handbookEntry(
      baseline,
      ACTIVE_RECIPE_DEFINITIONS.find((r) => r.id === id),
    );
    assert.equal(entry.discovered, false);
    assert.equal(
      entry.materials[0].available,
      baseline.naturalResources.filter((r) => r.kind === kind).length,
    );
  }
  assert.equal(g.exportSave(baseline), before);
});
test('failed persistence keeps old discovery bytes; save retry records exactly the completed operation', () => {
  const f = fixture(),
    original = f.data.get(SAVE_KEY),
    command = commandFor(f.session.state, 'water-soil');
  f.setDenied(true);
  assert.equal(f.session.run(command), true, 'Existing in-memory-play behavior is preserved');
  assert.equal(f.session.hasUnsavedChanges, true);
  assert.equal(f.data.get(SAVE_KEY), original);
  assert.equal(f.session.state.fusion.discoveries['water-soil'].count, 1);
  f.setDenied(false);
  assert.equal(f.session.save(), true);
  assert.deepEqual(g.importSave(f.data.get(SAVE_KEY), 60000), f.session.state);
  assert.equal(f.session.run(command), false, 'Old consumed sources cannot be replayed');
  assert.equal(f.session.state.fusion.discoveries['water-soil'].count, 1);
});
