/** Read rendered Cocos nodes; drive behavior only through browser pointer/touch input. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, until, ready, driver, useTool } = require('./ui-driver.cjs');
const commerce = require('./commerce-driver.cjs');
module.exports = async function interactions(page, evidence, name, touch) {
  const { click, button, townActions } = driver(page, touch);
  const initial = await inspect(page);
  assert.ok(initial.labels.some((label) => label.text.includes('金币 120')));
  await click(initial.farm);
  await useTool(page, 'SeedTool', touch);
  const started = await until(
    page,
    (state) => state.save?.buildings.some((building) => building.kind === 'farm' && building.job),
    'crop scheduled and saved',
  );
  const job = started.save.buildings.find((building) => building.kind === 'farm').job;
  await page.screenshot({ path: path.join(evidence, `${name}-crop-seedling.png`) });
  await useTool(page, 'HarvestTool', touch); // early collection must not change the scheduled job
  await useTool(page, 'HarvestTool', touch);
  assert.deepEqual(
    (await inspect(page)).save.buildings.find((building) => building.kind === 'farm').job,
    job,
  );
  await page.reload();
  await ready(page);
  await click((await inspect(page)).farm);
  await until(
    page,
    (state) =>
      state.now >=
      state.save.buildings.find((building) => building.kind === 'farm').job.readyAt + 600,
    'real crop timer finishes after reload',
    25000,
  );
  await page.screenshot({ path: path.join(evidence, `${name}-crop-ready.png`) });
  await useTool(page, 'HarvestTool', touch);
  await until(page, (state) => state.save?.inventory.vegetable === 4, 'four vegetables collected');
  const farmId = (await inspect(page)).save.buildings.find(
    (building) => building.kind === 'farm',
  ).id;
  await commerce.crop(page, farmId, touch);
  await button('订单');
  await button('建造订单板');
  await click(await require('./ui-driver.cjs').worldPoint(page, { x: 1.5, z: 7.5 }));
  await button('确认建造');
  const boardState = await until(
    page,
    (state) => state.save?.buildings.some((building) => building.kind === 'orderBoard'),
    'physical free order board',
  );
  assert.equal(boardState.save.coins, 120, 'Order board is free');
  await commerce.select(
    page,
    boardState.save.buildings.find((building) => building.kind === 'orderBoard').id,
    touch,
  );
  await button('菜 8');
  await until(
    page,
    (state) => state.save?.coins === 176 && state.save.completedOrders === 1,
    'order pays exactly once',
  );
  await button('菜 8'); // no stock, therefore must not pay twice
  assert.equal((await inspect(page)).save.coins, 176);
  await button('建造');
  await button('菜地 ·');
  await button('取消建造');
  assert.equal((await inspect(page)).save.coins, 176);
  await townActions();
  await button('重新开始');
  await button('取消');
  assert.equal((await inspect(page)).save.coins, 176);
  await page.reload();
  await ready(page);
  const restored = await inspect(page);
  assert.equal(restored.save.coins, 176);
  assert.equal(restored.save.completedOrders, 1);
  assert.equal(restored.save.inventory.vegetable, 0);
  await page.screenshot({ path: path.join(evidence, `${name}-after-play.png`) });
  fs.writeFileSync(
    path.join(evidence, `${name}-interaction.json`),
    JSON.stringify(
      {
        passed: true,
        input: touch ? 'touch' : 'mouse',
        checks: [
          'select farm',
          'drag seed tool to start crop',
          'reject early repeated collect',
          'reload during production',
          'drag sickle after real timer',
          'build free physical board and fulfill eight-crop order',
          'reject duplicate sale',
          'cancel construction',
          'cancel reset',
          'reload persisted progress',
        ],
        state: restored.save,
      },
      null,
      2,
    ),
  );
};
