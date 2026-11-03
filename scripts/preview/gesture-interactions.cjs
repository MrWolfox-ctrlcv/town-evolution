/** Assert screen-follow motion and anchored zoom, not merely that the camera changed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, worldPoint, ready } = require('./ui-driver.cjs');
const { frame, drag, pinch } = require('./pointer-input.cjs');
module.exports = async function gestures(page, evidence, name, touch) {
  const before = await inspect(page);
  const empty = await worldPoint(page, { x: 6, z: 8 });
  const delta = touch ? { x: 28, y: -22 } : { x: 46, y: -30 };
  await drag(page, empty, { x: empty.x + delta.x, y: empty.y + delta.y }, touch);
  const panned = await inspect(page);
  const actual = { x: panned.farm.x - before.farm.x, y: panned.farm.y - before.farm.y };
  assert.ok(
    Math.abs(actual.x - delta.x) < 6 && Math.abs(actual.y - delta.y) < 6,
    `Map should follow screen drag: requested ${JSON.stringify(delta)}, got ${JSON.stringify(actual)}`,
  );
  assert.deepEqual(panned.save, before.save, 'Pan must not create commands or saves');
  assert.deepEqual(
    panned.labels.filter((x) => x.action).map((x) => x.text),
    before.labels.filter((x) => x.action).map((x) => x.text),
    'Pan release must not select a building',
  );
  const anchorWorld = { x: 6, z: 6 };
  const anchor = await worldPoint(page, anchorWorld);
  const oldHeight = panned.cameraHeight;
  if (touch) await pinch(page, anchor);
  else {
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.wheel(0, -240);
    await frame(page);
  }
  const zoomed = await inspect(page);
  const projected = await worldPoint(page, anchorWorld);
  assert.ok(zoomed.cameraHeight < oldHeight * 0.9, 'Wheel/pinch spread should zoom in');
  const anchorDrift = Math.hypot(projected.x - anchor.x, projected.y - anchor.y);
  assert.ok(anchorDrift < 4, `Zoom anchor drifted ${anchorDrift}px`);
  assert.deepEqual(zoomed.save, before.save, 'Zoom must not modify game state');
  assert.deepEqual(
    zoomed.labels.filter((x) => x.action).map((x) => x.text),
    before.labels.filter((x) => x.action).map((x) => x.text),
    'Pinch/wheel release must not tap',
  );
  if (!touch) {
    await page.mouse.move(300, 40);
    await page.mouse.wheel(0, -240);
    await frame(page);
    assert.equal(
      (await inspect(page)).cameraHeight,
      zoomed.cameraHeight,
      'Wheel over HUD must not zoom map',
    );
  }
  await page.screenshot({ path: path.join(evidence, `${name}-gesture-zoom.png`) });
  fs.writeFileSync(
    path.join(evidence, `${name}-gestures.json`),
    JSON.stringify(
      {
        passed: true,
        input: touch ? 'multi-touch' : 'mouse',
        requestedPan: delta,
        actualPan: actual,
        oldHeight,
        newHeight: zoomed.cameraHeight,
        anchorDrift,
        checks: [
          'screen-follow pan',
          'anchored zoom',
          'no accidental tap',
          'no resource mutation',
          ...(touch ? [] : ['HUD wheel ignored']),
        ],
      },
      null,
      2,
    ),
  );
  await page.reload(); // restore the normal initial camera through the real page lifecycle
  await ready(page);
};
