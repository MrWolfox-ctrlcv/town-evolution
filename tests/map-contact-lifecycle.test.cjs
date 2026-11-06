/** Real Cocos 3.8.8 pointer dispatch + production input/HUD controls, not GPU/device QA. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/map-contact-ui.cjs');

test('the vendored dispatcher retains the exact verified Cocos 3.8.8 event algorithm', () => {
  const crypto = require('node:crypto');
  const dispatch = require('./fixtures/cocos-pointer-dispatch.cjs')({}, () => {}, class {});
  assert.equal(
    crypto
      .createHash('sha256')
      .update(
        dispatch
          .toString()
          .replace(/\s/g, '')
          .replace(/,(?=[)\]}])/g, ''),
      )
      .digest('hex'),
    '42cc189e8ebcb21eeb16ba6d5fc3cfac8d766ef52bfd3fa5df283b17d5b0d16b',
  );
});

for (const cancel of [false, true])
  for (const uiFirst of [false, true])
    test(`hidden radial release recovers next map gesture: cancel=${cancel}, UI-first=${uiFirst}`, () => {
      const f = fixture();
      f.send('start', 7, f.button);
      f.send('start', 8);
      f.project();
      assert.equal(f.button.activeInHierarchy, false);
      for (const id of uiFirst ? [7, 8] : [8, 7])
        f.send(cancel ? 'cancel' : 'end', id, id === 7 ? f.button : f.input);
      f.project();
      assert.equal(f.button.activeInHierarchy, true);
      f.events.length = 0;
      f.tap(9);
      assert.equal(f.events.filter((x) => x === 'tap').length, 1, 'fresh map tap must recover');
      assert.deepEqual([...f.map.contacts], []);
      f.send('start', 10);
      f.send('move', 10, f.input, { x: 680, y: 300 });
      f.send('end', 10, f.input, { x: 680, y: 300 });
      assert.ok(f.events.includes('pan'), 'fresh map drag must recover');
      assert.ok(!f.events.includes('button'));
      f.unchanged();
    });

test('mouse event snapshot must not forget a still-held real UI finger', () => {
  const f = fixture();
  f.send('start', 7, f.button);
  f.send('start', 0, f.input, undefined, { mouse: true });
  f.project();
  f.send('end', 0, f.input, undefined, { mouse: true });
  assert.ok(!f.events.includes('tap'));
  assert.ok(f.map.contacts.has(7));
  f.send('end', 7, f.button);
  f.events.length = 0;
  f.tap(21);
  assert.equal(f.events.filter((x) => x === 'tap').length, 1);
  f.unchanged();
});

test('focus reset must not resurrect an old engine contact on the next fresh START', () => {
  const f = fixture();
  f.send('start', 7, f.button);
  f.reset();
  f.events.length = 0;
  f.tap(22);
  assert.equal(f.events.filter((x) => x === 'tap').length, 1);
  assert.ok(!f.map.contacts.has(7));
  f.unchanged();
});

test('a map target hidden before END cancels stale gesture without synthesizing a click', () => {
  const f = fixture();
  f.send('start', 7);
  f.input.active = false;
  f.send('end', 7);
  f.input.active = true;
  f.events.length = 0;
  f.tap(8);
  assert.equal(f.events.filter((x) => x === 'tap').length, 1);
  assert.equal(f.map.interacting, false);
  f.unchanged();
});

test('discarding a missing map contact does not re-arm its still-held partner on duplicate START', () => {
  const f = fixture();
  f.send('start', 1);
  f.send('start', 2);
  f.input.active = false;
  f.send('end', 1);
  f.input.active = true;
  f.events.length = 0;
  f.send('start', 2);
  f.send('end', 2);
  assert.equal(f.events.includes('tap'), false);
  f.tap(3);
  assert.equal(f.events.filter((x) => x === 'tap').length, 1);
  f.unchanged();
});

test('a new engine Touch with a reused ID replaces a missing map sequence', () => {
  const f = fixture();
  f.map.gesture.handlers.candidate = () => 'b1';
  f.send('start', 7);
  f.map.gesture.startedAt -= 500;
  f.map.tick();
  f.input.active = false;
  f.send('end', 7);
  f.input.active = true;
  f.events.length = 0;
  f.tap(7);
  assert.equal(f.events.filter((x) => x === 'tap').length, 1);
  assert.equal(f.events.includes('drop'), false);
  assert.equal(f.map.interacting, false);
  f.unchanged();
});

for (const snapshot of ['empty', 'missing-current', 'duplicate'])
  test(`an unreliable ${snapshot} input snapshot never clears a still-held contact`, () => {
    const f = fixture();
    f.send('start', 7, f.button);
    f.setSnapshot(() =>
      snapshot === 'empty'
        ? []
        : snapshot === 'missing-current'
          ? [{ getID: () => 7 }]
          : [{ getID: () => 0 }, { getID: () => 0 }],
    );
    f.events.length = 0;
    f.send('start', 0, f.input, undefined, { mouse: true });
    f.send('end', 0);
    assert.equal(f.events.includes('tap'), false);
    assert.ok(f.map.contacts.has(7));
    f.unchanged();
  });

test('normal two-finger map pinch keeps ownership and never becomes a click', () => {
  const f = fixture();
  f.send('start', 1, f.input, { x: 500, y: 300 });
  f.send('start', 2, f.input, { x: 700, y: 300 });
  f.send('move', 2, f.input, { x: 760, y: 300 });
  f.send('end', 1);
  f.send('end', 2);
  assert.ok(f.events.includes('pinch'));
  assert.equal(f.events.includes('tap'), false);
  f.tap(3);
  assert.equal(f.events.filter((x) => x === 'tap').length, 1);
  f.unchanged();
});

for (const [width, height, dpr] of [
  [390, 667, 3],
  [844, 390, 2],
  [1200, 800, 1],
])
  test(`radial-hidden recovery preserves physical/UI coordinates at ${width}x${height}, DPR ${dpr}`, () => {
    const f = fixture({ width, height, dpr });
    f.send('start', 77, f.button);
    f.send('start', 88);
    f.project();
    f.send('end', 77, f.button);
    f.send('end', 88);
    f.project();
    f.events.length = 0;
    f.tap(99);
    assert.equal(f.events.filter((x) => x === 'tap').length, 1);
    f.unchanged();
  });

for (const pair of ['tool-map', 'map-tool', 'book-map', 'map-book', 'book-tool', 'tool-book'])
  for (const reverse of [false, true])
    for (const cancel of [false, true])
      test(`mixed ${pair} cancels safely; reverse release=${reverse}, cancel=${cancel}`, () => {
        const f = fixture();
        for (const name of ['RecipeBookOpen', 'RecipeCategory-gather-wood']) {
          const n = f.get(name);
          f.send('start', 90, n);
          f.send('end', 90, n);
        }
        const page = f.book.view,
          scale = f.book.scale;
        const targets = { tool: f.get('axeTool'), map: f.input, book: f.get('RecipeNext') };
        const [a, b] = pair.split('-');
        f.events.length = 0;
        f.send('start', 11, targets[a]);
        f.send('start', 22, targets[b]);
        f.project();
        f.send('move', 11, targets[a]);
        f.send('move', 22, targets[b]);
        for (const id of reverse ? [22, 11] : [11, 22])
          f.send(cancel ? 'cancel' : 'end', id, id === 11 ? targets[a] : targets[b]);
        assert.equal(f.router.active, false);
        assert.equal(f.book.view, page);
        assert.equal(f.book.scale, scale);
        assert.ok(!f.events.some((x) => ['tap', 'drop', 'button'].includes(x)));
        f.book.close();
        f.project();
        f.tap(33);
        assert.equal(f.events.filter((x) => x === 'tap').length, 1);
        f.unchanged();
      });

test('closing a captured handbook skips END without poisoning later map input', () => {
  const f = fixture();
  for (const name of ['RecipeBookOpen', 'RecipeCategory-gather-wood']) {
    const n = f.get(name);
    f.send('start', 90, n);
    f.send('end', 90, n);
  }
  const paper = f.get('RecipeHandbook');
  f.send('start', 71, paper);
  f.book.close();
  f.send('cancel', 71, paper);
  f.events.length = 0;
  f.tap(72);
  assert.equal(f.events.filter((x) => x === 'tap').length, 1);
  f.unchanged();
});

test('browser focus loss cancels held map/tool/book input and ignores later releases', () => {
  const f = fixture(),
    listeners = new Map();
  const target = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const { bindBrowserInputGuard } = f.load('BrowserInputGuard');
  const dispose = bindBrowserInputGuard(f.reset, target);
  f.send('start', 1);
  listeners.get('blur')({ target });
  f.send('end', 1);
  const tool = f.get('axeTool');
  f.send('start', 2, tool);
  listeners.get('blur')({ target });
  f.send('end', 2, tool);
  f.events.length = 0;
  f.tap(3);
  assert.equal(f.events.filter((x) => x === 'tap').length, 1);
  f.unchanged();
  dispose();
  assert.equal(listeners.size, 0);
});

test('duplicate START/END and foreign cancellation never multiply completed map gestures', () => {
  const f = fixture();
  f.events.length = 0;
  f.send('start', 7);
  f.send('start', 7);
  f.send('cancel', 999);
  f.send('end', 7);
  f.send('end', 7);
  assert.equal(f.events.filter((x) => x === 'tap').length, 1);
  f.map.gesture.handlers.candidate = () => 'b1';
  f.send('start', 8);
  f.map.gesture.startedAt -= 500;
  f.map.tick();
  f.send('end', 8);
  f.send('end', 8);
  assert.equal(f.events.filter((x) => x === 'drop').length, 1);
  f.unchanged();
});

// Mouse-derived EventTouch keeps only mouse ID 0 in its event snapshot, although
// the live engine manager also contains the held real finger. Keep simulate=false:
// this is the actual Cocos 3.8.8 mouse adapter value, not a synthetic true marker.
for (const origin of ['map', 'tool', 'book'])
  for (const mouseFirst of [false, true])
    for (const fingerEnd of ['end', 'cancel'])
      for (const mouseEnd of ['end', 'cancel'])
        test(`mixed physical finger on ${origin} then mouse axe stays cancelled: mouse-first=${mouseFirst}, finger=${fingerEnd}, mouse=${mouseEnd}`, () => {
          const f = fixture();
          const { fixture: resourceFixture } = require('./helpers/resource-picking-ui.cjs');
          const world = resourceFixture(f.session.state);
          f.router.tool.town = world.town;
          // Only projection is a collaborator. The target is resolved through the
          // canonical tree mesh and production TownView/GroundObjects/ModelPicking.
          f.map.screenRay = (point) => ({
            o: { x: point.x / 40, y: 20, z: point.y / 40 },
            d: { x: 0, y: -1, z: 0 },
          });
          const treePoint = { x: 140, y: 540 };
          assert.equal(world.town.pickTree(f.map.screenRay(treePoint)), 't1');
          if (origin === 'book') {
            for (const name of ['RecipeBookOpen', 'RecipeCategory-gather-wood']) {
              const node = f.get(name);
              f.send('start', 90, node);
              f.send('end', 90, node);
            }
          }
          const axe = f.get('axeTool');
          const target =
            origin === 'map' ? f.input : origin === 'tool' ? axe : f.get('RecipeHandbook');
          const firstPoint = origin === 'map' ? { x: 600, y: 300 } : f.geometry(target);
          const baseline = f.state();
          const commands = [];
          const run = f.session.run.bind(f.session);
          f.session.run = (command) => {
            commands.push(command);
            return run(command);
          };
          const mouse = { mouse: true, simulate: false };
          f.send('start', 7, target, firstPoint, { simulate: false });
          const event = f.send('start', 0, axe, undefined, mouse);
          assert.deepEqual(
            event.getAllTouches().map((touch) => touch.getID()),
            [0],
          );
          assert.deepEqual([...f.physical.keys()], [7, 0]);
          f.send('move', 0, axe, treePoint, mouse);
          for (const id of mouseFirst ? [0, 7] : [7, 0]) {
            if (id === 0) f.send(mouseEnd, 0, axe, treePoint, mouse);
            else f.send(fingerEnd, 7, target, firstPoint, { simulate: false });
            assert.deepEqual(
              f.state(),
              baseline,
              'mixed input must preserve state and stored bytes',
            );
            assert.deepEqual(commands, [], 'mixed input must not dispatch a tool command');
            // Releasing the partner must not re-arm the remaining mouse gesture.
            if (id === 7 && !mouseFirst) f.send('move', 0, axe, treePoint, mouse);
          }
          assert.equal(f.router.active, false);
          assert.equal(f.tray.active, null);
          // Once both contacts are gone, a fresh mouse gesture must still work.
          f.send('start', 0, axe, undefined, mouse);
          f.send('move', 0, axe, treePoint, mouse);
          f.send('end', 0, axe, treePoint, mouse);
          assert.deepEqual(commands, [{ type: 'useTool', tool: 'axe', treeId: 't1' }]);
          assert.equal(
            f.session.state.trees.some((tree) => tree.id === 't1'),
            false,
          );
          assert.equal(f.session.state.inventory.wood, 2);
          assert.equal(f.session.state.inventory.treeSeed, 2);
          assert.ok(f.state().writes > baseline.writes, 'fresh mouse command must persist');
          const completed = f.state();
          f.send('end', 0, axe, treePoint, mouse);
          assert.deepEqual(f.state(), completed, 'duplicate release must not repeat the command');
        });
