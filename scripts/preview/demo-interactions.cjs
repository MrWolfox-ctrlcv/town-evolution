/** Schema10 actual profile UI suite; prepared, not passed without real browser execution. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, until, ready, driver } = require('./ui-driver.cjs');
module.exports = async function profiles(page, evidence, name, touch) {
  const { button, townActions } = driver(page, touch);
  const saveTrace = [];
  const traceSavePanel = async (stage) => {
    const panel = await page.evaluate(async () => {
      const cc = await System.import('cc');
      const boot = cc.director.getScene().getChildByName('Town').getComponent('TownBootstrap');
      const controller = boot.controller;
      const bottom = controller?.hud.bottom;
      return {
        page: boot.flow.page,
        profile: boot.flow.profile,
        sameControllerSession: boot.controllerSession === boot.flow.session,
        menuVisible: boot.menu.root.activeInHierarchy,
        contextRequested: bottom?.requested ?? null,
        contextActive: bottom?.context.active ?? null,
        contextVisible: bottom?.context.activeInHierarchy ?? null,
        contextTab: bottom?.data?.tab ?? null,
        uiTab: controller?.ui.tab ?? null,
        cropShopOpen: controller?.ui.cropShopOpen ?? null,
        message: boot.flow.message,
        saveWarning: boot.flow.session?.statusMessage ?? null,
      };
    });
    const view = await inspect(page);
    saveTrace.push({
      stage,
      ...panel,
      actions: view.labels.filter((l) => l.action).map((l) => l.text),
    });
    fs.writeFileSync(
      path.join(evidence, `${name}-profile-save-trace.json`),
      JSON.stringify(saveTrace, null, 2),
    );
  };
  const save = async () => {
    await traceSavePanel('before opening saves');
    await button('存档');
    await button('立即保存');
    await traceSavePanel('after explicit save');
    await button('返回游戏');
    await traceSavePanel('after returning to game');
  };
  await button('游览演示岛');
  assert.equal((await inspect(page)).profile, 'demo');
  await townActions();
  await save();
  const demo = await until(page, (s) => [10, 11].includes(s.save?.schemaVersion), 'demo saved');
  assert.equal(demo.save.mapSeed, 42173);
  assert.equal(demo.save.coins, 1000);
  assert.ok(demo.save.buildings.some((b) => b.kind === 'dock'));
  assert.deepEqual(
    demo.save.groundStacks
      .filter((p) => p.item === 'wood')
      .map((p) => p.amount)
      .sort(),
    [1, 2, 4],
  );
  for (const item of [
    'vegetable',
    'wheat',
    'lettuce',
    'rice',
    'wood',
    'stone',
    'soil',
    'mud',
    'treeSeed',
    'sapling',
    'milledRice',
    'flour',
    'bread',
    'roastedCarrot',
  ])
    assert.ok(
      demo.save.groundStacks.some((p) => p.item === item),
      item,
    );
  assert.ok(demo.save.buildings.some((b) => b.kind === 'residence'));
  for (const kind of [
    'compostBarrel',
    'nursery',
    'stoneMill',
    'mill',
    'stoneOven',
    'bakery',
    'handcart',
    'transportWarehouse',
    'woodenPier',
    'boat',
  ])
    assert.ok(
      demo.save.buildings.some((b) => b.kind === kind),
      `Demo includes ${kind}`,
    );
  assert.ok(demo.save.buildings.some((b) => b.kind === 'dock' && b.dockStyle === 'simple'));
  assert.ok(
    demo.save.buildings.some((b) => b.kind === 'dock' && !b.dockStyle),
    'Legacy dock remains',
  );
  assert.ok(
    demo.save.buildings.some((b) => b.collectionBox),
    'Separate field-box example',
  );
  assert.ok(demo.save.looseDrops.length >= 2, 'Real loose output examples are persisted');

  for (const irrigated of [false, true])
    assert.ok(
      demo.save.buildings.some((b) => b.farmSize === 6 && Boolean(b.irrigated) === irrigated),
    );
  await button('购买作物');
  await button('胡萝卜 ×1');
  await button('关闭');
  await until(page, (s) => s.save.coins === 992, 'demo purchase persisted');
  await button('进入正常小镇');
  await until(page, (s) => s.profile === 'normal', 'normal profile opened');
  await townActions();
  await save();
  const normal = await until(page, (s) => s.save?.coins === 120, 'independent fresh player town');
  assert.equal(normal.save.tools.sickle, 90);
  await button('购买作物');
  await button('胡萝卜 ×1');
  await button('关闭');
  await until(page, (s) => s.save.coins === 112, 'normal purchase persisted');
  await button('进入演示岛');
  await until(
    page,
    (s) => s.profile === 'demo' && s.save?.coins === 992,
    'demo changes survive profile switch',
  );
  await townActions();
  await button('存档');
  await button('重置演示岛…');
  await button('确认');
  await until(
    page,
    (s) => s.save?.coins === 1000 && s.save.mapSeed === 42173,
    'repeatable demo reset',
  );
  await page.screenshot({ path: path.join(evidence, `${name}-demo-reset.png`) });
  await townActions();
  await button('进入正常小镇');
  await until(
    page,
    (s) => s.profile === 'normal' && s.save?.coins === 112,
    'demo reset leaves player intact',
  );
  await page.reload();
  await ready(page);
  await button('继续游戏');
  assert.equal((await inspect(page)).save.coins, 112);
  await townActions();
  await button('进入演示岛');
  await until(page, (s) => s.profile === 'demo', 'final demo presentation');
  fs.writeFileSync(
    path.join(evidence, `${name}-profiles.json`),
    JSON.stringify(
      {
        passed: true,
        input: touch ? 'touch' : 'mouse',
        checks: [
          'demo actual fixture',
          'real purchase',
          'independent player town',
          'profile switch preserves both',
          'demo reset preserves player',
          'reload persistence',
        ],
      },
      null,
      2,
    ),
  );
};
