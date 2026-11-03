/** Read rendered Cocos nodes; drive behavior only through browser pointer/touch input. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function inspect(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const cameras = scene.getComponentsInChildren(cc.Camera);
    const ui = cameras.find((camera) => camera.node.name === 'UICamera');
    const world = cameras.find((camera) => camera.node.name === 'WorldCamera');
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas.getBoundingClientRect();
    const project = (camera, position) => {
      const point = camera.worldToScreen(position);
      return {
        x: rect.left + (point.x * rect.width) / canvas.width,
        y: rect.top + ((canvas.height - point.y) * rect.height) / canvas.height,
      };
    };
    const labels = scene
      .getComponentsInChildren(cc.Label)
      .filter((label) => label.node.activeInHierarchy)
      .map((label) => ({
        text: label.string,
        action: label.node.parent.name === 'Action',
        ...project(ui, label.node.worldPosition),
      }));
    const town = scene.getChildByName('Town').getChildByName('TownWorld');
    const farm = town.children.find((node) => node.getChildByName('Soil'));
    const position = farm?.getChildByName('Soil')?.worldPosition;
    return {
      labels,
      farm: position ? project(world, position) : null,
      save: JSON.parse(localStorage.getItem('town-evolution.save.v1') || 'null'),
    };
  });
}
async function until(page, predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await inspect(page);
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`UI verification timed out: ${message}; ${JSON.stringify(await inspect(page))}`);
}
async function ready(page) {
  await page.waitForFunction(() => window.__townPreview?.ready === true, undefined, {
    timeout: 45000,
  });
}
module.exports = async function interactions(page, evidence, name, touch) {
  const click = async (point) => {
    assert.ok(
      point && Number.isFinite(point.x) && Number.isFinite(point.y),
      'Rendered target exists',
    );
    if (touch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
  };
  const button = async (text) => {
    const state = await until(
      page,
      (state) => state.labels.some((label) => label.action && label.text.includes(text)),
      text,
    );
    const targets = state.labels.filter((label) => label.action && label.text.includes(text));
    assert.equal(targets.length, 1, `Unique rendered button: ${text}`);
    await click(targets[0]);
  };
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
