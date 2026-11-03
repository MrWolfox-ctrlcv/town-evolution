/** Facility helpers select real nodes and activate visible controls only. */
const assert = require('node:assert/strict');
const { inspect, until, worldPoint, driver, useTool } = require('./ui-driver.cjs');
async function select(page, id, touch) {
  const state = await inspect(page);
  await driver(page, touch).click(state.buildings.find((building) => building.id === id));
}
async function build(page, kind, label, x, z, touch) {
  const { button, click } = driver(page, touch);
  const prior = (await inspect(page)).save?.buildings.map((building) => building.id) || [];
  await button('建造');
  await button(`${label} ·`);
  await click(await worldPoint(page, { x: x + 0.5, z: z + 0.5 }));
  await button('确认建造');
  const state = await until(
    page,
    (state) =>
      state.save?.buildings.some(
        (building) => building.kind === kind && !prior.includes(building.id),
      ),
    `${kind} physically built`,
  );
  return state.save.buildings.find(
    (building) => building.kind === kind && !prior.includes(building.id),
  );
}
async function quantity(page, value, touch) {
  const title = `数量：${value === 'all' ? '全部' : value}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await inspect(page)).labels.some((label) => label.action && label.text.startsWith(title)))
      return;
    await driver(page, touch).button('数量：');
  }
  assert.ok(
    (await inspect(page)).labels.some((label) => label.text.startsWith(title)),
    'Quantity preset reached',
  );
}
async function item(page, cold, touch) {
  const title = `货物：${cold ? '冷藏菜' : '蔬菜'}`;
  if (!(await inspect(page)).labels.some((label) => label.text === title))
    await driver(page, touch).button('货物：');
  assert.ok((await inspect(page)).labels.some((label) => label.text === title));
}
async function crop(page, farmId, touch) {
  const before = (await inspect(page)).save?.inventory.vegetable || 0;
  await useTool(page, 'SeedTool', touch, farmId);
  await until(
    page,
    (state) => state.save?.buildings.find((building) => building.id === farmId)?.job,
    'crop started',
  );
  await until(
    page,
    (state) =>
      state.now >=
      state.save.buildings.find((building) => building.id === farmId).job.readyAt + 600,
    'real crop maturation',
    25000,
  );
  await useTool(page, 'HarvestTool', touch, farmId);
  await until(
    page,
    (state) => state.save.inventory.vegetable === before + 4,
    'crop collected through sickle',
  );
}
module.exports = { select, build, quantity, item, crop };
