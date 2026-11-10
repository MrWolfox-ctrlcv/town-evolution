/** Zoom through real input before manipulating distinct sub-cell objects at overview scale. */
const assert = require('node:assert/strict');
const { inspect, until } = require('./ui-driver.cjs');
const { pinch, frame } = require('./pointer-input.cjs');
const separation = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
async function focusDropPair(page, sourceId, targetId, touch, overrides = {}) {
  const read = overrides.inspect ?? inspect;
  const wait = overrides.until ?? until;
  const zoom =
    overrides.zoom ??
    (async (center) => {
      if (touch) await pinch(page, center, 24, 48);
      else {
        await page.mouse.move(center.x, center.y);
        await page.mouse.wheel(0, -360);
        await frame(page);
      }
    });
  let view = await read(page);
  for (let attempt = 0; attempt <= 6; attempt++) {
    const source = view.drops.find((drop) => drop.id === sourceId);
    const target = view.drops.find((drop) => drop.id === targetId);
    assert.ok(source && target, 'Both rendered loose-drop targets exist');
    if (separation(source, target) >= 28) return view;
    assert.ok(attempt < 6, 'Distinct loose drops must be visually separable before dragging');
    const center = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
    const viewport = page.viewportSize();
    assert.ok(
      center.x > 80 &&
        center.x < viewport.width - 80 &&
        center.y > 100 &&
        center.y < viewport.height - 150,
      'Zoom focus and pinch contacts stay inside the map, clear of UI',
    );
    const height = view.cameraHeight;
    await zoom(center);
    view = await wait(
      page,
      (next) => next.cameraHeight < height * 0.99,
      'real map zoom toward loose drops',
    );
  }
  assert.fail('Loose-drop focus did not finish');
}
module.exports = { focusDropPair, separation };
