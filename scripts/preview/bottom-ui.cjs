/** Real mouse/touch verification of the transparent bottom shelf and its opening motion. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.resolve('temp/cocos-engine/node_modules/playwright'));
const { ready, inspect, driver } = require('./ui-driver.cjs');
async function snapshot(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc'),
      scene = cc.director.getScene();
    const all = scene.getComponentsInChildren(cc.UITransform);
    const context = all.find((t) => t.node.name === 'Controls');
    const camera = scene.getComponentsInChildren(cc.Camera).find((c) => c.node.name === 'UICamera');
    const canvas = document.querySelector('canvas');
    const position = (node) => {
      const p = camera.worldToScreen(node.worldPosition);
      return {
        x: (p.x * canvas.clientWidth) / canvas.width,
        y: ((canvas.height - p.y) * canvas.clientHeight) / canvas.height,
      };
    };
    return {
      open: context.node.activeInHierarchy,
      scale: context.node.scale.x,
      opacity: context.node.getComponent(cc.UIOpacity).opacity,
      toolsVisible: all.some((t) => t.node.name === 'ToolsLeft' && t.node.activeInHierarchy),
      solidPanel: !!context.node.getComponent(cc.Graphics),
      x: context.node.position.x,
      y: context.node.position.y,
      width: context.width,
      height: context.height,
      close: position(all.find((t) => t.node.name === 'ContextClose').node),
      icons: scene
        .getComponentsInChildren(cc.Sprite)
        .filter((s) => s.node.name === 'ActionIcon' && s.node.activeInHierarchy && s.spriteFrame)
        .length,
    };
  });
}
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const records = [];
  try {
    for (const [width, height, name, touch] of [
      [1280, 900, 'wide', false],
      [390, 844, 'phone', true],
      [320, 568, 'compact', true],
      [568, 320, 'landscape', true],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('http://127.0.0.1:4178');
      await ready(page);
      await page.waitForTimeout(400);
      const input = driver(page, touch),
        before = await inspect(page);
      assert.equal((await snapshot(page)).open, false);
      await page.evaluate(async () => {
        const cc = await System.import('cc'),
          scene = cc.director.getScene();
        const n = scene
          .getComponentsInChildren(cc.UITransform)
          .find((t) => t.node.name === 'Controls').node;
        window.__bottomTrace = [];
        const end = performance.now() + 800;
        const sample = () => {
          window.__bottomTrace.push({
            open: n.activeInHierarchy,
            opacity: n.getComponent(cc.UIOpacity).opacity,
            scale: n.scale.x,
          });
          if (performance.now() < end) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await input.click(before.buildings.find((b) => b.id === 'b5'));
      const opening = await snapshot(page);
      assert.ok(opening.open, 'building opens context');
      await page.waitForTimeout(330);
      const settled = await snapshot(page);
      const motion = await page.evaluate(() => window.__bottomTrace);
      assert.ok(
        motion.some((p) => p.open && (p.opacity < 255 || Math.abs(p.scale - 1) > 0.001)),
        `${name} has an animated opening frame: ${JSON.stringify(motion)}`,
      );
      assert.equal(settled.opacity, 255);
      assert.equal(settled.scale, 1);
      assert.equal(settled.solidPanel, false);
      if (width < 640 && height < 700)
        assert.equal(
          settled.toolsVisible,
          false,
          'small-screen tools must not overlap the context',
        );
      assert.ok(settled.icons >= 10);
      assert.ok(settled.y - settled.height / 2 >= -height / 2 + 88);
      assert.ok(settled.y + settled.height / 2 <= height / 2 - 52);
      assert.equal((await inspect(page)).cameraHeight, before.cameraHeight);
      await page.screenshot({ path: `build/screenshots/bottom-${name}-dock.png` });
      await input.click(settled.close);
      assert.equal((await snapshot(page)).open, false);
      assert.equal((await snapshot(page)).toolsVisible, true, 'closing restores tool access');
      await input.button('工具');
      await page.waitForTimeout(330);
      await page.screenshot({ path: `build/screenshots/bottom-${name}-tools.png` });
      assert.deepEqual(errors, []);
      records.push({ name, width, height, opening, settled, motion, errors });
      await page.close();
    }
    fs.writeFileSync('build/screenshots/bottom-ui.json', JSON.stringify(records, null, 2));
    console.log(
      'Transparent icon shelf, popup animation, close and stable camera passed at all four sizes.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
