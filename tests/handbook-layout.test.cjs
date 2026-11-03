const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  handbookLayout,
  handbookLauncher,
  RECIPE_PAPER,
} = require('../.domain-build/application/HandbookLayout.js');
for (const [width, height] of [
  [280, 420],
  [320, 568],
  [360, 640],
  [568, 320],
  [800, 600],
  [1280, 720],
]) {
  test(`recipe paper remains reachable at all zoom levels on ${width}x${height}`, () => {
    for (const scale of [0.1, 0.75, 1, 1.65, 10]) {
      for (const point of [undefined, { x: 9999, y: 9999 }, { x: -9999, y: -9999 }]) {
        const box = handbookLayout(width, height, point, scale);
        assert.ok(Math.abs(box.x) + box.width / 2 <= width / 2 - 8 + 0.001);
        assert.ok(Math.abs(box.y) + box.height / 2 <= height / 2 - 8 + 0.001);
        assert.equal(box.width, RECIPE_PAPER.width * box.scale);
        assert.equal(box.height, RECIPE_PAPER.height * box.scale);
      }
    }
  });
  test(`closed folder fits its normal or compact pocket on ${width}x${height}`, () => {
    const bottom = width > height ? 8 : 180;
    const box = handbookLauncher(width, height, bottom);
    assert.equal(box.size, height - bottom - 52 < 132 ? 48 : 64);
    assert.ok(box.x + box.size / 2 <= width / 2 - 8);
    assert.ok(box.y - box.size / 2 >= -height / 2 + bottom);
    assert.ok(box.y + box.size / 2 <= height / 2 - 4);
  });
}
test('paper position is preserved on refresh and clamped after rotation', () => {
  const point = { x: 180, y: 60 };
  const box = handbookLayout(1000, 700, point, 1.2);
  assert.equal(box.x, 180);
  assert.equal(box.y, 60);
  assert.equal(box.scale, 1.2);
  const rotated = handbookLayout(320, 568, point, 1.2);
  assert.ok(rotated.x + rotated.width / 2 <= 152);
});
test('default paper gives readable detail space and fits phone width', () => {
  const box = handbookLayout(390, 844);
  assert.equal(box.width, 320);
  assert.equal(box.height, 350);
  assert.equal(box.scale, 1);
});

test('right stock entries and pager clear the folder on narrow phone and landscape', () => {
  const { hudLayout } = require('../.domain-build/application/HudLayout.js');
  for (const [width, height] of [
    [280, 420],
    [320, 568],
    [568, 320],
    [390, 844],
  ]) {
    for (const actions of [0, 2, 4, 6]) {
      const hud = hudLayout(width, height, actions);
      const folder = handbookLauncher(width, height, hud.bottom);
      if (height - hud.top - hud.bottom < 132) {
        assert.equal(folder.y, height / 2 - 28, 'Short map uses empty summary-side pocket');
        assert.ok(
          folder.x - folder.size / 2 > hud.summaryX + hud.summaryWidth / 2,
          'Pocket clears summary',
        );
      }
      const available = Math.max(56, height - hud.top - hud.bottom);
      // Match ToolTray's reserved pocket and TrayColumn's compact/paging geometry.
      const rightHeight = Math.max(56, available - 72);
      const compact = rightHeight < 114;
      const slots = Math.max(1, Math.floor((rightHeight - 54) / 60));
      const trayX = width / 2 - 36,
        trayY = height / 2 - hud.top - 30;
      const separated = (x, y, w, h) =>
        Math.abs(x - folder.x) >= (w + folder.size) / 2 ||
        Math.abs(y - folder.y) >= (h + folder.size) / 2;
      for (let i = 0; i < Math.min(6, slots); i++)
        assert.ok(
          separated(trayX, trayY - i * 60, 56, 56),
          `stock ${i} collides at ${width}x${height}, actions=${actions}`,
        );
      if (slots < 6)
        assert.ok(
          separated(trayX - (compact ? 58 : 0), trayY - (compact ? 0 : slots * 60), 56, 48),
          `pager collides at ${width}x${height}, actions=${actions}`,
        );
    }
  }
});

test('paper hit-test boundary uses physical positions while dragging uses logical positions', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '../assets/scripts/presentation/RecipeHandbook.ts'),
    'utf8',
  );
  // Source-level contract guard, not a substitute for the real DPR2 browser gesture suite.
  assert.match(source, /hitTest\(event\.getLocation\(\)\)/);
  assert.match(source, /hitTest\(touch\.getLocation\(\)\)/);
  assert.doesNotMatch(source, /hitTest\((?:event|touch)\.getUILocation\(\)\)/);
  assert.match(source, /const point = event\.getUILocation\(\)/);
});

test('directory and paper share drag placement and contain no zoom button controls', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(
    require('node:path').join(__dirname, '../assets/scripts/presentation/RecipeHandbook.ts'),
    'utf8',
  );
  assert.match(source, /for \(const sheet of \[this.directory, this.paper\]\)/);
  assert.match(source, /sheet.on\(Node.EventType.TOUCH_MOVE, this.move, this\)/);
  assert.match(source, /sheet.setPosition\(box.x, box.y\)/);
  assert.match(source, /point \?\? this.position \?\? initial/);
  assert.doesNotMatch(source, /RecipeZoom(?:In|Out)/);
});
