const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TapGesture } = require('../.domain-build/application/TapGesture.js');
test('stationary primary touch is one tap', () => {
  const g = new TapGesture();
  assert.equal(g.begin(1, { x: 0, y: 0 }), true);
  assert.equal(g.end(1), true);
  assert.equal(g.end(1), false);
});
test('drag suppresses a tap and uses logical distance', () => {
  const g = new TapGesture();
  g.begin(1, { x: 0, y: 0 });
  assert.equal(g.move(1, { x: 20, y: 0 }), true);
  assert.equal(g.end(1), false);
});
test('secondary touch cannot restart, drag, or finish primary gesture', () => {
  const g = new TapGesture();
  g.begin(1, { x: 0, y: 0 });
  assert.equal(g.begin(2, { x: 100, y: 100 }), false);
  assert.equal(g.move(2, { x: 200, y: 200 }), false);
  assert.equal(g.end(2), false);
  assert.equal(g.end(1), true);
});
test('cancel and lifecycle reset prevent phantom release taps', () => {
  const g = new TapGesture();
  g.begin(1, { x: 0, y: 0 });
  g.cancel(2);
  assert.equal(g.end(1), true);
  g.begin(3, { x: 0, y: 0 });
  g.cancel();
  assert.equal(g.end(3), false);
  assert.equal(g.begin(4, { x: 1, y: 1 }), true);
});
