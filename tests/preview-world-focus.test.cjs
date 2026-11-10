const test = require('node:test');
const assert = require('node:assert/strict');
const { framing, visible, projectPoints } = require('../scripts/preview/focus-world-targets.cjs');
test('overview near-identical targets are not treated as operable scale', () => {
  const result = framing(
    [{ x: 180, y: 338 }],
    [
      { x: 180, y: 338 },
      { x: 181.2, y: 338.6 },
    ],
    { width: 390, height: 844 },
  );
  assert.equal(result.visible, true);
  assert.ok(result.unitPixels < 2);
});
test('shared framing rejects offscreen or sidebar targets even when scale sufficient', () => {
  const result = framing(
    [
      { x: 20, y: 330 },
      { x: 220, y: 330 },
    ],
    [
      { x: 180, y: 330 },
      { x: 230, y: 330 },
    ],
    { width: 390, height: 844 },
  );
  assert.equal(result.visible, false);
  assert.equal(result.unitPixels, 50);
  assert.equal(visible({ x: 180, y: 760 }, { width: 390, height: 844 }), false);
});
test('all candidate ground points use one read-only browser projection batch', async () => {
  let calls = 0;
  const inputs = [
    { x: 1, z: 2 },
    { x: 3, z: 4 },
  ];
  const page = {
    evaluate: async (fn, points) => {
      calls++;
      assert.deepEqual(points, inputs);
      return points;
    },
  };
  assert.deepEqual(await projectPoints(page, inputs), inputs);
  assert.equal(calls, 1);
});
