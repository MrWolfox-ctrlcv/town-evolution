const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  dispatch,
  exportSave,
  importSave,
  getCapacity,
  getUsedStorage,
} = require('../.domain-build/domain/game.js');

test('seeded mixed commands preserve state invariants through 3000 transitions', () => {
  let seed = 20261103;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  let state = createGame(0);
  let now = 0;
  for (let step = 0; step < 3000; step++) {
    now += random(20000);
    const building = state.buildings[random(state.buildings.length)];
    const candidates = [
      { type: 'start', buildingId: building.id },
      { type: 'collect', buildingId: building.id },
      { type: 'sell', orderId: random(2) ? 'vegetable' : 'chilledVegetable' },
      { type: 'upgrade', buildingId: building.id, target: 'expandedWarehouse' },
      { type: 'combine', warehouseId: building.id, coolerId: 'b3' },
      {
        type: 'place',
        kind: ['farm', 'warehouse', 'cooler'][random(3)],
        x: random(14) - 1,
        z: random(14) - 1,
      },
    ];
    const before = exportSave(state);
    const result = dispatch(state, candidates[random(candidates.length)], now);
    assert.equal(exportSave(state), before, `Input mutated on step ${step}`);
    if (!result.ok) {
      assert.equal(result.state, state);
      continue;
    }
    state = result.state;
    assert.ok(state.coins >= 0 && Number.isSafeInteger(state.coins));
    assert.ok(getUsedStorage(state) <= getCapacity(state));
    assert.deepEqual(importSave(exportSave(state), state.lastSeenAt), state);
  }
});
