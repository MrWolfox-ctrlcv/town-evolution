const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hudLayout } = require('../.domain-build/application/HudLayout.js');
for (const [width, height] of [
  [360, 800],
  [390, 844],
  [320, 568],
  [800, 360],
  [568, 320],
  [1024, 768],
  [1920, 1080],
]) {
  test(`HUD ${width}x${height} preserves touch targets and valid viewport`, () => {
    const l = hudLayout(width, height);
    assert.equal(l.width, width);
    assert.equal(l.height, height);
    assert.ok(l.mapHeight > 0);
    assert.ok(l.mapWidth > 0);
    assert.ok((l.bottom + l.mapHeight) / height <= 1);
    assert.ok(l.panelY - l.panelHeight / 2 >= -height / 2);
    assert.ok(l.panelY + l.panelHeight / 2 <= height / 2);
    assert.ok((l.panelWidth - 40) / 4 >= 48, 'Tab width must remain >=48 UI points');
    assert.ok((l.panelWidth - 32) / 2 >= 96, 'Two-column action buttons have readable width');
    if (width > height * 1.25 && width >= 480) assert.ok(l.right > 0);
    else assert.equal(l.right, 0);
  });
}
