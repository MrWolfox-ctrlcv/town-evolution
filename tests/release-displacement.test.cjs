/** Production input/menu classes and actual Cocos pointer dispatch + node processor.
 * Coordinates, scene drawing and storage are collaborators; this is not GPU/device QA. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/map-contact-ui.cjs');
const { GameStart } = require('../.domain-build/application/GameStart');
const { exportSave } = require('../.domain-build/domain/game');
const { TapGesture } = require('../.domain-build/application/TapGesture');
const { MapGesture } = require('../.domain-build/application/MapGesture');
const inputRoute = require('./helpers/cocos-input-route.cjs');

for (const device of ['web', 'native', 'mouse'])
  test(`actual Cocos ${device} source supplies END-only displacement to a production button`, () => {
    const f = fixture();
    const target = {
      emit(type, event) {
        for (const listener of f.button.events.get(type) ?? [])
          listener.fn.call(listener.context ?? f.button, event);
      },
    };
    const route = inputRoute(target, f.button.constructor.EventType, f.provenance);
    route.send(device, 'start', { x: -40, y: 0 }, 0);
    route.send(device, 'end', { x: -8, y: 0 }, 0);
    assert.ok(!f.events.includes('button'));
    f.unchanged();
    route.send(device, 'start', { x: -40, y: 0 }, 0);
    route.send(device, 'end', { x: 20, y: 0 }, 0);
    assert.equal(route.delivered.at(-1).type, 'cancel');
    assert.equal(route.delivered.at(-1).code, 'end');
    f.unchanged();
    route.send(device, 'start', { x: -40, y: 0 }, 0);
    route.send(device, 'end', { x: -28, y: 0 }, 0);
    assert.equal(f.events.filter((event) => event === 'button').length, 1);
    route.release();
  });

for (const distance of [12, 12.001, 32])
  test(`tap gate checks final logical position at ${distance}px without a MOVE`, () => {
    const g = new TapGesture();
    g.begin(1, { x: 0, y: 0 });
    assert.equal(g.end(1, { x: distance, y: 0 }), distance <= 12);
    assert.equal(g.end(1, { x: 0, y: 0 }), false);
  });

test('a displaced pending map release cannot create a late long-press drag', () => {
  let now = 0;
  const events = [];
  const handlers = Object.fromEntries(
    ['tap', 'pan', 'pinch', 'drag', 'drop', 'cancel'].map((name) => [
      name,
      () => events.push(name),
    ]),
  );
  const g = new MapGesture({ ...handlers, candidate: () => 'b1' }, () => now);
  g.begin(1, { x: 0, y: 0 }, { x: 0, y: 0 });
  now = 600;
  g.end(1, { x: 300, y: 0 }, { x: 100, y: 0 });
  assert.ok(events.every((event) => event === 'cancel'));
  assert.equal(g.interacting, false);
});

for (const dpr of [1, 3])
  for (const mouse of [false, true]) {
    const id = mouse ? 0 : 7;
    const options = { mouse };
    test(`map final jump is not a tap, DPR${dpr}, mouse=${mouse}`, () => {
      const f = fixture({ dpr, realProcessor: true });
      const start = { x: 400, y: 300 };
      f.send('start', id, f.input, start, options);
      f.send('move', id, f.input, { x: 410, y: 300 }, options);
      f.send('end', id, f.input, { x: 430, y: 300 }, options);
      assert.ok(!f.events.some((event) => ['tap', 'drop', 'pan'].includes(event)));
      f.unchanged();
      f.events.length = 0;
      f.send('start', id, f.input, start, options);
      f.send('end', id, f.input, { x: 412, y: 300 }, options);
      assert.deepEqual(
        f.events.filter((event) => event === 'tap'),
        ['tap'],
      );
      f.unchanged();
    });
    for (const action of ['save-now', 'new-game', 'load-slot', 'write-slot', 'exit'])
      test(`settings ${action}: release displacement cannot navigate/write, DPR${dpr}, mouse=${mouse}`, () => {
        const f = fixture({ dpr, realProcessor: true });
        let now = 100;
        const flow = new GameStart(f.storage, () => now);
        assert.ok(flow.start());
        flow.saves();
        flow.chooseSlot(1);
        flow.saveSlot();
        assert.ok(flow.session.run({ type: 'buyCrop', item: 'wheat', quantity: 1 }));
        flow.settings();
        if (action === 'new-game') flow.newGame();
        else if (action === 'exit') flow.exit();
        else if (action === 'load-slot' || action === 'write-slot') {
          flow.saves();
          flow.chooseSlot(1);
          if (action === 'load-slot') flow.loadSlot();
          else flow.saveSlot();
        }
        now = 200;
        f.settings(flow);
        const button = f.get(action === 'save-now' ? 'Menu-save-now' : 'Menu-confirm');
        const center = f.geometry(button);
        const before = {
          session: flow.session,
          town: exportSave(flow.session.state),
          page: flow.page,
          pending: flow.pending,
          storage: f.state(),
        };
        f.send('start', id, button, { x: center.x - 16, y: center.y }, options);
        f.send('end', id, button, { x: center.x + 16, y: center.y }, options);
        assert.equal(flow.session, before.session);
        assert.equal(exportSave(flow.session.state), before.town);
        assert.equal(flow.page, before.page);
        assert.equal(flow.pending, before.pending);
        assert.deepEqual(f.state(), before.storage);
        // A real node-processor CANCEL retaining hardware END never confirms, either.
        f.send('start', id, button, center, options);
        const cancel = f.send('end', id, button, { x: -1, y: center.y }, options);
        assert.equal(cancel.type, 'cancel');
        assert.equal(cancel.getEventCode(), 'end');
        assert.deepEqual(f.state(), before.storage);
        assert.equal(flow.pending, before.pending);
        // A fresh deliberate tap still invokes this original action exactly once.
        f.send('start', id, button, center, options);
        f.send('end', id, button, center, options);
        assert.notDeepEqual(f.state().values, before.storage.values);
        const committed = f.state();
        f.send('end', id, button, center, options);
        assert.deepEqual(f.state(), committed);
      });
  }

for (const point of [
  { x: -1, y: 300 },
  { x: 1201, y: 300 },
  { x: 400, y: -1 },
  { x: 400, y: 801 },
])
  test(`lifted map object cancels on actual screen-exterior END ${JSON.stringify(point)}`, () => {
    const f = fixture({ realProcessor: true });
    f.map.gesture.handlers.candidate = () => 'b1';
    f.send('start', 7, f.input, { x: 400, y: 300 });
    f.map.gesture.startedAt -= 500;
    f.map.tick();
    assert.ok(f.events.includes('drag'));
    const event = f.send('end', 7, f.input, point);
    assert.equal(event.type, 'cancel');
    assert.equal(event.getEventCode(), 'end');
    assert.ok(!f.events.some((value) => value === 'tap' || value === 'drop'));
    assert.equal(f.map.interacting, false);
    f.unchanged();
    f.tap(9);
    assert.ok(f.events.includes('tap'));
  });

test('screen-interior sidebar release preserves long-press drop despite Cocos CANCEL', () => {
  const f = fixture({ realProcessor: true });
  const transform = f.input.components.find((component) => 'width' in component);
  transform.setContentSize(1040, 800);
  f.map.layout(1200, 800, 0, 0, 80, 80);
  f.map.gesture.handlers.candidate = () => 'pile:3:5';
  f.send('start', 7, f.input, { x: 400, y: 300 });
  f.map.gesture.startedAt -= 500;
  f.map.tick();
  const event = f.send('end', 7, f.input, { x: 20, y: 300 });
  assert.equal(event.type, 'cancel');
  assert.equal(event.getEventCode(), 'end');
  assert.deepEqual(
    f.events.filter((value) => value === 'drop'),
    ['drop'],
  );
  assert.equal(f.map.interacting, false);
  f.unchanged();
});

for (const dpr of [1, 3])
  for (const mouse of [false, true])
    for (const point of [
      { x: -1, y: 300 },
      { x: 1201, y: 300 },
      { x: 400, y: -1 },
      { x: 400, y: 801 },
    ])
      test(`tray screen-exterior END cancels instead of finishing: DPR${dpr}, mouse=${mouse}, ${JSON.stringify(point)}`, () => {
        const f = fixture({ dpr, realProcessor: true });
        const calls = [];
        f.tray.setHandlers({
          begin: () => calls.push('begin'),
          move: () => calls.push('move'),
          end: () => calls.push('end'),
          cancel: () => calls.push('cancel'),
        });
        const tile = f.get('VegetableStock');
        f.send('start', 0, tile, undefined, { mouse });
        const event = f.send('end', 0, tile, point, { mouse });
        assert.equal(event.type, 'cancel');
        assert.equal(event.getEventCode(), 'end');
        assert.deepEqual(calls, ['begin', 'cancel']);
        assert.equal(f.tray.active, null);
        f.unchanged();
      });

test('screen-exterior crop release never adds a terminal farming stroke or rolls back completed cells', () => {
  const f = fixture({ realProcessor: true });
  assert.ok(f.session.run({ type: 'buyCrop', item: 'vegetable', quantity: 1 }));
  const tile = f.get('VegetableStock');
  // Two exact field targets on the path from the product tray to the left edge.
  f.router.farm.town.pickPlant = (ray) => {
    const x = ray.o.x;
    if (x >= 500 && x <= 600) return { buildingId: 'b2', cell: 0 };
    if (x >= 200 && x <= 300) return { buildingId: 'b2', cell: 1 };
    return null;
  };
  const before = f.state();
  f.send('start', 7, tile);
  f.send('end', 7, tile, { x: -1, y: 300 });
  assert.deepEqual(f.state(), before);
  assert.equal(f.router.active, false);
  // A delivered MOVE is a real farming stroke and remains committed on cancel.
  f.send('start', 7, tile);
  f.send('move', 7, tile, { x: 550, y: 300 });
  const farm = () => f.session.state.buildings.find((building) => building.id === 'b2');
  assert.ok(farm().cropJobs[0]);
  assert.equal(farm().cropJobs[1], null);
  const completed = f.state();
  f.send('end', 7, tile, { x: -1, y: 300 });
  assert.deepEqual(f.state(), completed);
  assert.equal(farm().cropJobs[1], null);
  // Ordinary screen-interior outside-tile END still completes a fresh crop drag.
  f.send('start', 7, tile);
  const end = f.send('end', 7, tile, { x: 250, y: 300 });
  assert.equal(end.type, 'cancel');
  assert.equal(end.getEventCode(), 'end');
  assert.ok(farm().cropJobs[1]);
  assert.equal(f.session.state.inventory.vegetable, 0);
});
