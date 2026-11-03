/** Current schema-6 UI checks. Real input and timers; runtime pending graphics-capable browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, until, ready, driver, worldPoint } = require('./ui-driver.cjs');
const { drag, dragPath } = require('./pointer-input.cjs');
module.exports = async function cells(page, evidence, name, touch) {
  const { click, button } = driver(page, touch);
  let state = await until(
    page,
    (s) => s.cropImages >= 4,
    'generated crop PNG loaded into actual Sprite',
  );
  assert.ok(state.tools.some((tool) => tool.name === 'axeTool'));
  assert.ok(state.tools.some((tool) => tool.name === 'sawTool'));
  assert.ok(state.tools.some((tool) => tool.name === 'WoodStock'));
  const tools = Object.fromEntries(state.tools.map((tool) => [tool.name, tool]));
  assert.ok(tools.HarvestTool.x < page.viewportSize().width / 2, 'Left tool column');
  assert.ok(tools.VegetableStock.y < tools.WheatStock.y);
  assert.ok(tools.VegetableStock.x > page.viewportSize().width / 2, 'Right product column');
  await click(tools.VegetableStock);
  for (let i = 0; i < 8; i++) await button('胡萝卜 ×1');
  state = await until(page, (s) => s.save?.inventory.vegetable === 9, 'nine planting units');
  assert.equal(state.save.coins, 56);
  const farm = state.save.buildings.find((b) => b.kind === 'farm');
  const cells = [0, 1, 2, 5, 4, 3, 6, 7, 8];
  const route = async () => {
    const b = (await inspect(page)).save.buildings.find((b) => b.id === farm.id);
    return Promise.all(
      cells.map((cell) =>
        worldPoint(page, {
          x: b.x + (((cell % 3) + 0.5) * 2) / 3,
          z: b.z + ((Math.floor(cell / 3) + 0.5) * 2) / 3,
        }),
      ),
    );
  };
  const sweep = async (tool) => {
    const current = await inspect(page);
    await dragPath(page, [current.tools.find((t) => t.name === tool), ...(await route())], touch);
  };
  await sweep('VegetableStock');
  const planted = await until(
    page,
    (s) => s.save.buildings.find((b) => b.id === farm.id).cropJobs.filter(Boolean).length === 9,
    'all nine cells planted',
  );
  assert.equal(planted.save.inventory.vegetable, 0);
  await sweep('HarvestTool');
  assert.deepEqual((await inspect(page)).save, planted.save, 'Early harvest cannot change state');
  await page.screenshot({ path: path.join(evidence, `${name}-nine-seedlings.png`) });
  await page.reload();
  await ready(page);
  await until(
    page,
    (s) =>
      s.now >=
      Math.max(
        ...s.save.buildings.find((b) => b.id === farm.id).cropJobs.map((job) => job.readyAt),
      ) +
        600,
    'real nine-cell maturation',
    25000,
  );
  await page.screenshot({ path: path.join(evidence, `${name}-nine-ready.png`) });
  await sweep('HarvestTool');
  const harvested = await until(
    page,
    (s) => s.save.inventory.vegetable === 16,
    'eight cells fill storage',
  );
  assert.equal(
    harvested.save.buildings.find((b) => b.id === farm.id).cropJobs.filter(Boolean).length,
    1,
  );
  await sweep('HarvestTool');
  assert.deepEqual((await inspect(page)).save, harvested.save, 'Full storage retains final crop');
  // A deliberate hold is required; ordinary quick drags are map pans, not building movement.
  state = await inspect(page);
  await drag(
    page,
    state.buildings.find((b) => b.id === farm.id),
    await worldPoint(page, { x: 7, y: 0.4, z: 7 }),
    touch,
    450,
  );
  const moved = await until(
    page,
    (s) => {
      const b = s.save.buildings.find((b) => b.id === farm.id);
      return b.x === 6 && b.z === 6;
    },
    'longpress moves actual farm',
  );
  assert.equal(moved.save.coins, 56);
  assert.deepEqual(moved.save.inventory, harvested.save.inventory);
  assert.deepEqual(
    moved.save.buildings.find((b) => b.id === farm.id).cropJobs,
    harvested.save.buildings.find((b) => b.id === farm.id).cropJobs,
  );
  await page.screenshot({ path: path.join(evidence, `${name}-longpress-moved.png`) });
  fs.writeFileSync(
    path.join(evidence, `${name}-cells.json`),
    JSON.stringify(
      {
        passed: true,
        input: touch ? 'touch' : 'mouse',
        checks: [
          'left tools and right products',
          'direct purchase',
          'nine-cell planting consumes nine',
          'early harvest rejection',
          'real maturation and reload',
          'capacity keeps last crop',
          '450ms longpress move preserves crop',
        ],
        state: moved.save,
      },
      null,
      2,
    ),
  );
};
