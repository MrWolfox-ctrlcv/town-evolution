/** Read-only projection plus real navigation; never moves gameplay objects. */
const assert = require('node:assert/strict');
const { inspect, until, driver } = require('./ui-driver.cjs');
const { pinch, frame, drag } = require('./pointer-input.cjs');
async function projectPoints(page, points) {
  return page.evaluate(async (points) => {
    const cc = await System.import('cc');
    const camera = cc.director
      .getScene()
      .getComponentsInChildren(cc.Camera)
      .find((c) => c.node.name === 'WorldCamera' && c.node.activeInHierarchy);
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas.getBoundingClientRect();
    return points.map((p) => {
      const v = camera.worldToScreen(new cc.Vec3(p.x, p.y || 0, p.z));
      return {
        x: rect.left + (v.x * rect.width) / canvas.width,
        y: rect.top + ((canvas.height - v.y) * rect.height) / canvas.height,
      };
    });
  }, points);
}
const visible = (p, size) =>
  p.x > 85 && p.x < size.width - 85 && p.y > 110 && p.y < size.height - 155;
function framing(points, unit, viewport) {
  return {
    visible: points.every((p) => visible(p, viewport)),
    unitPixels: Math.hypot(unit[0].x - unit[1].x, unit[0].y - unit[1].y),
  };
}
async function focusWorldTargets(page, targets, touch, { unitPixels = 42 } = {}) {
  const { townActions, button } = driver(page, touch);
  const before = (await inspect(page)).save;
  await townActions();
  await button('查看全岛', { exact: true });
  await until(page, (s) => !s.panel.contextVisible, 'overview ready for navigation');
  const centroid = {
    x: targets.reduce((n, p) => n + p.x, 0) / targets.length,
    z: targets.reduce((n, p) => n + p.z, 0) / targets.length,
    y: 0,
  };
  const viewport = page.viewportSize();
  const [anchor] = await projectPoints(page, [centroid]);
  assert.ok(visible(anchor, viewport), 'Overview navigation anchor is visible');
  // Immediate motion pans the map before the long-press object-drag threshold.
  await drag(page, anchor, { x: viewport.width / 2, y: (110 + viewport.height - 155) / 2 }, touch);
  for (let step = 0; step <= 7; step++) {
    const projected = await projectPoints(page, [
      ...targets,
      centroid,
      { ...centroid, x: centroid.x + 1 },
    ]);
    const state = framing(
      projected.slice(0, targets.length),
      projected.slice(-2),
      page.viewportSize(),
    );
    assert.ok(
      state.visible,
      `Operation targets cannot share safe framing: ${JSON.stringify({ targets, projected, state })}`,
    );
    if (state.unitPixels >= unitPixels) {
      const view = await inspect(page);
      assert.deepEqual(view.save, before, 'Navigation never mutates gameplay state');
      return view;
    }
    assert.ok(step < 7, `Navigation cannot reach operable scale: ${JSON.stringify(state)}`);
    const center = projected[targets.length];
    const height = (await inspect(page)).cameraHeight;
    if (touch) await pinch(page, center, 24, 42);
    else {
      await page.mouse.move(center.x, center.y);
      await page.mouse.wheel(0, -280);
      await frame(page);
    }
    await until(page, (s) => s.cameraHeight < height * 0.99, 'real zoom toward operation targets');
  }
}
module.exports = { focusWorldTargets, projectPoints, visible, framing };
