/** Prepared schema10 real-pointer checks; no injected state, commands or fake elapsed time. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { inspect, until, ready, driver } = require('./ui-driver.cjs');
const stockDrop = require('./stock-input.cjs');
module.exports = async (page, evidence, name, touch, { showTool }) => {
  const { click, button, townActions } = driver(page, touch);
  await townActions();
  await button('查看全岛');
  let view = await inspect(page);
  const barrel = view.save.buildings.find((b) => b.kind === 'compostBarrel');
  const oven = view.save.buildings.find((b) => b.kind === 'stoneOven');
  assert.ok(barrel && oven, 'Separate barrel and stone oven demonstrations exist');
  assert.equal(barrel.compost.stock.treeSeed, 1, 'One explicit initial waiting input');
  assert.ok(
    view.save.inventory.treeSeed >= 2,
    'Two shown seeds available for start and withdrawal checks',
  );
  await showTool('TreeSeedStock', 'ProductsRightNext');
  const before = (await inspect(page)).save;
  await stockDrop(page, 'TreeSeedStock', barrel.id, touch, 'cancel');
  assert.deepEqual((await inspect(page)).save, before, 'Cancelled compost deposit has no effect');
  await stockDrop(page, 'TreeSeedStock', barrel.id, touch);
  view = await until(
    page,
    (s) => !!s.save.buildings.find((b) => b.id === barrel.id).compost.job,
    'explicit one-seed deposit starts compost',
  );
  const job = view.save.buildings.find((b) => b.id === barrel.id).compost.job;
  assert.equal(view.save.inventory.treeSeed, before.inventory.treeSeed - 1);
  assert.deepEqual(job.inputs, [{ item: 'treeSeed', amount: 2 }]);
  await stockDrop(page, 'TreeSeedStock', barrel.id, touch);
  view = await inspect(page);
  assert.equal(view.save.buildings.find((b) => b.id === barrel.id).compost.stock.treeSeed, 1);
  await click(view.buildings.find((b) => b.id === barrel.id));
  await button('取回待加工树种 ×1');
  view = await until(
    page,
    (s) => s.save.inventory.treeSeed === before.inventory.treeSeed - 1,
    'only waiting input returns',
  );
  assert.deepEqual(view.save.buildings.find((b) => b.id === barrel.id).compost.job, job);
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, job.readyAt - Date.now()) + 200));
  await button(`领取肥料 ×${job.fertilizerYield}`);
  view = await until(
    page,
    (s) => s.save.tools.fertilizer === before.tools.fertilizer + job.fertilizerYield,
    'fertilizer is a finite tool quantity',
  );
  assert.equal(view.save.inventory.fertilizer, undefined);
  assert.equal(view.save.buildings.find((b) => b.id === barrel.id).compost.job, undefined);
  assert.ok(view.labels.some((l) => l.text.includes('肥料用途待设计')));
  await page.screenshot({ path: path.join(evidence, `${name}-compost-tool-output.png`) });
  const beforeRoast = view.save;
  await click(view.buildings.find((b) => b.id === oven.id));
  await button('胡萝卜2 → 烤胡萝卜1');
  view = await until(
    page,
    (s) =>
      s.save.buildings.find((b) => b.id === oven.id).processingJob?.recipeId === 'roast-carrot',
    'stone oven starts real roast',
  );
  const roast = view.save.buildings.find((b) => b.id === oven.id).processingJob;
  assert.equal(view.save.inventory.vegetable, beforeRoast.inventory.vegetable - 2);
  assert.equal(
    view.save.inventory.wood,
    beforeRoast.inventory.wood,
    'Roast has no added wood charge',
  );
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, roast.readyAt - Date.now()) + 200),
  );
  await button('领取烤胡萝卜 ×1');
  view = await until(
    page,
    (s) => s.save.inventory.roastedCarrot === beforeRoast.inventory.roastedCarrot + 1,
    'one roasted portion collected',
  );
  await page.screenshot({ path: path.join(evidence, `${name}-roasted-carrot-output.png`) });
  const saved = view.save;
  await page.reload();
  await ready(page);
  await button('游览演示岛');
  view = await until(
    page,
    (s) => [10, 11].includes(s.save?.schemaVersion),
    'supported save restart',
  );
  for (const key of ['inventory', 'tools', 'buildings', 'groundStacks', 'looseDrops'])
    assert.deepEqual(view.save[key], saved[key], `Compost/roast restart preserves ${key}`);
  return {
    cancelledDeposit: true,
    explicitSeedDeposit: true,
    onlyWaitingInputWithdrawn: true,
    realCompostTimer: true,
    fertilizerToolCount: true,
    stoneOvenTwoToOne: true,
    realRoastTimer: true,
    reload: true,
  };
};
