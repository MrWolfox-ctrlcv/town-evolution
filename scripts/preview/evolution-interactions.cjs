/** Exercise the actual modular building evolution UI after the crop/order smoke test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, until, ready, worldPoint, driver } = require('./ui-driver.cjs');
module.exports = async function evolution(page, evidence, name, touch) {
  const { click, button } = driver(page, touch);
  const selected = async (id) => {
    const state = await inspect(page);
    await click(state.buildings.find((building) => building.id === id));
  };
  const start = await inspect(page);
  const warehouse = start.save.buildings.find((building) => building.kind === 'warehouse');
  const farm = start.save.buildings.find((building) => building.kind === 'farm');
  assert.equal(start.save.coins, 144);
  await button('建造');
  await button('制冷设施 ·');
  // Place beside the existing 2×2 warehouse, between it and the farm.
  const tile = { x: warehouse.x + 2, z: warehouse.z };
  await click(await worldPoint(page, { x: tile.x + 0.5, z: tile.z + 0.5 }));
  await until(
    page,
    (state) => state.labels.some((label) => label.text.includes('可建造')),
    'valid adjacent ghost',
  );
  assert.equal((await inspect(page)).save.coins, 144, 'Preview cannot spend coins');
  await button('确认建造');
  const placed = await until(
    page,
    (state) => state.save?.buildings.some((building) => building.kind === 'cooler'),
    'cooler confirmed',
  );
  assert.equal(placed.save.coins, 104);
  const cooler = placed.save.buildings.find((building) => building.kind === 'cooler');
  assert.equal(cooler.x, tile.x);
  assert.equal(cooler.z, tile.z);
  await selected(warehouse.id);
  await button('组合冷库');
  const combined = await until(
    page,
    (state) =>
      state.save?.buildings.some(
        (building) => building.id === warehouse.id && building.kind === 'coldWarehouse',
      ),
    'warehouse identity retained on combine',
  );
  assert.equal(combined.save.coins, 84);
  assert.equal(combined.save.buildings.length, 2);
  assert.ok(!combined.save.buildings.some((building) => building.id === cooler.id));
  await page.screenshot({ path: path.join(evidence, `${name}-combined.png`) });
  await selected(farm.id);
  await button('开始种植');
  await until(
    page,
    (state) => state.labels.some((label) => label.text.includes('生产完成')),
    'real second crop timer',
    25000,
  );
  await button('领取产物');
  await until(page, (state) => state.save?.inventory.vegetable === 4, 'fresh processing inputs');
  await selected(warehouse.id);
  await button('加工 ·');
  const processing = await until(
    page,
    (state) => state.save?.buildings.find((building) => building.id === warehouse.id)?.job,
    'cold job saved',
  );
  assert.equal(processing.save.inventory.vegetable, 2);
  await page.reload();
  await ready(page);
  await selected(warehouse.id);
  await until(
    page,
    (state) => state.labels.some((label) => label.text.includes('生产完成')),
    'real cold timer survives reload',
    20000,
  );
  await button('领取产物');
  await until(
    page,
    (state) => state.save?.inventory.chilledVegetable === 2,
    'cold output collected',
  );
  await button('订单');
  await button('冷藏菜 2');
  const sold = await until(
    page,
    (state) => state.save?.coins === 108 && state.save.completedOrders === 2,
    'chilled order paid',
  );
  assert.equal(sold.save.inventory.chilledVegetable, 0);
  assert.equal(sold.save.inventory.vegetable, 2);
  await page.reload();
  await ready(page);
  assert.equal(
    (await inspect(page)).save.buildings.find((building) => building.id === warehouse.id).kind,
    'coldWarehouse',
  );
  await selected(warehouse.id);
  await page.screenshot({ path: path.join(evidence, `${name}-cold-order.png`) });
  const coldState = (await inspect(page)).save;

  // Exercise the separate expansion branch using the real confirmed-new-town flow.
  await button('工具');
  await button('重新开始');
  await button('确认重置进度');
  const reset = await until(
    page,
    (state) => state.save?.coins === 120 && state.save.completedOrders === 0,
    'confirmed fresh town',
  );
  const freshWarehouse = reset.save.buildings.find((building) => building.kind === 'warehouse');
  await selected(freshWarehouse.id);
  await button('扩容 ·');
  const expanded = await until(
    page,
    (state) =>
      state.save?.buildings.some(
        (building) => building.id === freshWarehouse.id && building.kind === 'expandedWarehouse',
      ),
    'expansion preserves warehouse identity',
  );
  assert.equal(expanded.save.coins, 80);
  assert.ok(!expanded.labels.some((label) => label.action && label.text.includes('扩容 ·')));
  assert.ok(expanded.labels.some((label) => label.text.includes('0/32')));
  await page.reload();
  await ready(page);
  assert.equal((await inspect(page)).save.coins, 80);
  await selected(freshWarehouse.id);
  await page.screenshot({ path: path.join(evidence, `${name}-expanded.png`) });
  fs.writeFileSync(
    path.join(evidence, `${name}-evolution.json`),
    JSON.stringify(
      {
        passed: true,
        input: touch ? 'touch' : 'mouse',
        checks: [
          'adjacent placement ghost does not spend',
          'confirm cooler spends once',
          'combine preserves warehouse ID and consumes cooler',
          'crop inputs',
          'cold processing real timer',
          'cold reload and harvest',
          'chilled order',
          'evolution persistence',
          'confirmed fresh town',
          'one-time expansion and capacity',
          'expanded persistence',
        ],
        coldState,
        expandedState: (await inspect(page)).save,
      },
      null,
      2,
    ),
  );
};
