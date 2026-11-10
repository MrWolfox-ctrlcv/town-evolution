/** Real browser mouse and multi-touch events; never invoke game gesture handlers. */
const frame = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const finger = (point, id) => ({ x: point.x, y: point.y, id, radiusX: 2, radiusY: 2, force: 1 });
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
async function drag(page, from, to, touch, holdMs = 0, observe = async () => {}) {
  if (!touch) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await observe('pressed', from);
    if (holdMs) await new Promise((resolve) => setTimeout(resolve, holdMs));
    await observe('held', from);
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(
        from.x + ((to.x - from.x) * i) / 12,
        from.y + ((to.y - from.y) * i) / 12,
      );
      await pause();
      if (i === 6 || i === 12)
        await observe(`move-${i}`, {
          x: from.x + ((to.x - from.x) * i) / 12,
          y: from.y + ((to.y - from.y) * i) / 12,
        });
    }
    await page.mouse.up();
  } else {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [finger(from, 1)],
      });
      await observe('pressed', from);
      if (holdMs) await new Promise((resolve) => setTimeout(resolve, holdMs));
      await observe('held', from);
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            finger(
              { x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 },
              1,
            ),
          ],
        });
        await pause();
        if (i === 6 || i === 12)
          await observe(`move-${i}`, {
            x: from.x + ((to.x - from.x) * i) / 12,
            y: from.y + ((to.y - from.y) * i) / 12,
          });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
  }
  await observe('released', to);
  await frame(page);
}
async function pinch(page, center, startRadius = 24, endRadius = 42) {
  const cdp = await page.context().newCDPSession(page);
  const points = (radius) => [
    finger({ x: center.x - radius, y: center.y }, 1),
    finger({ x: center.x + radius, y: center.y }, 2),
  ];
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points(startRadius),
    });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: points(startRadius + ((endRadius - startRadius) * i) / 12),
      });
      await pause();
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: points(endRadius).slice(0, 1),
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
  await frame(page);
}
async function interruptDrag(page, from, toward) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [finger(from, 1)],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [finger(toward, 1)],
    });
    await frame(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [finger(toward, 1), finger({ x: 150, y: 35 }, 2)],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
  await frame(page);
}
async function dragPath(page, points, touch) {
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  try {
    if (touch)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [finger(points[0], 1)],
      });
    else {
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
    }
    for (let segment = 1; segment < points.length; segment++) {
      const from = points[segment - 1],
        to = points[segment];
      for (let step = 1; step <= 8; step++) {
        const point = {
          x: from.x + ((to.x - from.x) * step) / 8,
          y: from.y + ((to.y - from.y) * step) / 8,
        };
        if (touch)
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [finger(point, 1)],
          });
        else await page.mouse.move(point.x, point.y);
        await pause();
      }
    }
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.up();
  } finally {
    await cdp?.detach();
  }
  await frame(page);
}
module.exports = { frame, drag, dragPath, pinch, interruptDrag };
