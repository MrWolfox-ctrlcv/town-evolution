/** Production controls plus real Cocos pointer dispatcher, not GPU/device QA. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/map-contact-ui.cjs');

for (const [label, owner, foreign] of [
  ['finger vs mouse', {}, { mouse: true }],
  ['left vs right mouse', { mouse: true, button: 0 }, { mouse: true, button: 2 }],
  ['finger vs unknown', {}, { origin: 'unknown' }],
])
  for (const target of ['map', 'tool', 'button', 'pager'])
    for (const phase of ['move', 'end'])
      test(`${target}: ${label} foreign ${phase} cannot finish or move the captured gesture`, () => {
        const f = fixture({ height: 667 });
        const calls = [];
        f.tray.setHandlers({
          begin: () => calls.push('begin'),
          move: () => calls.push('move'),
          end: () => calls.push('end'),
          cancel: () => calls.push('cancel'),
        });
        const node = {
          map: f.input,
          tool: f.get('axeTool'),
          button: f.button,
          pager: f.get('ProductsRightNext'),
        }[target];
        const point = f.geometry(node);
        const page = f.tray.right.page;
        f.events.length = 0;
        f.send('start', 0, node, point, owner);
        f.send(phase, 0, node, point, foreign);
        f.send('end', 0, node, point, owner);
        assert.ok(!f.events.some((e) => ['tap', 'drop', 'button', 'pan', 'pinch'].includes(e)));
        assert.ok(!calls.includes('end') && !calls.includes('move'));
        assert.equal(f.tray.right.page, page);
        f.unchanged();
        // The original source is now up; a fresh map gesture must recover.
        f.events.length = 0;
        f.tap(18);
        assert.equal(f.events.filter((e) => e === 'tap').length, 1);
      });

for (const fingerFirst of [false, true])
  for (const mouseFirstRelease of [false, true])
    test(`colliding finger0 and mouse0 map/tool capture clears orphan: finger-first=${fingerFirst}, mouse-up-first=${mouseFirstRelease}`, () => {
      const f = fixture(),
        axe = f.get('axeTool'),
        mouse = { mouse: true };
      const beginFinger = () => f.send('start', 0, f.input);
      const beginMouse = () => f.send('start', 0, axe, undefined, mouse);
      if (fingerFirst) {
        beginFinger();
        beginMouse();
      } else {
        beginMouse();
        beginFinger();
      }
      const endFinger = () => f.send('end', 0, f.input);
      const endMouse = () => f.send('end', 0, axe, undefined, mouse);
      if (mouseFirstRelease) {
        endMouse();
        endFinger();
      } else {
        endFinger();
        endMouse();
      }
      assert.equal(f.map.interacting, false);
      assert.equal(f.router.active, false);
      assert.equal(f.tray.active, null);
      assert.ok(!f.events.some((e) => ['tap', 'drop', 'button'].includes(e)));
      f.events.length = 0;
      f.tap(1);
      assert.equal(f.events.filter((e) => e === 'tap').length, 1);
      f.unchanged();
    });

for (const firstRelease of [0, 2])
  test(`two mouse buttons cannot combine into a tool or map gesture, release ${firstRelease} first`, () => {
    const f = fixture(),
      axe = f.get('axeTool');
    f.send('start', 0, f.input, undefined, { mouse: true, button: 0 });
    f.send('start', 0, axe, undefined, { mouse: true, button: 2 });
    for (const button of [firstRelease, firstRelease === 0 ? 2 : 0]) {
      f.send('move', 0, axe, undefined, { mouse: true, button });
      f.send('end', 0, axe, undefined, { mouse: true, button });
    }
    assert.ok(!f.events.some((e) => ['tap', 'drop', 'pan', 'pinch'].includes(e)));
    assert.equal(f.map.interacting, false);
    assert.equal(f.router.active, false);
    f.send('start', 0, f.input, undefined, { mouse: true });
    f.send('end', 0, f.input, undefined, { mouse: true });
    assert.equal(f.events.filter((e) => e === 'tap').length, 1);
    f.unchanged();
  });

test('radial finger action is cancelled by a mouse START with its mouse-only snapshot', () => {
  const f = fixture();
  f.send('start', 7, f.button);
  f.send('start', 0, f.input, undefined, { mouse: true });
  f.send('end', 0, f.input, undefined, { mouse: true });
  f.send('end', 7, f.button);
  assert.ok(!f.events.includes('button'));
  f.unchanged();
});

test('a hidden action cannot revive its old closure when its finger ID is reused', () => {
  const f = fixture();
  const button = f.radial.buttons.find((b) => b.node === f.button);
  f.send('start', 7, f.button);
  button.set(null);
  f.send('end', 7, f.button);
  let replacement = 0;
  button.set({ text: 'replacement', run: () => replacement++ });
  f.send('start', 7, f.button);
  f.send('end', 7, f.button);
  assert.equal(replacement, 1);
  assert.ok(!f.events.includes('button'));
  f.unchanged();
});

test('focus reset ignores stale engine contacts when starting a fresh tool gesture', () => {
  const f = fixture(),
    axe = f.get('axeTool');
  const calls = [];
  f.tray.setHandlers({
    begin: () => calls.push('begin'),
    move() {},
    end: () => calls.push('end'),
    cancel() {},
  });
  f.send('start', 7);
  f.reset();
  f.send('start', 0, axe, undefined, { mouse: true });
  f.send('end', 0, axe, undefined, { mouse: true });
  assert.deepEqual(calls, ['begin', 'end']);
  f.unchanged();
});
