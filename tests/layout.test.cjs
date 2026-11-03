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
    if (width > height * 1.25 && width >= 480) assert.ok(l.sidebar > 0);
    else assert.equal(l.sidebar, 0);
  });
}

test('contextual sheet reserves only the action rows in use', () => {
  const idle = hudLayout(390, 844, 0);
  const selected = hudLayout(390, 844, 1);
  const tools = hudLayout(390, 844, 4);
  assert.equal(idle.panelHeight, 140);
  assert.equal(selected.panelHeight, 196);
  assert.equal(tools.panelHeight, 252);
  assert.ok(idle.mapHeight > selected.mapHeight);
  assert.ok(selected.mapHeight > tools.mapHeight);
});

const { fittedOrthoHeight, homeZoom } = require('../.domain-build/application/CameraFraming.js');
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

for (const count of [0, 1, 2, 3, 4]) {
  for (const hasMessage of [false, true]) {
    test(`compact HUD ${count} actions and status ${hasMessage} never overlaps`, () => {
      const l = hudLayout(390, 844, count, hasMessage);
      assert.equal(l.panelHeight, 140 + Math.ceil(count / 2) * 56);
      assert.equal(l.detailY + 12, l.panelHeight / 2 - 8);
      const textBottom = hasMessage ? l.messageY - 10 : l.detailY - 12;
      if (hasMessage)
        assert.ok(l.messageY + 10 <= l.detailY - 12, 'Context and status must not overlap');
      if (count) {
        assert.ok(l.actionStartY + 24 <= textBottom - 8, 'Actions must clear text');
        const lastActionBottom = l.actionStartY - (l.actionRows - 1) * 56 - 24;
        assert.ok(l.tabsY + 24 <= lastActionBottom - 8, 'Tabs must clear action buttons');
      } else assert.ok(l.tabsY + 24 <= textBottom - 8);
      assert.equal(l.tabsY - 24, -l.panelHeight / 2 + 8);
    });
  }
}

test('transient status never changes viewport or cancels an active gesture', () => {
  const quiet = hudLayout(360, 800, 0);
  const notice = hudLayout(360, 800, 0, true);
  assert.equal(quiet.bottom, 156);
  assert.equal(notice.panelHeight - quiet.panelHeight, 0);
  assert.equal(quiet.mapHeight - notice.mapHeight, 0);
});

test('six-action commerce panel stays on screen at small supported sizes', () => {
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [568, 320],
  ]) {
    const layout = hudLayout(width, height, 6);
    assert.equal(layout.actionRows, 3);
    assert.ok(layout.panelY - layout.panelHeight / 2 >= -height / 2);
    assert.ok(layout.panelY + layout.panelHeight / 2 <= height / 2);
    assert.ok(layout.mapHeight > 0);
    assert.ok(layout.actionStartY - 2 * 56 - 24 > layout.tabsY + 24);
  }
});

test('transparent right controls overlay the full-width map without a reserved rail', () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [568, 320],
    [1280, 800],
  ]) {
    const l = hudLayout(width, height, 6);
    assert.equal(l.right, 0);
    assert.equal(l.mapWidth + l.left, width);
    assert.ok(l.summaryX + l.summaryWidth / 2 <= width / 2 - 72);
    if (l.sidebar) {
      assert.equal(l.left, l.sidebar);
      assert.ok(l.panelX + l.panelWidth / 2 <= -width / 2 + l.left);
    } else {
      assert.equal(l.left, 0);
      assert.ok(
        l.panelY + l.panelHeight / 2 < height / 2 - 208,
        'Bottom sheet clears floating tools',
      );
    }
    assert.ok(36 + 144 + 28 <= height);
  }
});

test('expanded map framing scales overview without shrinking initial home view', () => {
  for (const aspect of [0.5, 1, 2]) {
    assert.equal(fittedOrthoHeight(aspect, 24), fittedOrthoHeight(aspect, 12) * 2);
    assert.equal(fittedOrthoHeight(aspect, 24) * homeZoom(24), fittedOrthoHeight(aspect));
  }
});
