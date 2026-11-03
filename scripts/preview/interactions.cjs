/** Read rendered Cocos nodes; drive behavior only through browser pointer/touch input. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, until, ready, driver } = require('./ui-driver.cjs');
module.exports = async function interactions(page, evidence, name, touch) {
  const { click, button } = driver(page, touch);
  const initial = await inspect(page);
  assert.ok(initial.labels.some((label) => label.text.includes('金币 120')));
  await click(initial.farm);
  await button('开始种植');
  const started = await until(
    page,
    (state) => state.save?.buildings.some((building) => building.kind === 'farm' && building.job),
    'crop scheduled and saved',
  );
  const job = started.save.buildings.find((building) => building.kind === 'farm').job;
  await page.screenshot({ path: path.join(evidence, `${name}-crop-seedling.png`) });
  await button('领取产物'); // early collection must not change the scheduled job
  await button('领取产物');
  assert.deepEqual(
    (await inspect(page)).save.buildings.find((building) => building.kind === 'farm').job,
    job,
  );
  await page.reload();
  await ready(page);
  await click((await inspect(page)).farm);
  await until(
    page,
    (state) => state.labels.some((label) => label.text.includes('生产完成')),
    'real crop timer finishes after reload',
    25000,
  );
  await page.screenshot({ path: path.join(evidence, `${name}-crop-ready.png`) });
  await button('领取产物');
  await until(page, (state) => state.save?.inventory.vegetable === 4, 'four vegetables collected');
  await button('订单');
  await button('蔬菜 4');
  await until(
    page,
    (state) => state.save?.coins === 144 && state.save.completedOrders === 1,
    'order pays exactly once',
  );
  await button('蔬菜 4'); // no stock, therefore must not pay twice
  assert.equal((await inspect(page)).save.coins, 144);
  await button('建造');
  await button('菜地 ·');
  await button('取消建造');
  assert.equal((await inspect(page)).save.coins, 144);
  await button('工具');
  await button('重新开始');
  await button('取消');
  assert.equal((await inspect(page)).save.coins, 144);
  await page.reload();
  await ready(page);
  const restored = await inspect(page);
  assert.equal(restored.save.coins, 144);
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
          'start crop',
          'reject early repeated collect',
          'reload during production',
          'real timer harvest',
          'sell order',
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
