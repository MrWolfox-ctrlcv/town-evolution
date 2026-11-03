/** Schema8 actual profile UI suite; prepared, not locally executed without browser graphics. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, until, ready, driver } = require('./ui-driver.cjs');
module.exports = async function profiles(page, evidence, name, touch) {
  const { button } = driver(page, touch);
  assert.equal((await inspect(page)).profile, 'demo');
  await button('工具');
  await button('保存进度');
  const demo = await until(page, (s) => s.save?.schemaVersion === 8, 'demo saved');
  assert.equal(demo.save.mapSeed, 42173);
  assert.equal(demo.save.coins, 1000);
  assert.ok(demo.save.buildings.some((b) => b.kind === 'dock'));
  assert.ok(demo.save.groundStacks.some((pile) => pile.amount === 5 && pile.item === 'wood'));
  await button('购买作物');
  await button('胡萝卜 ×1');
  await button('关闭');
  await until(page, (s) => s.save.coins === 992, 'demo purchase persisted');
  await button('进入正常小镇');
  await until(page, (s) => s.profile === 'normal', 'normal profile opened');
  await button('工具');
  await button('保存进度');
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
  await button('工具');
  await button('重置演示岛');
  await button('确认重置演示岛');
  await until(
    page,
    (s) => s.save?.coins === 1000 && s.save.mapSeed === 42173,
    'repeatable demo reset',
  );
  await page.screenshot({ path: path.join(evidence, `${name}-demo-reset.png`) });
  await button('工具');
  await button('进入正常小镇');
  await until(
    page,
    (s) => s.profile === 'normal' && s.save?.coins === 112,
    'demo reset leaves player intact',
  );
  await page.reload();
  await ready(page);
  assert.equal((await inspect(page)).save.coins, 112);
  await button('工具');
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
