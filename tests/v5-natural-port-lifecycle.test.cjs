const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { getV5Hydrology } = require('../.domain-build/domain/v5-hydrology');
const { validatePlacement } = require('../.domain-build/domain/geometry');
const { v5DockBerthCells } = require('../.domain-build/domain/v5-marine');
const { hammerAssemblyCommand } = require('./helpers/hammer-assembly.cjs');
const seeds = [1, 17, 1937, 42173, 999999937, 1000000000];
function fixture(seed) {
  const state = g.createGame(0, seed, 5),
    h = getV5Hydrology(seed),
    a = h.feature.anchor;
  const pier = { id: 'b3', kind: 'woodenPier', x: a.x, z: a.z, rotation: h.feature.rotation };
  validatePlacement(state, pier);
  state.buildings.push(pier);
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
  return { state, h, pier };
}
for (const seed of seeds)
  test(`v5 natural shore ${seed}: existing explicit dock assembly without reclamation or free boat`, () => {
    const { state, h, pier } = fixture(seed),
      before = JSON.stringify(state),
      coins = state.coins,
      inventory = { ...state.inventory },
      hammer = state.tools.hammer;
    assert.equal(state.landExtensions.length, 0);
    assert.equal(h.feature.generatedObjects, 0);
    assert.ok(
      !g
        .createGame(0, seed, 5)
        .buildings.some((b) => b.kind === 'dock' || b.kind === 'woodenPier' || b.kind === 'boat'),
    );
    const result = g.dispatch(state, hammerAssemblyCommand(state, ['b3', 'b4', 'b5']), 0);
    assert.ok(result.ok, result.error);
    assert.equal(JSON.stringify(state), before);
    const s = result.state,
      dock = s.buildings.find((b) => b.id === 'b3');
    assert.equal(dock.kind, 'dock');
    assert.equal(dock.dockStyle, 'simple');
    assert.equal(dock.boatAttached, undefined);
    assert.deepEqual([dock.x, dock.z, dock.rotation], [pier.x, pier.z, pier.rotation]);
    assert.equal(s.landExtensions.length, 0);
    assert.equal(s.coins, coins);
    assert.deepEqual(s.inventory, inventory);
    assert.equal(s.tools.hammer, hammer, 'existing hammer policy has unlimited durability');
    assert.ok(!s.buildings.some((b) => b.id === 'b4' || b.id === 'b5' || b.kind === 'boat'));
    assert.deepEqual(s.trees, state.trees);
    assert.deepEqual(s.naturalResources, state.naturalResources);
    assert.ok(g.hasDockExit(s, dock));
    assert.ok(g.isDockShore(dock, seed, 5, []));
    assert.ok(v5DockBerthCells(dock).every((p) => h.at(p.x, p.z).seaDockWater));
    for (const p of [...s.trees, ...s.naturalResources])
      assert.equal(h.reserveCell(p.x, p.z), false);
    assert.deepEqual(g.importSave(g.exportSave(s), 0), s);
    const attack = { ...s, landExtensions: v5DockBerthCells(dock) };
    assert.equal(g.hasDockExit(attack, dock), false);
    assert.throws(() => g.importSave(JSON.stringify(attack), 0));
  });
test('new natural marine-origin cells use explicit geometry evidence rather than forged soft-distance fields', () => {
  const h = getV5Hydrology(42173),
    b = h.featureBounds;
  let changed = 0;
  for (let z = Math.floor(b.z0); z < Math.ceil(b.z1); z++)
    for (let x = Math.floor(b.x0); x < Math.ceil(b.x1); x++) {
      const c = h.at(x, z);
      if (!c) continue;
      assert.deepEqual(h.fields(x + 0.5, z + 0.5), h.base.fields(x + 0.5, z + 0.5));
      if (c.seaDockWater && !h.base.at(x, z).seaDockWater) {
        changed++;
        assert.equal(c.certificate.kind, 'natural-cliff-prism');
        assert.ok(c.certificate.bedUpperBound <= -1.085);
        assert.ok(h.isMarineOriginCell(x, z));
      }
    }
  assert.ok(changed > 0);
});
