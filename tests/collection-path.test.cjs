const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  collectionSource,
  collectionPoint,
} = require('../.domain-build/application/CollectionPath.js');
test('physical collection source matches Cocos UI coordinates at DPR 1 and 2', () => {
  for (const scale of [1, 2, 3]) {
    assert.deepEqual(
      collectionSource(
        { x: 90 * scale, y: 200 * scale },
        { x: 0, y: 0 },
        { x: scale, y: scale },
        { x: 360, y: 640 },
      ),
      { x: -90, y: -120 },
    );
  }
});
test('viewport offset and independent axis scales preserve actual source location', () => {
  assert.deepEqual(
    collectionSource({ x: 220, y: 310 }, { x: 20, y: 10 }, { x: 2, y: 3 }, { x: 360, y: 640 }),
    { x: -80, y: -220 },
  );
});
test('collection arc starts at source and finishes at exact visible target', () => {
  const source = { x: -60, y: -90 },
    target = { x: 160, y: 130 };
  assert.deepEqual(collectionPoint(source, target, 0), source);
  const end = collectionPoint(source, target, 1);
  assert.ok(Math.abs(end.x - target.x) < 1e-9 && Math.abs(end.y - target.y) < 1e-9);
  assert.ok(collectionPoint(source, target, 0.5).y > (source.y + target.y) / 2);
  assert.deepEqual(collectionPoint(source, target, -1), source);
});

const { startCollectionEffect } = require('../.domain-build/application/CollectionPath.js');
test('missing animation feature or startup failure cannot strand a visible source icon', () => {
  let visible = false,
    running = true;
  const missingTween = undefined;
  assert.throws(
    () =>
      startCollectionEffect(
        () => {
          visible = true;
          missingTween({ progress: 0 });
        },
        () => {
          visible = false;
          running = false;
        },
      ),
    TypeError,
  );
  assert.equal(visible, false);
  assert.equal(running, false);
});
test('successful animation startup is not immediately aborted', () => {
  let started = false,
    aborted = false;
  startCollectionEffect(
    () => {
      started = true;
    },
    () => {
      aborted = true;
    },
  );
  assert.equal(started, true);
  assert.equal(aborted, false);
});
