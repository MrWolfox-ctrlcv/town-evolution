const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { getV5Hydrology } = require('../.domain-build/domain/v5-hydrology');
const { validateV5Extensions } = require('../.domain-build/domain/v5-marine');
const { validatePlacement } = require('../.domain-build/domain/geometry');
const { hammerAssemblyCommand } = require('./helpers/hammer-assembly.cjs');
const { find } = require('./helpers/v5-coastal-dock.cjs');
function reject(state, command) {
  const before = JSON.stringify(state),
    r = g.dispatch(state, command, 0);
  assert.equal(r.ok, false);
  assert.equal(r.state, state);
  assert.equal(JSON.stringify(state), before);
}
for (const seed of [1, 17, 1937, 42173, 999999937, 1000000000])
  test(`v5 ${seed}: conservative reclamation and existing dock recipe, no implicit port`, () => {
    let state = g.createGame(0, seed, 5);
    const hydro = getV5Hydrology(seed),
      plan = find(seed);
    assert.deepEqual(
      state.buildings.map((b) => b.kind),
      ['warehouse', 'farm'],
    );
    const trees = JSON.stringify(state.trees),
      resources = JSON.stringify(state.naturalResources);
    const bedBefore = plan.fill.map((p) => hydro.sample(p.x + 0.5, p.z + 0.5).height);
    for (const p of plan.fill) {
      state.groundStacks.push({ x: 5, z: 8, item: 'mud', amount: 9 });
      const before = JSON.stringify(state),
        r = g.dispatch(state, { type: 'expandLand', fromX: 5, fromZ: 8, ...p }, 0);
      assert.ok(r.ok, r.error);
      assert.equal(JSON.stringify(state), before);
      state = r.state;
      assert.equal(state.groundStacks.length, 0);
      assert.ok(g.isLandCell(p.x, p.z, seed, 5, state.landExtensions));
      assert.deepEqual(g.terrainAt(p.x, p.z, seed, 5, state.landExtensions), {
        biome: 'plain',
        elevation: 0,
      });
    }
    assert.ok(
      bedBefore.some((h) => h < -0.62),
      'actually reclaims sea, not only dry beaches',
    );
    assert.equal(JSON.stringify(state.trees), trees);
    assert.equal(JSON.stringify(state.naturalResources), resources);
    assert.deepEqual(g.importSave(g.exportSave(state), 0), state);
    const reversed = { ...state, landExtensions: state.landExtensions.slice().reverse() };
    assert.deepEqual(g.importSave(g.exportSave(reversed), 0), reversed);
    const dock = {
      id: 'b3',
      kind: 'dock',
      dockStyle: 'simple',
      x: plan.x,
      z: plan.z,
      rotation: plan.rotation,
    };
    assert.ok(g.hasDockExit(state, dock));
    assert.ok(g.isDockShore(dock, seed, 5, state.landExtensions));
    // Fixture supplies explicit existing components; the real assembly command owns conversion.
    state.buildings.push({ ...dock, kind: 'woodenPier', dockStyle: undefined });
    for (const [id, kind] of [
      ['b4', 'crate'],
      ['b5', 'orderBoard'],
    ]) {
      let added = false;
      for (let z = 8; z < 30 && !added; z++)
        for (let x = 2; x < 30; x++) {
          const b = { id, kind, x, z, rotation: 0 };
          try {
            validatePlacement(state, b);
          } catch {
            continue;
          }
          state.buildings.push(b);
          added = true;
          break;
        }
      assert.ok(added);
    }
    state.nextId = 6;
    const coins = state.coins,
      assembly = g.dispatch(state, hammerAssemblyCommand(state, ['b3', 'b4', 'b5']), 0);
    assert.ok(assembly.ok, assembly.error);
    state = assembly.state;
    assert.equal(state.coins, coins);
    assert.equal(state.buildings.find((b) => b.id === 'b3').kind, 'dock');
    assert.equal(state.buildings.find((b) => b.id === 'b3').boatAttached, undefined);
    assert.ok(!state.buildings.some((b) => b.id === 'b4' || b.id === 'b5'));
    assert.deepEqual(g.importSave(g.exportSave(state), 0), state);
    state.groundStacks.push({ x: 5, z: 8, item: 'mud', amount: 9 });
    reject(state, { type: 'expandLand', fromX: 5, fromZ: 8, x: plan.x, z: plan.z + 2 });
    reject(state, { type: 'expandLand', fromX: 5, fromZ: 8, ...plan.fill[0] });
    for (const kind of ['lake', 'river']) {
      let p;
      for (let z = 1; z < 191 && !p; z++)
        for (let x = 1; x < 191; x++)
          if (hydro.at(x, z).waterKind === kind) {
            p = { x, z };
            break;
          }
      assert.ok(p);
      reject(state, { type: 'expandLand', fromX: 5, fromZ: 8, ...p });
      assert.throws(() => validateV5Extensions(seed, [...state.landExtensions, p]));
    }
    const invalid = JSON.parse(JSON.stringify(state));
    invalid.buildings.find((b) => b.id === 'b3').rotation = 2;
    assert.throws(() => g.importSave(JSON.stringify(invalid), 0));
    assert.deepEqual(
      plan.fill.map((p) => hydro.sample(p.x + 0.5, p.z + 0.5).height),
      bedBefore,
      'base hydrology never mutated',
    );
  });
test('v5 import rejects disconnected/duplicated/fresh-water/corrupt extensions without regenerating anything', () => {
  const seed = 42173,
    s = g.createGame(0, seed, 5),
    plan = find(seed),
    p = plan.fill[0];
  for (const cells of [[p, p], [{ x: 191, z: 50 }], [{ x: NaN, z: 2 }], [plan.fill.at(-1)]]) {
    assert.throws(() => validateV5Extensions(seed, cells));
    assert.throws(() => g.importSave(JSON.stringify({ ...s, landExtensions: cells }), 0));
  }
});

test('v5 a connected fill wall that seals the real bay is rejected atomically', () => {
  const seed = 42173,
    hydro = getV5Hydrology(seed),
    cells = [];
  for (let z = 60; z <= 115; z++) {
    const c = hydro.at(165, z),
      f = hydro.fields(165.5, z + 0.5);
    if (
      c.state !== 'dryBuildable' &&
      f.freshwater + Math.SQRT1_2 <= -4 &&
      f.ocean + Math.SQRT1_2 >= 0
    )
      cells.push({ x: 165, z });
  }
  assert.throws(() => validateV5Extensions(seed, cells), /外海/);
  let state = g.createGame(0, seed, 5),
    stopped = false;
  for (const p of cells) {
    state.groundStacks.push({ x: 5, z: 8, item: 'mud', amount: 9 });
    const before = JSON.stringify(state),
      r = g.dispatch(state, { type: 'expandLand', fromX: 5, fromZ: 8, ...p }, 0);
    if (!r.ok) {
      assert.match(r.error, /外海/);
      assert.equal(r.state, state);
      assert.equal(JSON.stringify(state), before);
      assert.equal(state.groundStacks[0].amount, 9);
      stopped = true;
      break;
    }
    state = r.state;
  }
  assert.ok(stopped, 'must not close the bay or spend the closing mud stack');
});

test('v5 protects the side berth, not only the four cells under the pier', () => {
  const { initializeFacility } = require('../.domain-build/domain/commerce');
  const seed = 42173,
    plan = find(seed);
  let state = g.createGame(0, seed, 5);
  state.landExtensions = plan.fill.map((p) => ({ ...p }));
  const dock = { id: 'b3', kind: 'dock', dockStyle: 'simple', x: plan.x, z: plan.z, rotation: 0 };
  state.buildings.push(dock);
  state.nextId = 4;
  initializeFacility(state.commerce, dock);
  state.groundStacks = [{ x: 5, z: 8, item: 'mud', amount: 9 }];
  const approach = { x: plan.x + 2, z: plan.z + 1 },
    r = g.dispatch(state, { type: 'expandLand', fromX: 5, fromZ: 8, ...approach }, 0);
  assert.ok(r.ok, r.error);
  state = r.state;
  assert.ok(g.hasDockExit(state, dock));
  state.groundStacks = [{ x: 5, z: 8, item: 'mud', amount: 9 }];
  const berth = { x: plan.x + 2, z: plan.z + 2 };
  reject(state, { type: 'expandLand', fromX: 5, fromZ: 8, ...berth });
  assert.throws(
    () =>
      g.importSave(
        JSON.stringify({ ...state, landExtensions: [...state.landExtensions, berth] }),
        0,
      ),
    /船坞/,
  );
});
