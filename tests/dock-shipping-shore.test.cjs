/** Production rules and panel routing; this is not a rendered browser/device test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
const { initializeFacility } = require('../.domain-build/domain/commerce.js');
const { validatePlacement } = require('../.domain-build/domain/geometry.js');
const { GameSession } = require('../.domain-build/application/GameSession.js');
const { SAVE_KEY } = require('../.domain-build/domain/storage.js');
const ship = { type: 'dockShip', buildingId: 'b3', shipmentId: 1 };
const transfer = (direction, quantity = 1) => ({
  type: 'dockTransfer',
  buildingId: 'b3',
  item: 'vegetable',
  direction,
  quantity,
});
function run(state, command, now = state.lastSeenAt) {
  const before = game.exportSave(state);
  const result = game.dispatch(state, command, now);
  assert.equal(result.ok, true, result.error);
  assert.equal(game.exportSave(state), before);
  assert.deepEqual(game.importSave(game.exportSave(result.state), now), result.state);
  return result.state;
}
function rejected(state, command) {
  const before = game.exportSave(state);
  const result = game.dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, false);
  assert.match(result.error, /船坞出口必须朝向海面.*长按搬到临水海岸/);
  assert.equal(result.state, state);
  assert.equal(game.exportSave(state), before, 'Rejected launch changes no saved data');
}
function fixture(version, site = { x: 10, z: 10, rotation: 0 }) {
  const state = game.createGame(1000, 1, version);
  state.trees = [];
  state.naturalResources = [];
  state.inventory.vegetable = 4;
  const dock = { id: 'b3', kind: 'dock', ...site };
  state.buildings.push(dock);
  state.nextId = 4;
  initializeFacility(state.commerce, dock);
  const restored = game.importSave(game.exportSave(state), 1000);
  assert.deepEqual(restored, state, 'Import never moves or rewrites a historical dock');
  return restored;
}
function shoreline(version) {
  const state = fixture(version),
    sites = [];
  for (let z = 0; z < game.worldSize(version) && sites.filter(Boolean).length < 4; z++)
    for (let x = 0; x < game.worldSize(version); x++) {
      const dock = { id: 'b3', kind: 'dock', x, z, rotation: 0 };
      try {
        validatePlacement(state, dock);
      } catch {
        continue;
      }
      const facings = [0, 1, 2, 3].filter((rotation) =>
        game.isDockShore({ ...dock, rotation }, state.mapSeed, version, state.landExtensions),
      );
      if (facings.length === 1 && !sites[facings[0]])
        sites[facings[0]] = { x, z, rotation: facings[0] };
    }
  assert.equal(sites.filter(Boolean).length, 4, `v${version} has all four sea-facing coasts`);
  return sites;
}
const coasts = new Map([1, 2, 3, 4].map((version) => [version, shoreline(version)]));

for (const version of [1, 2, 3, 4]) {
  test(`v${version} permits new shipping in every coastal facing and rejects the other rotations`, () => {
    for (const site of coasts.get(version)) {
      for (const rotation of [0, 1, 2, 3]) {
        const state = run(fixture(version, { ...site, rotation }), transfer('stage', 2));
        if (rotation === site.rotation) {
          const sailed = run(state, ship);
          assert.equal(sailed.commerce.shipments.b3.cargo.vegetable, 2);
          assert.equal(sailed.commerce.shipments.b3.reward, 12);
          assert.equal(sailed.commerce.dockCargo.b3.vegetable, 0);
          assert.equal(sailed.coins, state.coins);
          assert.equal(sailed.inventory.vegetable, state.inventory.vegetable);
        } else {
          rejected(state, ship);
          const rotated = run(state, { type: 'rotateBuilding', buildingId: 'b3' });
          assert.equal(rotated.buildings.find((b) => b.id === 'b3').rotation, site.rotation);
          assert.deepEqual(rotated.commerce, state.commerce);
          assert.equal(run(rotated, ship).commerce.shipments.b3.cargo.vegetable, 2);
        }
      }
    }
  });
  test(`v${version} preserves inland saves, goods and tokens, allows unloading and coastal recovery`, () => {
    const initial = fixture(version);
    assert.equal(game.isDockShore(initial.buildings[2], 1, version), false);
    const staged = run(initial, transfer('stage', 2));
    rejected(staged, ship);
    const returned = run(staged, transfer('return', 2));
    assert.deepEqual(returned, initial);
    const moved = run(staged, {
      type: 'moveBuilding',
      buildingId: 'b3',
      ...coasts.get(version)[0],
    });
    assert.deepEqual(moved.commerce, staged.commerce);
    assert.deepEqual(moved.inventory, staged.inventory);
    assert.equal(run(moved, ship).commerce.shipmentId, 2);
  });
  test(`v${version} keeps historical inland voyages settleable offline exactly once`, () => {
    let state = run(run(fixture(version, coasts.get(version)[0]), transfer('stage', 2)), ship);
    state = run(state, transfer('stage'));
    // Historical data is accepted as-is; loading must not discard paid-for/in-transit goods.
    const raw = JSON.parse(game.exportSave(state));
    Object.assign(
      raw.buildings.find((b) => b.id === 'b3'),
      { x: 10, z: 10, rotation: 0 },
    );
    state = game.importSave(JSON.stringify(raw), 31000);
    assert.deepEqual(state.commerce, raw.commerce);
    assert.equal(game.isDockShore(state.buildings[2], 1, version), false);
    state = run(state, transfer('return'));
    const coins = state.coins,
      inventory = { ...state.inventory },
      receipt = { type: 'dockCollect', buildingId: 'b3', shipmentId: 1 };
    const settled = run(state, receipt);
    assert.equal(settled.coins, coins + 12);
    assert.deepEqual(settled.inventory, inventory);
    assert.equal(settled.commerce.shipments.b3, undefined);
    const replay = game.dispatch(settled, receipt, 31000);
    assert.equal(replay.ok, false);
    assert.equal(replay.state, settled);
    rejected(settled, { ...ship, shipmentId: 2 });
  });
}

function panel() {
  const dependencies = {
    '../domain/game': game,
    '../domain/island': require('../.domain-build/domain/island.js'),
    '../application/CommerceSelection': require('../.domain-build/application/CommerceSelection.js'),
  };
  const module = { exports: {} };
  const source = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/CommercePanel.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  new Function('require', 'module', 'exports', source)(
    (id) => {
      assert.ok(id in dependencies, id);
      return dependencies[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
test('real panel preview and GameSession agree, and rejected inland launch does not write the save', () => {
  const state = run(fixture(4), transfer('stage', 2)),
    values = new Map();
  let writes = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      writes++;
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };
  const session = new GameSession(
    storage,
    () => 1000,
    () => state,
  );
  assert.equal(session.save(), true);
  const saved = values.get(SAVE_KEY),
    savedWrites = writes,
    ui = { selected: 'b3', tradeItem: 'vegetable', quantity: 1 };
  const { commerceActions, commerceDescription } = panel();
  const handlers = { command: (command) => session.run(command), item() {}, quantity() {} };
  const launch = () => commerceActions(session, ui, handlers).find((a) => a.text === '发船 · 30秒');
  assert.match(commerceDescription(session, ui), /长按搬到临水海岸/);
  assert.equal(launch().enabled, false);
  assert.equal(launch().reason, session.reason(ship));
  assert.match(launch().reason, /船坞出口必须朝向海面.*长按搬到临水海岸/);
  launch().run(); // Even a stale/enabled button cannot bypass the same domain rule.
  assert.equal(writes, savedWrites);
  assert.equal(values.get(SAVE_KEY), saved);
  assert.deepEqual(session.state, state);
  assert.equal(session.message, launch().reason);
  assert.equal(
    commerceActions(session, ui, handlers).find((a) => a.text === '取回 1').enabled,
    true,
  );
  assert.equal(session.run({ type: 'moveBuilding', buildingId: 'b3', ...coasts.get(4)[0] }), true);
  assert.equal(launch().enabled, true);
  launch().run();
  assert.equal(session.state.commerce.shipments.b3.cargo.vegetable, 2);
  assert.deepEqual(game.importSave(values.get(SAVE_KEY), 1000), session.state);
});
