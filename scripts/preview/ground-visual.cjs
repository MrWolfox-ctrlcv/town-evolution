/** Isolated real-input acceptance: harvested products and floating context controls. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve('temp/cocos-engine/node_modules/playwright'));
const { ready, inspect, driver, worldPoint, until } = require('./ui-driver.cjs');
const { drag, dragPath } = require('./pointer-input.cjs');
(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('http://127.0.0.1:4178');
    await ready(p);
    const d = driver(p, false);
    const initialHeight = (await inspect(p)).cameraHeight;
    await d.button('工具');
    await d.button('保存进度');
    assert.equal(
      (await inspect(p)).cameraHeight,
      initialHeight,
      'opening menus must not resize the map',
    );
    const close = await p.evaluate(async () => {
      const cc = await System.import('cc'),
        scene = cc.director.getScene();
      const n = scene
        .getComponentsInChildren(cc.UITransform)
        .find((t) => t.node.name === 'ContextClose' && t.node.activeInHierarchy).node;
      const camera = scene
        .getComponentsInChildren(cc.Camera)
        .find((c) => c.node.name === 'UICamera');
      const v = camera.worldToScreen(n.worldPosition),
        c = document.querySelector('canvas');
      return {
        x: (v.x * c.clientWidth) / c.width,
        y: ((c.height - v.y) * c.clientHeight) / c.height,
      };
    });
    await d.click(close);
    assert.ok(
      !(await inspect(p)).labels.some((l) => l.action && l.text === '保存进度'),
      'context closes',
    );

    for (const [item, tool, x, z] of [
      ['vegetable', 'VegetableStock', 8, 11],
      ['wheat', 'WheatStock', 8, 10],
      ['lettuce', 'LettuceStock', 9, 11],
      ['stone', 'StoneStock', 9, 10],
    ]) {
      for (let i = 0; i < 3; i++) {
        const state = await inspect(p);
        const from = state.tools.find((t) => t.name === tool);
        const to = await worldPoint(p, { x: x + 0.5, y: 0.02, z: z + 0.5 });
        await dragPath(p, [from, { x: 1120, y: 700 }, { x: to.x, y: 700 }, to], false);
        await until(
          p,
          (s) =>
            s.save.groundStacks.some(
              (q) => q.x === x && q.z === z && q.item === item && q.amount === i + 1,
            ),
          item + ' pile',
        );
      }
    }
    let q = await worldPoint(p, { x: 9, y: 0, z: 11 });
    await drag(p, q, { x: 720, y: 480 }, false);
    q = await worldPoint(p, { x: 9, y: 0, z: 11 });
    await p.mouse.move(q.x, q.y);
    for (let i = 0; i < 3; i++) {
      await p.mouse.wheel(0, -300);
      await p.waitForTimeout(150);
    }
    await p.waitForTimeout(600);
    await p.screenshot({ path: 'build/screenshots/ground-products.png' });
    const target = await worldPoint(p, { x: 9.5, y: 0.12, z: 10.5 });
    await d.click(target);
    const height = (await inspect(p)).cameraHeight;
    await d.button('收回1份');
    await until(
      p,
      (s) =>
        s.save.groundStacks.some((q) => q.x === 9 && q.z === 10 && q.amount === 2) &&
        s.save.inventory.stone === 2,
      'new stone mesh can be selected and retrieved',
    );
    assert.equal((await inspect(p)).cameraHeight, height);
    assert.deepEqual(errors, []);
    console.log(
      'Actual product drops, context close, mesh picking, retrieval and stable viewport passed.',
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
