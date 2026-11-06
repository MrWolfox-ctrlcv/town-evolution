/** Real browser input regression for object-bound radial actions and global town controls. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const engine = path.resolve(
  process.env.PREVIEW_TOOLS || process.env.COCOS_ENGINE || 'temp/cocos-engine',
);
const { chromium } = require(path.join(engine, 'node_modules/playwright'));
const { ready, inspect, until, driver } = require('./ui-driver.cjs');
const { pinch, dragPath } = require('./pointer-input.cjs');
async function snapshot(page, id) {
  return page.evaluate(async (id) => {
    const cc = await System.import('cc'),
      scene = cc.director.getScene();
    const all = scene.getComponentsInChildren(cc.UITransform);
    const cameras = scene.getComponentsInChildren(cc.Camera);
    const ui = cameras.find((c) => c.node.name === 'UICamera');
    const world = cameras.find((c) => c.node.name === 'WorldCamera');
    const canvas = document.querySelector('canvas'),
      rect = canvas.getBoundingClientRect();
    const project = (camera, p) => {
      const q = camera.worldToScreen(p);
      return {
        x: rect.left + (q.x * rect.width) / canvas.width,
        y: rect.top + ((canvas.height - q.y) * rect.height) / canvas.height,
      };
    };
    const box = (points) => ({
      left: Math.min(...points.map((p) => p.x)),
      right: Math.max(...points.map((p) => p.x)),
      top: Math.min(...points.map((p) => p.y)),
      bottom: Math.max(...points.map((p) => p.y)),
    });
    const find = (n) => (n.name === id ? n : n.children.map(find).find(Boolean));
    const object = find(scene),
      corners = [];
    for (const r of object?.getComponentsInChildren(cc.MeshRenderer) ?? []) {
      if (!r.mesh) continue;
      const lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < r.mesh.struct.primitives.length; i++) {
        const values = r.mesh.readAttribute(i, cc.gfx.AttributeName.ATTR_POSITION);
        for (let j = 0; j < (values?.length ?? 0); j++) {
          lo[j % 3] = Math.min(lo[j % 3], values[j]);
          hi[j % 3] = Math.max(hi[j % 3], values[j]);
        }
      }
      for (const x of [lo[0], hi[0]])
        for (const y of [lo[1], hi[1]])
          for (const z of [lo[2], hi[2]]) {
            const p = new cc.Vec3(x, y, z);
            cc.Vec3.transformMat4(p, p, r.node.worldMatrix);
            corners.push(project(world, p));
          }
    }
    const buttons = all
      .filter((t) => t.node.name.startsWith('ObjectAction-') && t.node.activeInHierarchy)
      .map((t) => {
        const center = project(ui, t.node.worldPosition),
          w = (t.width * t.node.worldScale.x * rect.width) / canvas.width,
          h = (t.height * t.node.worldScale.y * rect.height) / canvas.height;
        return {
          ...center,
          text: t.node.getComponentsInChildren(cc.Label)[0]?.string,
          left: center.x - w / 2,
          right: center.x + w / 2,
          top: center.y - h / 2,
          bottom: center.y + h / 2,
        };
      });
    return {
      buttons,
      object: corners.length ? box(corners) : null,
      shelf: all.find((t) => t.node.name === 'Controls').node.activeInHierarchy,
      radial: all.find((t) => t.node.name === 'ObjectRadialActions').node.activeInHierarchy,
    };
  }, id);
}
function verify(state, width, height) {
  assert.equal(state.shelf, false, 'Object selection never opens the old bottom shelf');
  assert.ok(state.radial && state.buttons.length >= 2, 'Selected object exposes radial actions');
  const overlap = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const [i, button] of state.buttons.entries()) {
    assert.ok(button.right - button.left >= 44 && button.bottom - button.top >= 44);
    assert.ok(
      button.left >= 0 && button.right <= width && button.top >= 0 && button.bottom <= height,
    );
    assert.equal(overlap(button, state.object), false, 'Rendered object remains unobscured');
    for (const other of state.buttons.slice(0, i)) assert.equal(overlap(button, other), false);
  }
}
(async () => {
  const browser = await chromium.launch({
    chromiumSandbox: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  });
  const records = [],
    evidence = path.resolve('build/screenshots');
  fs.mkdirSync(evidence, { recursive: true });
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
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4178');
      await ready(page);
      const input = driver(page, touch);
      await input.button('游览演示岛');
      await input.townActions();
      await input.button('存档');
      await input.button('立即保存');
      await input.button('返回游戏');
      const before = await until(page, (s) => !!s.save, 'demo save');
      const house = before.save.buildings.find((b) => b.kind === 'house');
      assert.ok(house);
      await input.click(before.buildings.find((b) => b.id === house.id));
      await page.waitForTimeout(350);
      const opened = await snapshot(page, house.id);
      verify(opened, width, height);
      assert.equal(
        (await inspect(page)).cameraHeight,
        before.cameraHeight,
        'Opening never changes camera framing',
      );
      await input.button('转向');
      await until(
        page,
        (s) => s.save.buildings.find((b) => b.id === house.id).rotation !== house.rotation,
        'rotation commits once',
      );
      verify(await snapshot(page, house.id), width, height);
      if (touch) await pinch(page, { x: width / 2, y: height / 2 }, 28, 42);
      else {
        await page.mouse.move(width / 2, height / 2);
        await page.mouse.wheel(0, -180);
      }
      await page.waitForTimeout(350);
      verify(await snapshot(page, house.id), width, height);
      await page.screenshot({ path: path.join(evidence, `radial-${name}-house.png`) });
      const current = await snapshot(page, house.id);
      await input.click(current.buttons.find((b) => b.text === '关闭'));
      await page.waitForTimeout(650);
      assert.equal(
        (await snapshot(page, house.id)).radial,
        false,
        'Closed menu does not reopen on tick',
      );
      await input.click((await inspect(page)).buildings.find((b) => b.id === house.id));
      const origin = (await inspect(page)).buildings.find((b) => b.id === house.id);
      await dragPath(page, [origin, { x: origin.x + 32, y: origin.y + 18 }], touch);
      verify(await snapshot(page, house.id), width, height);
      await input.townActions();
      await page.waitForTimeout(300);
      assert.equal(
        (await snapshot(page, house.id)).radial,
        false,
        'Town settings stay a separate global panel',
      );
      assert.deepEqual(errors, []);
      records.push({ name, opened, errors });
      await page.close();
    }
    fs.writeFileSync(path.join(evidence, 'radial-ui.json'), JSON.stringify(records, null, 2));
    console.log(
      'Object radial selection, rotation, zoom, pan, close/reopen and global town controls passed at four sizes.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
