const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  radialLayout,
  pointRect,
  overlaps,
  screenBounds,
} = require('../.domain-build/application/RadialLayout.js');
const { objectKey, boundsCorners } = require('../.domain-build/application/ObjectSelection.js');
const { collectionSource } = require('../.domain-build/application/CollectionPath.js');
const centered = { left: -40, right: 40, bottom: -40, top: 50 };
function check(width, height, object, count, obstacles = []) {
  const r = radialLayout(width, height, object, count, obstacles);
  const boxes = r.positions.map((p) => pointRect(p, r.buttonWidth, r.buttonHeight));
  assert.ok(
    r.buttonWidth >= 44 && r.buttonHeight >= 44,
    'Touch targets remain at least 44 logical points',
  );
  for (const [i, box] of boxes.entries()) {
    assert.ok(box.left >= -width / 2 + 8 && box.right <= width / 2 - 8, 'Horizontal safe area');
    assert.ok(
      box.bottom >= -height / 2 + 84 && box.top <= height / 2 - 58,
      'Does not cover fixed navigation/summary',
    );
    assert.equal(overlaps(box, object, 11.99), false, 'Selected model has a clear 12px gap');
    for (const obstacle of obstacles)
      assert.equal(overlaps(box, obstacle, 4.99), false, 'Trays/book remain accessible');
    for (const previous of boxes.slice(0, i))
      assert.equal(overlaps(box, previous, 4.99), false, 'Actions never overlap');
  }
  if (r.heading) {
    const title = pointRect(r.heading, r.headingWidth, 32);
    assert.equal(overlaps(title, object, 11.99), false);
    for (const box of [...boxes, ...obstacles]) assert.equal(overlaps(title, box, 4.99), false);
  }
  return r;
}
test('two and three actions form a symmetric upper fan, never a bottom shelf', () => {
  for (const count of [2, 3]) {
    const r = check(390, 844, centered, count);
    assert.equal(r.positions.length, count);
    assert.ok(r.positions.every((p) => p.y > centered.top));
    assert.ok(r.positions[0].x < 0 && r.positions[count - 1].x > 0);
    assert.ok(Math.abs(r.positions[0].x + r.positions[count - 1].x) < 1);
  }
});
test('up to eight actions encircle a centered object in portrait and tablet layouts', () => {
  for (const [w, h] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1280, 720],
  ]) {
    for (let n = 1; n <= 8; n++) assert.equal(check(w, h, centered, n).positions.length, n);
  }
});
test('all four mobile corners fan inward and preserve non-overlapping object space', () => {
  for (const x of [-150, 150])
    for (const y of [-270, 290]) {
      const r = check(390, 844, pointRect({ x, y }, 90, 100), 8);
      assert.ok(r.positions.length >= 3, 'At least one action plus paging and close fits');
    }
});
test('large fields, landscape and dense tool trays retain only safely fitting slots for paging', () => {
  for (const [w, h] of [
    [390, 844],
    [844, 390],
    [320, 568],
  ]) {
    const obstacles = [];
    for (const x of [-w / 2 + 36, w / 2 - 36])
      for (let y = h / 2 - 90; y > -h / 2 + 110; y -= 60)
        obstacles.push(pointRect({ x, y }, 56, 56));
    const r = check(w, h, pointRect({ x: 0, y: 0 }, 180, 130), 8, obstacles);
    assert.ok(r.positions.length >= 3);
  }
});
test('projection uses physical pixels correctly at DPR 1, 2 and 3 and survives camera transforms', () => {
  const bounds = { min: [1, 0, 2], max: [3, 4, 5] };
  assert.equal(boundsCorners(bounds).length, 8);
  for (const dpr of [1, 2, 3]) {
    const p = collectionSource(
      { x: 220 * dpr, y: 400 * dpr },
      { x: 0, y: 0 },
      { x: dpr, y: dpr },
      { x: 390, y: 844 },
    );
    assert.deepEqual(p, { x: 25, y: -22 });
  }
  assert.deepEqual(
    screenBounds([
      { x: -5, y: -3 },
      { x: 5, y: 9 },
    ]),
    { left: -5, right: 5, bottom: -3, top: 9 },
  );
  assert.equal(screenBounds([{ x: NaN, y: 0 }]), null);
  assert.equal(screenBounds([]), null);
  assert.equal(check(390, 844, pointRect({ x: 1000, y: 1000 }, 50, 50), 8).positions.length, 0);
  assert.equal(objectKey({ kind: 'pile', x: 3, z: 4 }), 'pile:3:4');
});
