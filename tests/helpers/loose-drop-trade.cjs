const assert = require('node:assert/strict');
const g = require('../../.domain-build/domain/game');
const { emptyStock } = require('../../.domain-build/domain/commerce');
const { withLegacyBuildingAtFreeCell } = require('./legacy-town.cjs');
const { dropSnapshot } = require('../../.domain-build/application/DropSnapshot');
function fixture(crop = 'vegetable') {
  let state = g.createGame(1000, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.coins = 500;
  state = withLegacyBuildingAtFreeCell(state, 'shop');
  state = withLegacyBuildingAtFreeCell(state, 'dock');
  const farm = state.buildings.find((b) => b.kind === 'farm');
  if (crop === 'rice') farm.irrigated = true;
  state.inventory = { ...emptyStock(), [crop]: 1 };
  state = apply(state, { type: 'plantCell', buildingId: farm.id, cell: 0, crop });
  const result = g.dispatch(state, { type: 'harvestCell', buildingId: farm.id, cell: 0 }, 16000);
  assert.ok(result.ok, result.error);
  state = result.state;
  assert.equal(state.looseDrops.length, 1);
  return {
    state,
    shop: state.buildings.find((b) => b.kind === 'shop'),
    dock: state.buildings.find((b) => b.kind === 'dock'),
    farm: state.buildings.find((b) => b.kind === 'farm'),
    drop: state.looseDrops[0],
  };
}
function trade(f, kind) {
  const cargo = {
    buildingId: f[kind].id,
    item: f.drop.item,
    quantity: f.drop.amount,
    source: { type: 'drop', drop: dropSnapshot(f.drop) },
  };
  return kind === 'shop'
    ? { type: 'shopTrade', ...cargo, side: 'sell' }
    : { type: 'dockTransfer', ...cargo, direction: 'stage' };
}
function merge(state, drop = state.looseDrops[0]) {
  return {
    type: 'mergeStockIntoDrop',
    source: { item: drop.item, amount: state.inventory[drop.item] },
    target: dropSnapshot(drop),
  };
}
function apply(state, command) {
  const bytes = g.exportSave(state);
  const result = g.dispatch(state, command, state.lastSeenAt);
  assert.ok(result.ok, result.error);
  assert.equal(g.exportSave(state), bytes);
  assert.deepEqual(g.importSave(g.exportSave(result.state), result.state.lastSeenAt), result.state);
  return result.state;
}
function reject(state, command) {
  const bytes = g.exportSave(state);
  const result = g.dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(g.exportSave(state), bytes);
}
module.exports = { fixture, trade, merge, apply, reject };
