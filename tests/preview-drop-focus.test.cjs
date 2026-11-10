const test = require('node:test');
const assert = require('node:assert/strict');
const { focusDropPair } = require('../scripts/preview/focus-drop-pair.cjs');
test('overview targets 1.36 pixels apart require real zoom before direct drag', async () => {
  const widths = [1.36, 2.72, 5.44, 10.88, 21.76, 43.52];
  let index = 0,
    zooms = 0;
  const state = () => ({
    cameraHeight: 360 / 2 ** index,
    drops: [
      { id: 'source', x: 180 - widths[index] / 2, y: 338 },
      { id: 'target', x: 180 + widths[index] / 2, y: 338 },
    ],
  });
  const view = await focusDropPair(
    { viewportSize: () => ({ width: 390, height: 844 }) },
    'source',
    'target',
    true,
    {
      inspect: async () => state(),
      zoom: async (center) => {
        assert.deepEqual(center, { x: 180, y: 338 });
        index++;
        zooms++;
      },
      until: async (_page, predicate) => {
        assert.equal(predicate(state()), true);
        return state();
      },
    },
  );
  assert.equal(zooms, 5);
  assert.equal(view.drops[1].x - view.drops[0].x, 43.51999999999998);
});
test('already separable drop targets need no zoom or repeat gesture', async () => {
  const view = {
    drops: [
      { id: 'a', x: 100, y: 300 },
      { id: 'b', x: 140, y: 300 },
    ],
  };
  assert.equal(
    await focusDropPair({}, 'a', 'b', false, {
      inspect: async () => view,
      zoom: () => assert.fail('unnecessary zoom'),
    }),
    view,
  );
});
