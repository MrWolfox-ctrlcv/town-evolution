/** Isolated Edge visual acceptance using real Cocos controls and browser input. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve('temp/cocos-engine/node_modules/playwright'));
const { ready, inspect, until, driver, worldPoint } = require('./ui-driver.cjs');
const { drag, dragPath } = require('./pointer-input.cjs');

async function frameFarm(page, id) {
  const size = page.viewportSize();
  await page.mouse.move(size.width * 0.65, size.height * 0.4);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(100);
  }
  let state = await inspect(page);
  const farm = state.save.buildings.find((b) => b.id === id);
  let point = await worldPoint(page, { x: farm.x + 1, z: farm.z + 1, y: 0 });
  const center = { x: size.width * 0.65, y: size.height * 0.38 };
  await drag(page, point, center, false);
  point = await worldPoint(page, { x: farm.x + 1, z: farm.z + 1, y: 0 });
  await page.mouse.move(point.x, point.y);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
}
async function main() {
  const output = path.resolve('build/screenshots');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  try {
    await page.goto(process.env.CROP_PREVIEW_URL || 'http://127.0.0.1:4178/');
    await ready(page);
    const { button } = driver(page, false);
    await button('工具');
    await button('保存进度');
    let state = await until(page, (s) => s.save?.schemaVersion === 8, 'demo save');
    assert.equal(state.profile, 'demo');
    assert.equal(state.save.buildings.find((b) => b.id === 'b6')?.kind, 'farm');
    const needed = Math.max(0, 9 - state.save.inventory.wheat);
    await button('购买作物');
    for (let i = 0; i < needed; i++) await button('小麦 ×1');
    await button('关闭');
    state = await until(page, (s) => s.save.inventory.wheat >= 9, 'nine wheat available');
    await frameFarm(page, 'b6');
    state = await inspect(page);
    const farm = state.save.buildings.find((b) => b.id === 'b6');
    const route = [0, 1, 2, 5, 4, 3, 6, 7, 8];
    const points = await Promise.all(
      route.map((cell) =>
        worldPoint(page, {
          x: farm.x + (((cell % 3) + 0.5) * 2) / 3,
          z: farm.z + ((Math.floor(cell / 3) + 0.5) * 2) / 3,
          y: 0.17,
        }),
      ),
    );
    const chip = state.tools.find((t) => t.name === 'WheatStock');
    assert.ok(chip, 'Wheat chip visible');
    await dragPath(page, [chip, ...points], false);
    state = await until(
      page,
      (s) =>
        s.save.buildings.find((b) => b.id === 'b6').cropJobs.filter((j) => j?.crop === 'wheat')
          .length === 9,
      'nine wheat planted',
    );
    const readyAt = Math.max(
      ...state.save.buildings.find((b) => b.id === 'b6').cropJobs.map((j) => j.readyAt),
    );
    await page.screenshot({ path: path.join(output, 'crops-seedling.png') });
    const youngAt = Math.max(
      ...state.save.buildings
        .find((b) => b.id === 'b6')
        .cropJobs.map((j) => j.startedAt + (j.readyAt - j.startedAt) * 0.35),
    );
    await until(page, (s) => s.now >= youngAt + 700, 'all crops enter youth', 15000);
    await page.waitForFunction(
      async () => {
        const cc = await System.import('cc');
        const find = (n) =>
          (n.name === 'Crop-wheat-young' ? 1 : 0) + n.children.reduce((a, c) => a + find(c), 0);
        return find(cc.director.getScene()) >= 9;
      },
      undefined,
      { timeout: 5000 },
    );
    await page.screenshot({ path: path.join(output, 'crops-young.png') });
    if (process.env.HARVEST_CHECK) {
      const before = await inspect(page),
        tool = before.tools.find((t) => t.name === 'HarvestTool');
      const target = await worldPoint(page, { x: farm.x + 1, z: farm.z + 1, y: 0.3 });
      await drag(page, tool, target, Boolean(process.env.HARVEST_TOUCH));
      const after = await inspect(page);
      assert.deepEqual(after.save.inventory, before.save.inventory, 'Youth cannot be harvested');
      assert.equal(
        after.save.tools.sickle,
        before.save.tools.sickle,
        'Youth attempt uses no durability',
      );
      assert.ok(after.labels.some((l) => l.text.includes('尚未成熟')));
    }
    await until(page, (s) => s.now >= readyAt + 800, 'wheat mature', 35000);
    if (process.env.HARVEST_CHECK)
      await until(
        page,
        (s) => s.labels.some((l) => l.text.includes('作物已成熟，可以收割')),
        'stale immature hint updates',
      );
    await page.screenshot({ path: path.join(output, 'crops-wheat.png') });
    await frameFarm(page, 'b2');
    await page.screenshot({ path: path.join(output, 'crops-mixed.png') });
    if (process.env.HARVEST_CHECK) {
      await frameFarm(page, 'b6');
      state = await inspect(page);
      const sickle = state.tools.find((t) => t.name === 'HarvestTool');
      const tips = await Promise.all(
        route.map((cell) =>
          worldPoint(page, {
            x: farm.x + (((cell % 3) + 0.5) * 2) / 3,
            z: farm.z + ((Math.floor(cell / 3) + 0.5) * 2) / 3,
            y: 0.6,
          }),
        ),
      );
      await dragPath(page, [sickle, ...tips], Boolean(process.env.HARVEST_TOUCH));
      state = await inspect(page);
      const remaining = state.save.buildings
        .find((b) => b.id === 'b6')
        .cropJobs.filter(Boolean).length;
      console.log(
        JSON.stringify({
          harvestRemaining: remaining,
          inventory: state.save.inventory,
          messages: state.labels.filter((l) => !l.action).map((l) => l.text),
        }),
      );
      assert.equal(remaining, 0, 'Sickle swept over visible crop heads harvests all nine cells');
      assert.equal(state.save.tools.sickle, 81, 'Each harvested cell uses exactly one durability');
      assert.equal(state.save.inventory.wheat, 18, 'Nine cells yield exactly eighteen wheat');
      await frameFarm(page, 'b2');
      state = await inspect(page);
      const mixed = state.save.buildings.find((b) => b.id === 'b2');
      const mixedTips = await Promise.all(
        [0, 1, 2, 3, 4, 5].map((cell) =>
          worldPoint(page, {
            x: mixed.x + (((cell % 3) + 0.5) * 2) / 3,
            z: mixed.z + ((Math.floor(cell / 3) + 0.5) * 2) / 3,
            y: cell % 3 === 1 ? 0.55 : 0.3,
          }),
        ),
      );
      await dragPath(
        page,
        [state.tools.find((t) => t.name === 'HarvestTool'), ...mixedTips],
        Boolean(process.env.HARVEST_TOUCH),
      );
      state = await inspect(page);
      assert.equal(
        state.save.buildings.find((b) => b.id === 'b2').cropJobs.filter(Boolean).length,
        1,
        'Full warehouse preserves uncollected crop',
      );
      assert.equal(state.save.tools.sickle, 76, 'Full warehouse does not consume extra durability');
      assert.ok(
        state.labels.some((l) => l.text.includes('仓储空间不足')),
        'Full warehouse explains remaining and required capacity',
      );
      await page.waitForTimeout(5000);
      state = await inspect(page);
      assert.ok(
        state.labels.some((l) => l.text.includes('仓储空间不足')),
        'capacity warning persists long enough to read',
      );
      assert.ok(
        state.labels.some((l) => l.text.includes('收获需 2 格')),
        'warning shows required capacity',
      );
      await page.screenshot({ path: path.join(output, 'warehouse-full-warning.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(output, 'warehouse-full-warning-phone.png') });
    }
    assert.deepEqual(errors, [], 'Cocos console errors');
    console.log(
      JSON.stringify({
        wheat: path.join(output, 'crops-wheat.png'),
        mixed: path.join(output, 'crops-mixed.png'),
        errors,
      }),
    );
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'crops-failure.png') }).catch(() => {});
    console.error('Console errors:', errors);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
