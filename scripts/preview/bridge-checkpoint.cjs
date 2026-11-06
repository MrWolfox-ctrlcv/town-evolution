/** Prepared real-pointer bridge acceptance, isolated browser profile. Never inject game state. */
const assert = require('node:assert/strict'),
  path = require('node:path');
const { inspect, until, ready, driver, worldPoint } = require('./ui-driver.cjs');
const { drag } = require('./pointer-input.cjs');
const otherSaves = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter(
          (k) =>
            k !== 'town-evolution.active-profile' &&
            !k.startsWith('town-evolution.v5-bridge-demo.'),
        )
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  );
module.exports = async (page, evidence, name, touch) => {
  const { button, named, click } = driver(page, touch);
  await named('Menu-settings');
  await button('返回标题');
  await button('确认');
  await until(page, (s) => s.labels.some((l) => l.text === '小镇进化'), 'title before bridge');
  const other = await otherSaves(page);
  await button('木桥演示');
  let view = await until(
    page,
    (s) => s.profile === 'v5-bridge-demo' && s.save?.schemaVersion === 10,
    'isolated bridge save',
  );
  await until(
    page,
    (s) => !s.labels.some((l) => l.text.includes('地形与树木细节加载中')),
    'bridge terrain committed',
    90000,
  );
  const piers = view.save.buildings
    .filter((b) => b.kind === 'woodenPier')
    .sort((a, b) => a.x - b.x || a.z - b.z);
  assert.equal(piers.length, 2);
  const before = view.save,
    from = view.buildings.find((b) => b.id === piers[1].id),
    to = view.buildings.find((b) => b.id === piers[0].id);
  assert.ok(from && to);
  await page.screenshot({ path: path.join(evidence, `${name}-bridge-banks.png`) });
  await drag(page, from, to, touch, 650);
  view = await until(
    page,
    (s) => s.save.buildings.some((b) => b.kind === 'woodenBridge'),
    'actual reverse pier drag bridge',
  );
  const bridge = view.save.buildings.find((b) => b.kind === 'woodenBridge');
  assert.equal(bridge.id, piers[0].id);
  assert.equal(bridge.bridge.length, 15);
  assert.equal(view.save.coins, before.coins);
  assert.deepEqual(view.save.inventory, before.inventory);
  assert.deepEqual(await otherSaves(page), other);
  await page.screenshot({ path: path.join(evidence, `${name}-bridge-assembled.png`) });
  await click(await worldPoint(page, { x: bridge.x + 7.45, z: bridge.z + 1, y: 0.015 }));
  // The whole span must remain unchanged when a river-incompatible turn is requested.
  const savedBridge = structuredClone(bridge);
  await button('转向');
  view = await inspect(page);
  assert.deepEqual(
    view.save.buildings.find((b) => b.id === bridge.id),
    savedBridge,
  );
  await page.reload();
  await ready(page);
  await button('木桥演示');
  view = await until(
    page,
    (s) =>
      s.profile === 'v5-bridge-demo' &&
      s.save?.buildings.some((b) => b.id === bridge.id && b.kind === 'woodenBridge'),
    'saved bridge reload',
  );
  assert.deepEqual(
    view.save.buildings.find((b) => b.id === bridge.id),
    savedBridge,
  );
  assert.deepEqual(await otherSaves(page), other);
  return {
    profile: view.profile,
    length: bridge.bridge.length,
    retainedId: bridge.id,
    otherSavesUnchanged: true,
  };
};
