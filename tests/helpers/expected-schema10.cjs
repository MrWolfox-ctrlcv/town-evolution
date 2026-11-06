const assert = require('node:assert/strict');

// Deliberately independent of the runtime's item list and save importer.
const stockDefaults = {
  vegetable: 0,
  wheat: 0,
  lettuce: 0,
  rice: 0,
  chilledVegetable: 0,
  wood: 0,
  stone: 0,
  soil: 0,
  mud: 0,
  treeSeed: 0,
  sapling: 0,
  milledRice: 0,
  flour: 0,
  bread: 0,
  roastedCarrot: 0,
};

/** Expected additive migration only. Never use the importer to generate its own expected result. */
function expectedSchema10(raw) {
  assert.ok(raw.schemaVersion === 8 || raw.schemaVersion === 9);
  const expected = structuredClone(raw);
  expected.schemaVersion = 10;
  if (raw.schemaVersion === 8) expected.looseDrops ??= [];
  const migrateStock = (stock) =>
    raw.schemaVersion === 8
      ? { ...stockDefaults, ...stock }
      : { ...stock, roastedCarrot: stock.roastedCarrot ?? 0 };
  expected.inventory = migrateStock(expected.inventory);
  for (const group of [
    expected.commerce.shopStock,
    expected.commerce.dockCargo,
    expected.fusion.attachments,
  ])
    for (const [id, stock] of Object.entries(group)) group[id] = migrateStock(stock);
  for (const shipment of Object.values(expected.commerce.shipments)) {
    shipment.cargo = migrateStock(shipment.cargo);
    if (shipment.unitPrices) shipment.unitPrices = migrateStock(shipment.unitPrices);
  }
  for (const building of expected.buildings)
    if (building.collectionBox)
      building.collectionBox.stock = migrateStock(building.collectionBox.stock);
  return expected;
}
module.exports = { expectedSchema10 };
