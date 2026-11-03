const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hudLayout } = require('../.domain-build/application/HudLayout.js');
const { fittedOrthoHeight, homeZoom } = require('../.domain-build/application/CameraFraming.js');
for (const [width, height] of [
  [320, 568],
  [390, 844],
  [568, 320],
  [800, 360],
  [944, 809],
  [1280, 800],
  [1920, 1080],
]) {
  test(`floating controls preserve full island viewport at ${width}x${height}`, () => {
    for (const count of [0, 1, 2, 3, 4, 5, 6]) {
      const l = hudLayout(width, height, count);
      assert.equal(l.mapWidth, width);
      assert.equal(l.mapHeight, height);
      assert.equal(l.bottom + l.left + l.right, 0);
      assert.ok(l.panelY - l.panelHeight / 2 >= -height / 2);
      assert.ok(l.panelY + l.panelHeight / 2 <= height / 2 - l.top);
      assert.ok(l.panelX - l.panelWidth / 2 >= -width / 2);
      assert.ok(l.panelX + l.panelWidth / 2 <= width / 2);
      assert.ok(l.actionWidth - 8 >= 44, 'icon actions retain touch targets');
      assert.ok(l.panelY - l.panelHeight / 2 > l.tabsY + 38, 'context clears bottom navigation');
      if (count) {
        assert.ok(l.actionStartY + 38 < l.detailY - 25);
        assert.ok(l.actionStartY - (l.actionRows - 1) * 82 - 38 >= -l.panelHeight / 2 + 8);
      }
      assert.deepEqual(hudLayout(width, height, count, true), l, 'status must not move controls');
      const half = fittedOrthoHeight(width / height);
      assert.ok(half >= 8.3 && (half * width) / height >= 10.4 - 1e-9);
    }
  });
}
test('expanded map framing retains the same home view', () => {
  for (const aspect of [0.5, 1, 2]) {
    assert.equal(fittedOrthoHeight(aspect, 24), fittedOrthoHeight(aspect, 12) * 2);
    assert.equal(fittedOrthoHeight(aspect, 24) * homeZoom(24), fittedOrthoHeight(aspect));
  }
});
