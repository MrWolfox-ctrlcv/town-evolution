/** Drag tools across real fields, including repeated visits and full-storage failures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, until, driver, worldPoint, useTool } = require('./ui-driver.cjs');
const commerce = require('./commerce-driver.cjs');
const { drag, dragPath } = require('./pointer-input.cjs');
module.exports = async function farming(page, evidence, name, touch) {
  const { button, click, townActions } = driver(page, touch);
  await townActions();
  await button('重新开始');
  await button('确认重置进度');
  await until(page, (state) => state.save?.coins === 120, 'fresh farming scenario');
  await button('建造');
  await button('菜地 ·');
  await click(await worldPoint(page, { x: 6.5, z: 6.5 }));
  await button('确认建造');
  const built = await until(
    page,
    (state) => state.save?.buildings.filter((b) => b.kind === 'farm').length === 2,
    'second field built',
  );
  assert.equal(built.save.coins, 100);
  assert.ok(
    built.labels.some((label) => label.text === '播种∞'),
    'Unlimited seed icon is visibly labelled',
  );
  assert.ok(
    built.labels.some((label) => label.text === '菜×0'),
    'Crop quantity is visible beside tools',
  );
  const farms = built.save.buildings.filter((b) => b.kind === 'farm').map((b) => b.id);
  const positions = (state) => farms.map((id) => state.buildings.find((b) => b.id === id));
  const sweep = async (toolName) => {
    const before = await inspect(page);
    const targets = positions(before);
    await dragPath(
      page,
      [before.tools.find((tool) => tool.name === toolName), ...targets, targets[0], targets[1]],
      touch,
    );
    const after = await inspect(page);
    assert.equal(after.cameraHeight, before.cameraHeight, 'Farm tool must not zoom map');
    positions(after).forEach((point, i) => {
      assert.ok(
        Math.hypot(point.x - targets[i].x, point.y - targets[i].y) < 2,
        'Farm tool must not pan map',
      );
    });
    return after;
  };
  const complete = () =>
    until(
      page,
      (state) =>
        farms.every((id) => {
          const job = state.save.buildings.find((b) => b.id === id).job;
          return job && state.now >= job.readyAt + 600;
        }),
      'real timers for both fields',
      25000,
    );
  // An invalid world target must not plant or spend; drop on the warehouse.
  const warehouse = built.save.buildings.find((b) => b.kind === 'warehouse');
  await drag(
    page,
    built.tools.find((t) => t.name === 'SeedTool'),
    built.buildings.find((b) => b.id === warehouse.id),
    touch,
  );
  assert.deepEqual((await inspect(page)).save, built.save);
  const first = await sweep('SeedTool');
  assert.equal(first.save.coins, 100, 'Seeds remain unlimited, not charged');
  assert.equal(first.save.buildings.filter((b) => b.job).length, 2);
  const scheduled = first.save.buildings.filter((b) => b.job).map((b) => b.job);
  await useTool(page, 'SeedTool', touch, farms[0]);
  assert.deepEqual(
    (await inspect(page)).save.buildings.filter((b) => b.job).map((b) => b.job),
    scheduled,
    'Planting a growing field must not restart its timer',
  );
  await sweep('HarvestTool');
  assert.equal((await inspect(page)).save.inventory.vegetable, 0, 'Sickle cannot harvest early');
  await complete();
  await page.screenshot({ path: path.join(evidence, `${name}-two-fields-ready.png`) });
  await sweep('HarvestTool');
  assert.equal(
    (await inspect(page)).save.inventory.vegetable,
    8,
    'Repeated visits collect each field once',
  );
  await sweep('HarvestTool');
  assert.equal(
    (await inspect(page)).save.inventory.vegetable,
    8,
    'Empty fields cannot yield twice',
  );
  await sweep('SeedTool');
  await complete();
  await sweep('HarvestTool');
  assert.equal((await inspect(page)).save.inventory.vegetable, 16);
  await sweep('SeedTool');
  await complete();
  const full = (await inspect(page)).save;
  await sweep('HarvestTool');
  assert.deepEqual(
    (await inspect(page)).save,
    full,
    'Full storage preserves ready crops and resources',
  );
  const shop = await commerce.build(page, 'shop', '商店', 1, 7, touch);
  await commerce.select(page, shop.id, touch);
  await commerce.quantity(page, 4, touch);
  await button('卖4');
  assert.equal((await inspect(page)).save.inventory.vegetable, 12);
  await sweep('HarvestTool');
  const final = await inspect(page);
  assert.equal(
    final.save.inventory.vegetable,
    16,
    'Only one ready field fits the released capacity',
  );
  assert.equal(
    final.save.buildings.filter((b) => b.kind === 'farm' && b.job).length,
    1,
    'Blocked ready field stays harvestable',
  );
  assert.equal(final.save.coins, 90);
  assert.ok(
    final.labels.some((label) => label.text === '菜×16'),
    'Visible crop quantity updates to actual stock',
  );
  await page.screenshot({ path: path.join(evidence, `${name}-farming-full.png`) });
  fs.writeFileSync(
    path.join(evidence, `${name}-farming.json`),
    JSON.stringify(
      {
        passed: true,
        input: touch ? 'touch' : 'mouse',
        checks: [
          'visible unlimited seed tool',
          'invalid target unchanged',
          'multi-field plant once per gesture',
          'growing field not restarted',
          'early harvest rejected',
          'multi-field sickle once per gesture',
          'duplicate harvest rejected',
          'full storage keeps ready crops',
          'partial capacity collects only fitting field',
          'tool does not pan or zoom',
        ],
        state: final.save,
      },
      null,
      2,
    ),
  );
};
