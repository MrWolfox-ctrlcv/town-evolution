const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MapGesture } = require('../.domain-build/application/MapGesture.js');
function setup(candidate = null) {
  const events = [];
  let now = 0;
  const handlers = Object.fromEntries(
    ['tap', 'pan', 'pinch', 'drag', 'drop', 'cancel'].map((name) => [
      name,
      (...args) => events.push([name, ...args]),
    ]),
  );
  handlers.candidate = () => candidate;
  return {
    gesture: new MapGesture(handlers, () => now),
    events,
    setTime: (value) => {
      now = value;
    },
  };
}
const point = (x, y = 0) => ({ x, y });
function begin(g, id, x, y = 0) {
  g.begin(id, point(x, y), point(x, y));
}
function move(g, id, x, y = 0) {
  g.move(id, point(x, y), point(x, y));
}
test('tap jitter never pans, and pan starts from original ground anchor', () => {
  const { gesture: g, events: e } = setup();
  begin(g, 1, 0);
  move(g, 1, 5);
  g.end(1, point(5));
  assert.equal(e[0][0], 'tap');
  e.length = 0;
  begin(g, 1, 0);
  move(g, 1, 5);
  move(g, 1, 20, 15);
  move(g, 1, 25, 20);
  g.end(1, point(25, 20));
  assert.deepEqual(
    e.filter((x) => x[0] === 'pan'),
    [
      ['pan', point(0), point(20, 15)],
      ['pan', point(20, 15), point(25, 20)],
    ],
  );
  assert.equal(
    e.some((x) => x[0] === 'tap'),
    false,
  );
});
test('held building candidate becomes a drag, drop occurs once on release', () => {
  const { gesture: g, events: e, setTime } = setup('cooler');
  begin(g, 1, 0);
  move(g, 1, 11);
  assert.equal(e.length, 0);
  setTime(400);
  move(g, 1, 20);
  g.end(1, point(30));
  g.end(1, point(30));
  assert.deepEqual(
    e.filter((x) => x[0] === 'drag' || x[0] === 'drop'),
    [
      ['drag', 'cooler', point(20)],
      ['drop', 'cooler', point(30)],
    ],
  );
  assert.equal(
    e.some((x) => x[0] === 'pan'),
    false,
  );
});
test('second touch cancels drag and pinch never ends as tap or merge', () => {
  const { gesture: g, events: e, setTime } = setup('cooler');
  begin(g, 1, 0);
  setTime(400);
  move(g, 1, 20);
  begin(g, 2, 40);
  move(g, 2, 60);
  assert.ok(e.some((x) => x[0] === 'cancel'));
  assert.deepEqual(
    e.find((x) => x[0] === 'pinch'),
    ['pinch', point(30), point(40), 0.5],
  );
  g.end(2, point(60));
  move(g, 1, 100);
  g.end(1, point(100));
  assert.equal(
    e.some((x) => x[0] === 'drop' || x[0] === 'tap' || x[0] === 'pan'),
    false,
  );
});
test('cancellation discards all pointers; next fresh gesture can tap', () => {
  const { gesture: g, events: e } = setup('warehouse');
  begin(g, 1, 0);
  move(g, 1, 30);
  g.clear();
  g.end(1, point(30));
  assert.equal(
    e.some((x) => x[0] === 'drop'),
    false,
  );
  begin(g, 3, 0);
  g.end(3, point(0));
  assert.equal(e.filter((x) => x[0] === 'tap').length, 1);
});
test('threshold uses logical points independently of screen pixel ratio', () => {
  const { gesture: g, events: e } = setup();
  g.begin(1, point(0), point(0));
  g.move(1, point(30), point(10));
  assert.equal(e.length, 0);
  g.move(1, point(42), point(14));
  assert.deepEqual(e[0], ['pan', point(0), point(42)]);
});
test('third finger blocks the whole sequence rather than jumping anchors', () => {
  const { gesture: g, events: e } = setup();
  begin(g, 1, 0);
  begin(g, 2, 30);
  begin(g, 3, 60);
  move(g, 1, 10);
  g.end(3, point(60));
  move(g, 2, 50);
  g.end(2, point(50));
  g.end(1, point(10));
  assert.equal(
    e.some((x) => ['tap', 'drop', 'pan', 'pinch'].includes(x[0])),
    false,
  );
});
test('external HUD contact cancels merge; map second contact may enter pinch', () => {
  const { gesture: g, events: e, setTime } = setup('cooler');
  begin(g, 1, 0);
  setTime(400);
  move(g, 1, 20);
  g.interrupt();
  move(g, 1, 50);
  g.end(1, point(50));
  assert.equal(
    e.some((x) => x[0] === 'drop' || x[0] === 'tap'),
    false,
  );
  e.length = 0;
  begin(g, 1, 0);
  g.interrupt();
  begin(g, 2, 40);
  move(g, 2, 80);
  assert.ok(e.some((x) => x[0] === 'pinch'));
  g.end(2, point(80));
  g.end(1, point(0));
  assert.equal(
    e.some((x) => x[0] === 'drop' || x[0] === 'tap'),
    false,
  );
});

test('stationary long press lifts at400ms without requiring initial selection', () => {
  const { gesture: g, events: e, setTime } = setup('farm');
  begin(g, 1, 0);
  setTime(399);
  g.poll();
  assert.equal(e.length, 0);
  setTime(400);
  g.poll();
  assert.deepEqual(e[0], ['drag', 'farm', point(0)]);
  g.poll();
  assert.equal(e.length, 1);
  move(g, 1, 5);
  assert.deepEqual(e[1], ['drag', 'farm', point(5)]);
  g.end(1, point(5));
  assert.equal(e.filter((v) => v[0] === 'drop').length, 1);
});
test('movement before long-press threshold stays pan even if finger is held later', () => {
  const { gesture: g, events: e, setTime } = setup('warehouse');
  begin(g, 1, 0);
  setTime(100);
  move(g, 1, 20);
  setTime(800);
  g.poll();
  move(g, 1, 30);
  g.end(1, point(30));
  assert.equal(
    e.some((v) => v[0] === 'drag' || v[0] === 'drop'),
    false,
  );
  assert.equal(e.filter((v) => v[0] === 'pan').length, 2);
});

test('navigation state distinguishes held pan/pinch from object drag and cancelled contacts', () => {
  const empty = setup();
  assert.equal(empty.gesture.navigating, false);
  begin(empty.gesture, 1, 0);
  assert.equal(empty.gesture.navigating, true);
  move(empty.gesture, 1, 30);
  assert.equal(empty.gesture.navigating, true);
  begin(empty.gesture, 2, 50);
  assert.equal(empty.gesture.navigating, true);
  empty.gesture.interrupt();
  assert.equal(empty.gesture.navigating, false);
  const object = setup('building:b1');
  begin(object.gesture, 1, 0);
  assert.equal(object.gesture.navigating, false);
  object.setTime(500);
  object.gesture.poll();
  assert.equal(object.gesture.navigating, false);
  object.gesture.clear();
  begin(object.gesture, 1, 0);
  move(object.gesture, 1, 30);
  assert.equal(object.gesture.navigating, true, 'quick swipe on an object is still a pan');
});
