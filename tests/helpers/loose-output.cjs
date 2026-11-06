const assert = require('node:assert/strict');
const { dispatch, exportSave, cropDropAnchor } = require('../../.domain-build/domain/game');

function looseAmount(state, item) {
  return state.looseDrops.reduce((sum, drop) => sum + (drop.item === item ? drop.amount : 0), 0);
}
/** An explicit player pickup step, not part of harvesting, mining or the test dispatch helper. */
function pickupDrops(state, predicate = () => true) {
  for (const drop of state.looseDrops.filter(predicate)) {
    const before = exportSave(state);
    const result = dispatch(state, { type: 'pickupDrop', dropId: drop.id }, state.lastSeenAt);
    assert.equal(result.ok, true, result.error);
    assert.equal(exportSave(state), before, 'Pickup must not mutate the previous snapshot');
    assert.equal(result.state.inventory[drop.item], state.inventory[drop.item] + drop.amount);
    assert.equal(
      result.state.looseDrops.some((next) => next.id === drop.id),
      false,
    );
    state = result.state;
  }
  return state;
}
/** Check quantity and exact originating cells independently of any inventory collection. */
function assertCropDrops(state, farm, cells, crop, amount = 2) {
  const drops = state.looseDrops.filter(
    (drop) =>
      drop.source.type === 'crop' &&
      drop.source.buildingId === farm.id &&
      cells.includes(drop.source.cell),
  );
  assert.equal(drops.length, cells.length);
  assert.deepEqual(
    drops.map((drop) => drop.source.cell).sort((a, b) => a - b),
    [...cells].sort((a, b) => a - b),
  );
  for (const drop of drops) {
    assert.equal(drop.item, crop);
    assert.equal(drop.amount, amount);
    assert.deepEqual({ x6: drop.x6, z6: drop.z6 }, cropDropAnchor(farm, drop.source.cell));
    assert.equal(state.buildings.find((b) => b.id === farm.id).cropJobs[drop.source.cell], null);
  }
  assert.equal(
    drops.reduce((sum, drop) => sum + drop.amount, 0),
    cells.length * amount,
  );
}
module.exports = { looseAmount, pickupDrops, assertCropDrops };
