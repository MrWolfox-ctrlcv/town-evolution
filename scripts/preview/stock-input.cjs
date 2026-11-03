/** Verify end-only chip transfers with actual release versus actual cancellation. */
const assert = require('node:assert/strict');
const { inspect } = require('./ui-driver.cjs');
const { frame } = require('./pointer-input.cjs');
module.exports = async function stockDrop(page, toolName, targetId, touch, ending = 'release') {
  const before = await inspect(page);
  const from = before.tools.find((tool) => tool.name === toolName);
  const to = before.buildings.find((building) => building.id === targetId);
  assert.ok(from && to, 'Visible stock chip and rendered target exist');
  const finger = (point, id = 1) => ({
    x: point.x,
    y: point.y,
    id,
    radiusX: 2,
    radiusY: 2,
    force: 1,
  });
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  try {
    if (touch)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [finger(from)],
      });
    else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
    }
    for (let step = 1; step <= 12; step++) {
      const point = {
        x: from.x + ((to.x - from.x) * step) / 12,
        y: from.y + ((to.y - from.y) * step) / 12,
      };
      if (touch)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [finger(point)],
        });
      else await page.mouse.move(point.x, point.y);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await frame(page);
    assert.deepEqual(
      (await inspect(page)).save,
      before.save,
      'Hover/move cannot transfer inventory',
    );
    if (touch) {
      if (ending === 'second-finger') {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [finger(to), finger({ x: 150, y: 35 }, 2)],
        });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await cdp.send('Input.dispatchTouchEvent', {
          type: ending === 'cancel' ? 'touchCancel' : 'touchEnd',
          touchPoints: [],
        });
      }
    } else {
      if (ending !== 'release') await page.mouse.move(150, 35); // invalid HUD drop, not an OS-cancel claim
      await page.mouse.up();
      await page.mouse.up(); // duplicate release must never commit twice
    }
  } finally {
    await cdp?.detach();
  }
  await frame(page);
  const after = await inspect(page);
  if (ending !== 'release')
    assert.deepEqual(after.save, before.save, 'Cancelled stock gesture must not transfer');
  return after;
};
