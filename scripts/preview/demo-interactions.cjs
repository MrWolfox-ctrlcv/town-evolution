/** Schema10 actual profile UI suite; prepared, not passed without real browser execution. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, until, ready, driver } = require('./ui-driver.cjs');
module.exports = async function profiles(page, evidence, name, touch) {
  const { button, townActions } = driver(page, touch);
  const save = async () => {
    await button('存档');
    await button('立即保存');
    await button('返回游戏');
  };
  await button('游览演示岛');
  assert.equal((await inspect(page)).profile, 'demo');
  await townActions();
  await save();
  const demo = await until(page, (s) => s.save?.schemaVersion === 10, 'demo saved');
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
