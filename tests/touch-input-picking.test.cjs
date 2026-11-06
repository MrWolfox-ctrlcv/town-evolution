/** Production input callbacks with narrow scene adapters, not GPU/device QA. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/map-contact-ui.cjs');

for (const dpr of [1, 2, 3])
  for (const [id, mouse, simulate, real] of [
    [0, false, false, true],
    [7, false, true, true],
    [0, true, false, false],
    [9, true, null, false],
  ])
    test(`map picking uses explicit touch provenance, ID ${id}, source ${mouse ? 'mouse' : 'touch'}, simulate ${simulate}, DPR ${dpr}`, () => {
      const f = fixture({ width: 390, height: 667, dpr });
      const rays = [];
      f.map.hooks.candidate = (ray) => {
        rays.push(ray);
        return 'pile';
      };
      f.map.hooks.drag = (id, world, ray) => rays.push(ray);
      f.map.hooks.drop = (id, ray) => rays.push(ray);
      const start = { x: 190, y: 300 },
        move = { x: 210, y: 330 };
      const options = { mouse, simulate };
      f.send('start', id, f.input, start, options);
      f.map.gesture.startedAt -= 500;
      f.map.tick(); // Uses MapGesture's spread copy of the original point.
      f.send('move', id, f.input, move, options);
      f.send('end', id, f.input, move, options);
      assert.equal(rays.length, 4);
      for (const [index, ray] of rays.entries()) {
        const context = f.touchContext(ray);
        assert.equal(!!context, real);
        if (!context) continue;
        const p = index < 2 ? start : move;
        assert.deepEqual(context.point, { x: p.x * dpr, y: p.y * dpr });
        assert.equal(context.radius, 6 * dpr);
        assert.equal(context.contains(context.point), true);
        assert.equal(context.contains({ x: -1, y: -1 }), false);
        const sample = context.ray({ ...context.point, touch: true });
        assert.equal(f.touchContext(sample), undefined, 'neighbor rays remain exact');
        assert.deepEqual(sample.o, ray.o);
        f.map.project = (world) => ({ x: world.x * dpr, y: world.z * dpr });
        assert.deepEqual(context.project({ x: 2, y: 3, z: 4 }), { x: 2 * dpr, y: 4 * dpr });
      }
      const taps = [];
      f.map.hooks.tap = (world, ray) => taps.push(ray);
      f.send('start', id, f.input, start, options);
      f.send('end', id, f.input, start, options);
      assert.equal(taps.length, 1);
      assert.equal(!!f.touchContext(taps[0]), real);
      f.unchanged();
    });

test('screen-interior outside-map END preserves touch metadata and true cancellation cannot leak it', () => {
  const f = fixture();
  // A sidebar is outside the map node but still inside the screen. Actual screen
  // exterior releases are cancellation, covered in release-displacement tests.
  f.input.components.find((component) => 'width' in component).setContentSize(1040, 800);
  f.map.layout(1200, 800, 0, 0, 80, 80);
  const drops = [],
    taps = [];
  f.map.hooks.candidate = () => 'pile';
  f.map.hooks.drop = (id, ray, point) => drops.push({ ray, point });
  f.map.hooks.tap = (world, ray) => taps.push(ray);
  f.send('start', 0);
  f.map.gesture.startedAt -= 500;
  f.map.tick();
  const end = f.send('end', 0, f.input, { x: 20, y: 300 });
  assert.equal(end.type, 'cancel');
  assert.equal(end.getEventCode(), 'end');
  assert.equal(drops.length, 1);
  assert.equal(drops[0].point.touch, true);
  assert.equal(drops[0].ray, null, 'outside viewport never gains a tolerant ray');
  f.send('start', 1);
  f.send('cancel', 1);
  f.send('end', 1);
  assert.equal(drops.length, 1);
  assert.equal(taps.length, 0);
  f.send('start', 7, f.input, undefined, { mouse: true });
  f.send('end', 7, f.input, undefined, { mouse: true });
  assert.equal(taps.length, 1);
  assert.equal(f.touchContext(taps[0]), undefined);
  f.unchanged();
});

for (const [id, mouse, simulate, real] of [
  [0, false, false, true],
  [7, false, true, true],
  [0, true, false, false],
  [9, true, null, false],
])
  test(`tray begin/move/appearance/outside release preserve provenance: ${mouse ? 'mouse' : 'touch'}/${simulate}`, () => {
    const f = fixture(),
      calls = [];
    const record = (name, point) => calls.push({ name, point });
    f.tray.setHandlers({
      begin: (kind, id, point) => record('begin', point),
      move: (id, point) => record('move', point),
      end: (id, point) => record('end', point),
      appearance: (kind, point) => {
        record('appearance', point);
        return kind;
      },
      cancel: () => calls.push({ name: 'cancel' }),
    });
    const tool = f.get('axeTool'),
      point = { x: 500, y: 300 },
      options = { mouse, simulate };
    f.send('start', id, tool, undefined, options);
    f.send('move', id, tool, point, options);
    const release = f.send('end', id, tool, point, options);
    assert.equal(release.type, 'cancel');
    assert.equal(release.getEventCode(), 'end');
    assert.deepEqual(
      calls.map((c) => c.name),
      ['begin', 'appearance', 'move', 'end'],
    );
    for (const call of calls) {
      assert.equal(call.point.touch, real);
      assert.equal(typeof call.point.clone, 'function', 'preserve the Cocos Vec2 contract');
      assert.equal(Object.prototype.propertyIsEnumerable.call(call.point, 'touch'), true);
    }
    calls.length = 0;
    f.send('start', id, tool, undefined, options);
    f.send('cancel', id, tool, point, options);
    f.send('end', id, tool, point, options);
    assert.deepEqual(
      calls.map((c) => c.name),
      ['begin', 'cancel'],
    );
    calls.length = 0;
    f.send('start', 77, tool, undefined, { mouse: true });
    f.send('end', 77, tool, point, { mouse: true });
    assert.deepEqual(
      calls.map((c) => c.name),
      ['begin', 'end'],
    );
    assert.ok(calls.every((c) => c.point.touch === false));
    f.unchanged();
  });
