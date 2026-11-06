const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withLegacyBuilding } = require('./helpers/legacy-town.cjs');
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
    // Higher bits avoid correlating building/command choices through the LCG low bits.
    return (seed >>> 8) % limit;
  };
  let state = withLegacyBuilding(createGame(0), { kind: 'cooler', x: 5, z: 3 });
  state = withLegacyBuilding(state, { kind: 'orderBoard', x: 2, z: 5 });
  let now = 0;
  let accepted = 0;
  const acceptedByType = new Map();
  for (let step = 0; step < 3000; step++) {
    now += random(20000);
    const building = state.buildings[random(state.buildings.length)];
    const looseDrop = state.looseDrops[random(Math.max(1, state.looseDrops.length))];
    const candidates = [
      { type: 'pickupDrop', dropId: looseDrop?.id ?? 'missing' },
      { type: 'start', buildingId: building.id },
      { type: 'collect', buildingId: building.id },
      { type: 'sell', orderId: random(2) ? 'vegetable' : 'chilledVegetable' },
      { type: 'buyCrop', item: 'vegetable', quantity: 1 },
      { type: 'recoverCrop' },
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
    const command = candidates[random(candidates.length)];
    const result = dispatch(state, command, now);
    assert.equal(exportSave(state), before, `Input mutated on step ${step}`);
    if (!result.ok) {
      assert.equal(result.state, state);
      continue;
    }
    accepted++;
    acceptedByType.set(command.type, (acceptedByType.get(command.type) ?? 0) + 1);
    state = result.state;
    assert.ok(state.coins >= 0 && Number.isSafeInteger(state.coins));
    assert.ok(getUsedStorage(state) <= getCapacity(state));
    assert.deepEqual(importSave(exportSave(state), state.lastSeenAt), state);
  }
  assert.ok(
    accepted > 100,
    `production, explicit pickup and trade exercised ${accepted} successful transitions`,
  );
  for (const type of ['collect', 'pickupDrop', 'sell'])
    assert.ok(acceptedByType.get(type) > 0, `${type} was exercised successfully`);
});
