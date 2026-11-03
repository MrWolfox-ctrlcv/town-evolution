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

test('contextual sheet reserves only the action rows in use', () => {
  const idle = hudLayout(390, 844, 0);
  const selected = hudLayout(390, 844, 1);
  const tools = hudLayout(390, 844, 4);
  assert.equal(idle.panelHeight, 168);
  assert.equal(selected.panelHeight, 224);
  assert.equal(tools.panelHeight, 280);
  assert.ok(idle.mapHeight > selected.mapHeight);
  assert.ok(selected.mapHeight > tools.mapHeight);
});

const { fittedOrthoHeight } = require('../.domain-build/application/CameraFraming.js');
for (const [width, height] of [
  [390, 844],
  [320, 568],
  [1280, 800],
  [800, 360],
]) {
  test(`initial camera contains island projected bounds at ${width}x${height}`, () => {
    for (const actions of [0, 1, 4]) {
      const layout = hudLayout(width, height, actions);
      const aspect = layout.mapWidth / layout.mapHeight;
      const halfHeight = fittedOrthoHeight(aspect);
      assert.ok(halfHeight >= 8.3);
      assert.ok(halfHeight * aspect >= 10.4 - 1e-9);
    }
  });
}
