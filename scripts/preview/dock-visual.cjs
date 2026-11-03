/** Isolated real UI regression for the demo dock orientation control. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve('temp/cocos-engine/node_modules/playwright'));
const { isDockShore } = require('../../.domain-build/domain/game.js');
const { inspect, until, ready, driver, worldPoint } = require('./ui-driver.cjs');
const { drag } = require('./pointer-input.cjs');
async function sceneInfo(page, id) {
  return page.evaluate(async (id) => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const ui = scene.getComponentsInChildren(cc.Camera).find((c) => c.node.name === 'UICamera');
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas.getBoundingClientRect();
    const transform = scene
      .getComponentsInChildren(cc.UITransform)
      .find((t) => t.node.name === 'RotateBuilding' && t.node.activeInHierarchy);
    const p = transform && ui.worldToScreen(transform.node.worldPosition);
    const find = (node) => (node.name === id ? node : node.children.map(find).find(Boolean));
    const building = find(scene);
    const mesh = building?.getChildByName('BuildingMesh');
    const pier = building?.getChildByName('RotatedPier');
    return {
      rotate: p
        ? {
            x: rect.left + (p.x * rect.width) / canvas.width,
            y: rect.top + ((canvas.height - p.y) * rect.height) / canvas.height,
          }
        : null,
      meshAngle: mesh?.eulerAngles.y,
      pierAngle: pier?.eulerAngles.y,
    };
  }, id);
}
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  try {
    await page.goto(process.env.CROP_PREVIEW_URL || 'http://127.0.0.1:4178/');
    await ready(page);
    const { button, click } = driver(page, false);
    await button('工具');
    await button('保存进度');
    let state = await until(page, (s) => s.save?.schemaVersion === 8, 'demo saved');
    assert.equal(state.profile, 'demo');
    const dock = state.save.buildings.find((b) => b.kind === 'dock');
    assert.ok(dock);
    const target = await worldPoint(page, { x: dock.x + 1, z: dock.z + 1, y: 0.3 });
    await drag(page, target, { x: 820, y: 330 }, false);
    state = await inspect(page);
    await click(state.buildings.find((b) => b.id === dock.id));
    const before = await inspect(page);
    const original = before.save.buildings.find((b) => b.id === dock.id);
    const valid = [1, 2, 3]
      .map((n) => (original.rotation + n) % 4)
      .filter((rotation) => isDockShore({ ...original, rotation }, before.save.mapSeed));
    const control = await sceneInfo(page, dock.id);
    assert.ok(control.rotate, 'Visible dock rotation control');
    await click(control.rotate);
    if (!valid.length) {
      const after = await inspect(page);
      assert.ok(
        after.labels.some((label) => label.text.includes('长按移动到其他岸边')),
        'Explains only one shoreline facing',
      );
      assert.equal(after.save.buildings.find((b) => b.id === dock.id).rotation, original.rotation);
      assert.deepEqual(after.save.commerce, before.save.commerce);
    } else {
      state = await until(
        page,
        (s) => s.save.buildings.find((b) => b.id === dock.id).rotation === valid[0],
        'valid shore rotation',
      );
      assert.deepEqual(state.save.commerce, before.save.commerce);
      const visual = await sceneInfo(page, dock.id);
      const normalize = (v) => ((Math.round(v) % 360) + 360) % 360;
      assert.equal(normalize(visual.meshAngle), valid[0] * 90);
      assert.equal(normalize(visual.pierAngle), valid[0] * 90);
      await page.reload();
      await ready(page);
      assert.equal(
        (await inspect(page)).save.buildings.find((b) => b.id === dock.id).rotation,
        valid[0],
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({ dock: dock.id, original: original.rotation, alternatives: valid, errors }),
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
