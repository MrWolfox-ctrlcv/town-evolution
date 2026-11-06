/** Settings acceptance uses isolated browser storage, real pointer input and read-only inspection. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { driver, inspect, until } = require('./ui-driver.cjs');
const { drag, interruptDrag } = require('./pointer-input.cjs');
async function state(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const boot = scene.getChildByName('Town').getComponent('TownBootstrap');
    const settings = boot.controller?.hud.settings.node;
    const summary = boot.controller?.hud.top;
    const bounds = (node) => {
      if (!node?.activeInHierarchy) return null;
      const box = node.getComponent(cc.UITransform).getBoundingBoxToWorld();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return {
      page: boot.flow.page,
      settings: bounds(settings),
      summary: bounds(summary),
      saves: Object.fromEntries(
        Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
      ),
    };
  });
}
module.exports = async function settingsInteractions(page, evidence, name, touch) {
  const { button, named } = driver(page, touch);
  assert.equal((await inspect(page)).profile, 'demo');
  const game = await state(page);
  assert.equal(game.page, 'game');
  assert.ok(game.settings.width >= 44 && game.settings.height >= 44);
  assert.ok(game.settings.x >= game.summary.x + game.summary.width + 12);
  const launcher = (await inspect(page)).targets.find((target) => target.name === 'Menu-settings');
  assert.ok(launcher);
  await page.screenshot({ path: path.join(evidence, `${name}-settings-launcher.png`) });
  await drag(page, launcher, { x: launcher.x - 42, y: launcher.y + 50 }, touch);
  assert.equal((await state(page)).page, 'game', 'Dragging over the button does not open settings');
  if (touch) {
    await interruptDrag(page, launcher, launcher);
    assert.equal(
      (await state(page)).page,
      'game',
      'Interrupted multi-touch does not activate settings',
    );
  }
  await named('Menu-settings');
  assert.equal((await state(page)).page, 'settings');
  await page.screenshot({ path: path.join(evidence, `${name}-settings-menu.png`) });
  await button('立即保存');
  await until(
    page,
    (view) => view.labels.some((label) => label.text.includes('自动存档已更新')),
    'save status',
  );
  await button('存档管理');
  await button('手动存档 3');
  await button('保存到此栏位');
  await button('返回存档');
  await button('返回设置');
  const before = await state(page);
  assert.equal(before.page, 'settings');
  for (let repeat = 0; repeat < 2; repeat++) {
    await button('重置演示岛');
    assert.equal((await state(page)).page, 'confirm');
    assert.deepEqual((await state(page)).saves, before.saves, 'Reset needs explicit confirmation');
    await button('取消');
    assert.equal((await state(page)).page, 'settings');
    assert.deepEqual((await state(page)).saves, before.saves, 'Cancel preserves all save keys');
  }
  await button('返回标题');
  await button('取消');
  assert.equal((await state(page)).page, 'settings');
  await button('返回游戏');
  assert.equal((await state(page)).page, 'game');
  await named('Menu-settings');
  await button('重置演示岛');
  await button('确认');
  await until(page, (view) => view.save?.coins === 1000, 'confirmed demo reset');
  const reset = await state(page);
  const key = 'town-evolution.demo.town-evolution.save.v1';
  assert.equal(reset.page, 'game');
  assert.ok(reset.saves[`${key}.before-reset`], 'Reset keeps the previous demo');
  assert.equal(reset.saves[`${key}.manual.3`], before.saves[`${key}.manual.3`]);
  assert.equal(reset.saves['town-evolution.save.v1'], before.saves['town-evolution.save.v1']);
  await named('Menu-settings');
  await button('返回标题');
  await button('确认');
  assert.equal((await state(page)).page, 'title');
  await button('游览演示岛');
  await until(
    page,
    (view) => view.profile === 'demo' && view.save?.coins === 1000,
    'saved return to demo',
  );
  fs.writeFileSync(
    path.join(evidence, `${name}-settings.json`),
    JSON.stringify(
      {
        passed: true,
        input: touch ? 'touch' : 'mouse',
        checks: [
          '44px launcher clears resource counters',
          'drag and interrupted touch do not activate launcher',
          'save now and nested save manager back navigation',
          'repeated reset and exit cancellation preserve session',
          'confirmed reset archives demo and preserves manual/normal saves',
          'confirmed saved exit and re-entry',
        ],
      },
      null,
      2,
    ),
  );
};
