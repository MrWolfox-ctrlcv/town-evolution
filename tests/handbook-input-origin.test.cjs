const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/map-contact-ui.cjs');
function paperFixture() {
  const f = fixture();
  for (const name of ['RecipeBookOpen', 'RecipeCategory-gather-wood']) {
    const node = f.get(name);
    f.send('start', 90, node);
    f.send('end', 90, node);
  }
  f.paper = f.get('RecipeHandbook');
  f.point = f.geometry(f.paper);
  return f;
}
for (const finger of [0, 7])
  test(`handbook rejects mixed mouse and finger ${finger} without pinch or drag`, () => {
    const f = paperFixture(),
      p = f.point;
    f.send('start', finger, f.paper, p);
    const before = { position: { ...f.book.position }, scale: f.book.scale };
    f.send('start', 0, f.paper, { x: p.x - 70, y: p.y }, { mouse: true });
    f.send('move', 0, f.paper, { x: p.x - 100, y: p.y }, { mouse: true });
    assert.deepEqual({ position: f.book.position, scale: f.book.scale }, before);
    assert.equal(f.book.pointers.size, 0);
  });
test('foreign mouse END cannot retain or complete a finger-owned paper gesture', () => {
  const f = paperFixture();
  f.send('start', 0, f.paper, f.point);
  f.send('end', 0, f.paper, f.point, { mouse: true });
  assert.equal(f.book.pointers.size, 0);
  assert.equal(f.book.buttonPointers.size, 0);
});
for (const mouse of [false, true])
  test(`ordinary ${mouse ? 'mouse' : 'finger'} paper dragging remains available`, () => {
    const f = paperFixture(),
      p = f.point;
    f.send('start', 0, f.paper, p, { mouse });
    const before = { ...f.book.position };
    f.send('move', 0, f.paper, { x: p.x - 30, y: p.y + 30 }, { mouse });
    assert.notDeepEqual(f.book.position, before);
    f.send('end', 0, f.paper, { x: p.x - 30, y: p.y + 30 }, { mouse });
    assert.equal(f.book.pointers.size, 0);
  });
test('two genuine fingers still pinch the paper', () => {
  const f = paperFixture(),
    p = f.point;
  f.send('start', 7, f.paper, p);
  f.send('start', 8, f.paper, { x: p.x - 70, y: p.y });
  const before = f.book.scale;
  f.send('move', 8, f.paper, { x: p.x - 100, y: p.y });
  assert.ok(f.book.scale > before);
});
test('multiple mouse buttons cancel paper dragging', () => {
  const f = paperFixture(),
    p = f.point;
  f.send('start', 0, f.paper, p, { mouse: true, button: 0 });
  const before = { position: { ...f.book.position }, scale: f.book.scale };
  f.send('start', 0, f.paper, { x: p.x - 50, y: p.y }, { mouse: true, button: 2 });
  f.send('move', 0, f.paper, { x: p.x - 90, y: p.y }, { mouse: true, button: 2 });
  assert.deepEqual({ position: f.book.position, scale: f.book.scale }, before);
  assert.equal(f.book.pointers.size, 0);
});
test('foreign mouse move cannot move a finger-owned paper contact', () => {
  const f = paperFixture(),
    p = f.point;
  f.send('start', 0, f.paper, p);
  const before = { ...f.book.position };
  f.send('move', 0, f.paper, { x: p.x - 50, y: p.y + 50 }, { mouse: true });
  assert.deepEqual(f.book.position, before);
  assert.equal(f.book.pointers.size, 0);
});
test('true touch cancellation clears pinch and allows a fresh paper drag', () => {
  const f = paperFixture(),
    p = f.point;
  f.send('start', 7, f.paper, p);
  f.send('start', 8, f.paper, { x: p.x - 70, y: p.y });
  f.send('cancel', 7, f.paper, p);
  assert.equal(f.book.pointers.size, 0);
  f.send('end', 8, f.paper, { x: p.x - 70, y: p.y });
  f.send('start', 9, f.paper, p);
  const before = { ...f.book.position };
  f.send('move', 9, f.paper, { x: p.x - 30, y: p.y + 30 });
  assert.notDeepEqual(f.book.position, before);
});
test('focus reset ignores a stale engine contact when a fresh finger drags paper', () => {
  const f = paperFixture(),
    p = f.point;
  f.send('start', 7, f.paper, p);
  f.reset();
  assert.ok(f.engineInput.getAllTouches().some((touch) => touch.getID() === 7));
  const before = { ...f.book.position };
  f.send('start', 8, f.paper, { x: p.x - 30, y: p.y });
  f.send('move', 8, f.paper, { x: p.x - 60, y: p.y + 30 });
  assert.notDeepEqual(f.book.position, before);
  assert.deepEqual([...f.book.pointers.keys()], [8]);
  f.send('end', 8, f.paper, { x: p.x - 60, y: p.y + 30 });
  assert.equal(f.book.pointers.size, 0);
});
test('focus reset ignores stale contacts when a fresh finger presses paper Close', () => {
  const f = paperFixture();
  f.send('start', 7, f.paper, f.point);
  f.reset();
  const close = f.get('RecipeBookClose');
  f.send('start', 8, close);
  f.send('end', 8, close);
  assert.equal(f.book.view, 'closed');
  assert.equal(f.book.pointers.size, 0);
  assert.equal(f.book.buttonPointers.size, 0);
});
