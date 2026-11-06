/** Production visual clock/queue with narrow scene adapters; no renderer or device claim. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/farm-picking-ui.cjs');
function fixture() {
  let allocationFailure = false;
  let sizeFailure = false;
  class Node {
    constructor(name) {
      if (name === 'CollectedItem' && allocationFailure) {
        allocationFailure = false;
        throw Error('allocation unavailable');
      }
      this.name = name;
      this.children = [];
      this.active = true;
      this.position = { x: 0, y: 0, z: 0 };
      this.components = new Map();
    }
    get activeInHierarchy() {
      return this.active && !this.destroyed && (!this.parent || this.parent.activeInHierarchy);
    }
    get worldPosition() {
      const p = this.parent?.worldPosition ?? { x: 0, y: 0, z: 0 };
      return { x: p.x + this.position.x, y: p.y + this.position.y, z: 0 };
    }
    addChild(node) {
      this.children.push(node);
      node.parent = this;
    }
    getComponent(Type) {
      return this.components.get(Type);
    }
    addComponent(Type) {
      const component = new Type(this);
      this.components.set(Type, component);
      return component;
    }
    setPosition(x, y, z = 0) {
      this.position = typeof x === 'object' ? { ...x } : { x, y, z };
    }
    setScale(x, y, z) {
      this.scale = { x, y, z };
    }
    setSiblingIndex() {}
    destroy() {
      this.destroyed = true;
      this.active = false;
    }
  }
  class UITransform {
    constructor(node) {
      this.node = node;
    }
    setContentSize(width, height) {
      if (this.node.name === 'CollectedItem' && sizeFailure) {
        sizeFailure = false;
        throw Error('size unavailable');
      }
      this.contentSize = { width, height };
    }
    convertToNodeSpaceAR(p) {
      const c = this.node.worldPosition;
      return { x: p.x - c.x, y: p.y - c.y, z: 0 };
    }
  }
  const uiNode = (name, parent) => {
    const node = new Node(name);
    node.components.set(UITransform, new UITransform(node));
    parent?.addChild(node);
    return node;
  };
  const view = {
    viewport: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    getViewportRect() {
      return this.viewport;
    },
    getScaleX() {
      return this.scale.x;
    },
    getScaleY() {
      return this.scale.y;
    },
  };
  const draws = [],
    targets = new Map(),
    listed = new Set();
  let lookups = 0,
    failDraw = false;
  const { CollectionFlights } = load('CollectionFlights', {
    cc: {
      Node,
      UITransform,
      view,
      Vec3: class {},
      Tween: { stopAllByTarget() {} },
      tween() {
        const chain = {
          to() {
            return chain;
          },
          call() {
            return chain;
          },
          start() {},
        };
        return chain;
      },
    },
    './Widgets': { uiNode },
    './TrayIcons': {
      TrayIcons: class {
        draw(node, kind, size) {
          if (failDraw) throw Error('visual unavailable');
          draws.push({ node, kind, size });
        }
        dispose() {}
      },
    },
  });
  const canvas = uiNode('Canvas');
  canvas.getComponent(UITransform).setContentSize(390, 667);
  canvas.setPosition(195, 333.5);
  const flights = new CollectionFlights(
    canvas,
    (kind) => {
      lookups++;
      return targets.get(kind) ?? null;
    },
    (kind) => listed.has(kind),
  );
  const target = (kind, x = 160, y = 150) => {
    const n = uiNode(kind, canvas);
    n.setPosition(x, y);
    targets.set(kind, n);
    listed.add(kind);
    return n;
  };
  const active = () => flights.pool.filter((f) => f.running);
  const step = (seconds) => {
    for (let left = seconds; left > 1e-9; left -= 0.05) flights.update(Math.min(0.05, left));
  };
  return {
    flights,
    canvas,
    view,
    draws,
    targets,
    listed,
    target,
    active,
    step,
    lookups: () => lookups,
    failDraw: (value) => {
      failDraw = value;
    },
    failAllocation: (afterNodeCreation = false) => {
      if (afterNodeCreation) sizeFailure = true;
      else allocationFailure = true;
    },
  };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('hidden targets retain each collection until a real visible destination exists, once only', () => {
  const f = fixture(),
    target = f.target('wood');
  target.active = false;
  f.flights.collect('wood', 4, { x: 120, y: 400 });
  assert.equal(f.draws.length, 0);
  f.step(1);
  assert.equal(f.draws.length, 0);
  target.active = true;
  f.flights.update(0);
  assert.equal(f.draws.length, 1);
  assert.equal(f.active().length, 1);
  assert.equal(f.draws[0].kind, 'wood');
  f.step(1);
  assert.equal(f.active().length, 0);
  f.step(1);
  assert.equal(f.draws.length, 1, 'No replay after subsequent render/frame updates');
});

test('missing destinations never fabricate endpoints or block other visible collection kinds', () => {
  const f = fixture();
  f.target('wheat');
  f.flights.collect('treeSeed', 2, { x: 10, y: 20 });
  f.flights.collect('wheat', 2, { x: 30, y: 40 });
  assert.deepEqual(
    f.draws.map((d) => d.kind),
    ['wheat'],
  );
  f.target('treeSeed', -100, 40);
  f.flights.update(0);
  assert.deepEqual(
    f.draws.map((d) => d.kind),
    ['wheat', 'treeSeed'],
  );
  f.step(1);
  assert.equal(f.active().length, 0);
});

test('queued source uses captured screen conversion and latest visible target after resize and paging', () => {
  const f = fixture();
  f.view.viewport = { x: 20, y: 10 };
  f.view.scale = { x: 2, y: 3 };
  f.flights.collect('soil', 9, { x: 220, y: 310 });
  const target = f.target('soil', 140, 100);
  f.canvas.setPosition(422, 195);
  f.canvas.getComponent([...f.canvas.components.keys()][0]).setContentSize(844, 390);
  f.view.scale = { x: 3, y: 3 };
  f.flights.update(0);
  const flight = f.active()[0];
  assert.deepEqual({ x: flight.node.position.x, y: flight.node.position.y }, { x: -95, y: -233.5 });
  target.setPosition(300, 80);
  f.step(0.52);
  near(flight.node.position.x, 300);
  near(flight.node.position.y, 80);
  const pager = f.target('soil', 250, 40);
  f.flights.update(0.05);
  near(flight.node.position.x, 250);
  near(flight.node.position.y, 40);
  assert.equal(f.targets.get('soil'), pager);
  f.step(1);
  assert.equal(f.draws.length, 1);
});

test('in-flight target hiding pauses elapsed time and resumes toward its current actual location', () => {
  const f = fixture(),
    target = f.target('vegetable');
  f.flights.collect('vegetable', 1, { x: 100, y: 200 });
  f.step(0.2);
  const flight = f.active()[0],
    elapsed = flight.elapsed;
  target.active = false;
  f.step(3);
  assert.equal(f.active().length, 1);
  assert.equal(flight.node.active, false);
  near(flight.elapsed, elapsed);
  target.setPosition(-50, 110);
  target.active = true;
  f.flights.update(0);
  assert.equal(flight.node.active, true);
  near(flight.elapsed, elapsed);
  f.step(0.52 - elapsed);
  near(flight.node.position.x, -50);
  near(flight.node.position.y, 110);
  f.step(1);
  assert.equal(f.active().length, 0);
  assert.equal(f.draws.length, 1);
});

test('bounded pool queues excess events instead of cancelling unfinished collections', () => {
  const f = fixture();
  f.target('stone');
  for (let i = 0; i < 60; i++) f.flights.collect('stone', 1, { x: i, y: 10 });
  assert.equal(f.active().length, 24);
  assert.equal(f.draws.length, 24);
  assert.equal(f.flights.pool.length, 24);
  f.step(3);
  assert.equal(f.draws.length, 60);
  assert.equal(f.active().length, 0);
  assert.equal(f.flights.pool.length, 24);
  f.step(2);
  assert.equal(f.draws.length, 60);
});

test('clear cancels both queued and active effects but permits fresh collections after reset', () => {
  const f = fixture();
  f.target('wood');
  f.flights.collect('wood', 2, { x: 10, y: 10 });
  f.flights.collect('mud', 1, { x: 20, y: 20 });
  const old = f.active()[0].node;
  f.flights.clear();
  assert.equal(old.active, false);
  assert.equal(f.active().length, 0);
  f.target('mud');
  f.step(1);
  assert.equal(f.draws.length, 1);
  f.flights.collect('mud', 1, { x: 30, y: 30 });
  f.step(1);
  assert.equal(f.draws.length, 2);
  assert.equal(f.active().length, 0);
});

test('disposed interfaces never look up, create or restart old effects after a profile switch', () => {
  const f = fixture();
  f.target('wood');
  f.flights.collect('wood', 2, { x: 10, y: 10 });
  f.flights.collect('soil', 9, { x: 20, y: 20 });
  const old = f.active()[0].node;
  f.flights.dispose();
  const queries = f.lookups();
  f.target('soil');
  f.flights.update(1);
  f.flights.collect('wood', 2, { x: 30, y: 30 });
  f.flights.clear();
  assert.equal(old.active, false);
  assert.equal(f.lookups(), queries);
  assert.equal(f.draws.length, 1);
  assert.equal(f.flights.pool.length, 0);
});

test('invalid inputs and visual startup failures cannot strand slots or poison future frame updates', () => {
  const f = fixture();
  f.target('wood');
  for (const amount of [0, -1, NaN, Infinity]) f.flights.collect('wood', amount, { x: 0, y: 0 });
  f.flights.collect('wood', 1, { x: NaN, y: 0 });
  assert.equal(f.draws.length, 0);
  f.flights.collect('soil', 9, { x: 5, y: 6 });
  f.target('soil');
  f.failDraw(true);
  assert.doesNotThrow(() => f.flights.update(0));
  assert.equal(f.active().length, 0);
  f.failDraw(false);
  f.flights.collect('wood', 2, { x: 0, y: 0 });
  const flight = f.active()[0];
  for (const dt of [-1, NaN, Infinity]) f.flights.update(dt);
  assert.equal(flight.elapsed, 0);
  f.flights.update(100);
  assert.ok(
    flight.elapsed <= 0.1,
    'Resume spikes must not finish a newly visible reward in one frame',
  );
  f.step(1);
  assert.equal(f.active().length, 0);
  assert.equal(f.draws.length, 1);
});

function lifecycle(f, session) {
  const { TownHUD } = load('TownHUD', {
      cc: { Node: { EventType: { TOUCH_END: 'end', TOUCH_START: 'start' } } },
    }),
    { TownController } = load('TownController');
  f.canvas.off = () => {};
  const inert = () => ({ dispose() {}, cancelGesture() {} });
  const hud = Object.assign(Object.create(TownHUD.prototype), {
    flights: f.flights,
    canvas: f.canvas,
    resources: inert(),
    message: inert(),
    bottom: inert(),
    radial: inert(),
    tools: inert(),
    handbook: inert(),
    settings: inert(),
    settingsArt: inert(),
  });
  const controller = Object.assign(Object.create(TownController.prototype), {
    hud,
    session,
    ui: { profile: 'normal', resetArmed: true },
    elapsed: 0,
    map: { tick() {}, reset() {}, dispose() {} },
    tools: { updateHint() {}, dispose() {} },
    drag: inert(),
    town: inert(),
    projectSelection() {},
    refresh() {},
  });
  return { hud, controller };
}
test('production HUD/controller frame chain releases delayed collections without touching the save', () => {
  const { fixture: gameFixture, game } = require('./helpers/farm-picking-ui.cjs');
  const gameState = gameFixture(),
    f = fixture(),
    { controller } = lifecycle(f, gameState.session);
  const before = game.exportSave(gameState.session.state),
    bytes = [...gameState.values],
    writes = gameState.writes();
  f.flights.collect('wood', 2, { x: 100, y: 200 });
  controller.tick(0.05);
  assert.equal(f.draws.length, 0);
  f.target('wood');
  controller.tick(0.05);
  assert.equal(f.draws.length, 1);
  for (let i = 0; i < 30; i++) controller.tick(0.05);
  assert.equal(f.active().length, 0);
  assert.equal(f.draws.length, 1);
  assert.equal(game.exportSave(gameState.session.state), before);
  assert.deepEqual([...gameState.values], bytes);
  assert.equal(gameState.writes(), writes);
});

test('successful in-place reset cancels queued and running effects; a rejected reset preserves them', () => {
  const { fixture: gameFixture } = require('./helpers/farm-picking-ui.cjs');
  for (const fail of [false, true]) {
    const gameState = gameFixture(),
      f = fixture(),
      { controller } = lifecycle(f, gameState.session);
    f.target('wood');
    f.flights.collect('wood', 2, { x: 10, y: 20 });
    f.flights.collect('mud', 1, { x: 30, y: 40 });
    const setItem = gameState.session.storage.setItem;
    if (fail)
      gameState.session.storage.setItem = () => {
        throw Error('storage denied');
      };
    controller.reset();
    gameState.session.storage.setItem = setItem;
    const bytes = [...gameState.values],
      writes = gameState.writes();
    assert.equal(f.active().length, fail ? 1 : 0);
    f.target('mud');
    f.step(1);
    assert.equal(f.draws.length, fail ? 2 : 1);
    assert.deepEqual([...gameState.values], bytes);
    assert.equal(gameState.writes(), writes);
  }
});

test('bootstrap session replacement disposes old HUD effects before another save/profile is displayed', () => {
  const { fixture: gameFixture } = require('./helpers/farm-picking-ui.cjs');
  const gameState = gameFixture(),
    f = fixture(),
    { controller } = lifecycle(f, gameState.session);
  f.target('wood');
  f.flights.collect('wood', 2, { x: 10, y: 20 });
  f.flights.collect('soil', 9, { x: 30, y: 40 });
  const old = f.active()[0].node;
  const { TownBootstrap } = load('TownBootstrap', {
    cc: { Component: class {}, _decorator: { ccclass: () => (Type) => Type } },
  });
  let destroyed = 0;
  const bootstrap = Object.assign(Object.create(TownBootstrap.prototype), {
    controller,
    controllerSession: gameState.session,
    flow: { session: {}, page: 'settings' },
    stage: {
      active: true,
      destroy() {
        destroyed++;
      },
    },
    menu: { root: { active: false }, render() {} },
  });
  const bytes = [...gameState.values],
    writes = gameState.writes();
  bootstrap.render();
  assert.equal(destroyed, 1);
  assert.equal(bootstrap.controller, null);
  assert.equal(old.active, false);
  f.target('soil');
  f.step(1);
  assert.equal(f.draws.length, 1);
  assert.equal(f.flights.pool.length, 0);
  assert.deepEqual([...gameState.values], bytes);
  assert.equal(gameState.writes(), writes);
});

test('unreachable events are bounded under sustained input and expire without inventing a target', () => {
  const f = fixture();
  for (let i = 0; i < 1000; i++) f.flights.collect('chilledVegetable', 1, { x: i, y: 20 });
  assert.ok(f.flights.pending.length <= 96, 'Pending visual work must have a hard bound');
  assert.equal(f.flights.pool.length, 0);
  assert.equal(f.draws.length, 0);
  const before = f.lookups();
  f.flights.update(1 / 60);
  assert.ok(f.lookups() - before <= 1, 'A frame queries each missing kind only once');
  f.step(31);
  assert.equal(f.flights.pending.length, 0, 'Permanently unavailable kinds expire');
  const queries = f.lookups();
  f.step(10);
  assert.equal(f.lookups(), queries, 'Expired work consumes no future destination lookups');
  f.target('chilledVegetable');
  f.step(1);
  assert.equal(f.draws.length, 0, 'Expired visual work cannot return later');
});

test('a temporarily hidden real entry survives beyond the unavailable-entry expiry budget', () => {
  const f = fixture(),
    target = f.target('wood');
  target.active = false;
  f.flights.collect('wood', 2, { x: 12, y: 34 });
  f.step(40);
  assert.equal(f.flights.pending.length, 1);
  target.active = true;
  f.step(1);
  assert.equal(f.draws.length, 1);
  assert.equal(f.active().length, 0);
});

test('full hidden running pool yields slots to visible work and preserves paused progress', () => {
  const f = fixture(),
    cold = f.target('chilledVegetable');
  for (let i = 0; i < 24; i++) f.flights.collect('chilledVegetable', 1, { x: i, y: 10 });
  f.step(0.2);
  cold.active = false;
  f.listed.delete('chilledVegetable');
  f.target('wood');
  f.flights.collect('wood', 4, { x: 100, y: 200 });
  assert.equal(
    f.draws.filter((d) => d.kind === 'wood').length,
    1,
    'Visible work starts immediately',
  );
  assert.equal(f.flights.pool.length, 24);
  const suspended = f.flights.pending.find((r) => r.kind === 'chilledVegetable');
  assert.ok(suspended, 'The interrupted reward is retained without reserving a node');
  near(suspended.elapsed, 0.2);
  f.step(1);
  assert.equal(f.active().filter((r) => r.kind === 'wood').length, 0);
  cold.setPosition(-70, 120);
  cold.active = true;
  f.listed.add('chilledVegetable');
  f.step(1);
  assert.equal(f.active().length, 0);
  assert.equal(f.flights.pending.length, 0);
  const starts = f.draws.length;
  f.step(1);
  assert.equal(f.draws.length, starts, 'Resumed rewards are not requeued after completion');
});

test('permanently missing active targets release their nodes at the same expiry budget', () => {
  const f = fixture(),
    cold = f.target('chilledVegetable');
  for (let i = 0; i < 24; i++) f.flights.collect('chilledVegetable', 1, { x: i, y: 10 });
  cold.active = false;
  f.listed.delete('chilledVegetable');
  f.step(31);
  assert.equal(f.active().length, 0);
  assert.equal(f.flights.pending.length, 0);
  f.target('wood');
  f.flights.collect('wood', 2, { x: 50, y: 60 });
  f.step(1);
  assert.equal(f.draws.filter((d) => d.kind === 'wood').length, 1);
});

test('pressure merges only stale same-kind waiting visuals and keeps each actual latest source', () => {
  const f = fixture();
  f.flights.collect('stone', 1, { x: 2, y: 3 });
  for (let i = 0; i < 1000; i++) f.flights.collect('wood', 1, { x: i, y: 5 });
  assert.equal(f.flights.pending.length, 96);
  assert.equal(f.flights.pending.filter((r) => r.kind === 'stone').length, 1);
  const last = f.flights.pending.filter((r) => r.kind === 'wood').at(-1);
  assert.deepEqual(last.source, { x: 999 - 195, y: 5 - 333.5 });
  f.target('wood');
  f.target('stone');
  f.flights.update(0);
  assert.ok(
    f.draws.slice(0, 2).some((d) => d.kind === 'stone'),
    'A frequent kind cannot crowd out a rare kind',
  );
  f.step(4);
  assert.equal(f.draws.length, 96);
  assert.equal(f.flights.pending.length, 0);
  assert.equal(f.active().length, 0);
});

test('queued visible kinds receive turns instead of waiting behind one frequent kind', () => {
  const f = fixture();
  f.target('wood');
  f.target('stone');
  for (let i = 0; i < 96; i++) f.flights.collect('wood', 1, { x: i, y: 0 });
  f.flights.collect('stone', 1, { x: 50, y: 60 });
  assert.equal(f.draws.length, 24);
  f.step(0.8);
  assert.equal(f.draws[24].kind, 'stone', 'The next available node serves another waiting kind');
  f.step(4);
  assert.equal(f.draws.length, 97, 'Ordinary under-capacity events remain distinct');
});

test('destination work stays bounded by kind count rather than queued-event count', () => {
  const f = fixture();
  for (const kind of ['wood', 'stone', 'soil', 'chilledVegetable']) {
    const node = f.target(kind);
    node.active = false;
  }
  for (let i = 0; i < 2000; i++)
    f.flights.collect(['wood', 'stone', 'soil', 'chilledVegetable'][i % 4], 1, { x: i, y: 0 });
  const queries = f.lookups();
  for (let i = 0; i < 600; i++) f.flights.update(1 / 60);
  assert.ok(f.lookups() - queries <= 4 * 600, 'Each kind is queried only once per frame');
  assert.equal(f.flights.pending.length, 96);
  assert.equal(f.flights.pool.length, 0);
  f.flights.clear();
  const after = f.lookups();
  f.step(40);
  assert.equal(f.lookups(), after);
});

test('allocation failures during delayed frames discard one visual batch and clean partial nodes', () => {
  for (const afterNodeCreation of [false, true]) {
    const f = fixture();
    f.flights.collect('wood', 1, { x: 1, y: 2 });
    f.flights.collect('stone', 1, { x: 3, y: 4 });
    f.target('wood');
    f.target('stone');
    f.failAllocation(afterNodeCreation);
    assert.doesNotThrow(() => f.flights.update(0));
    assert.equal(f.draws.length, 1);
    assert.equal(f.draws[0].kind, 'stone');
    assert.equal(f.flights.pending.length, 0);
    assert.equal(f.active().length, 1);
    const allNodes = f.canvas.children.find((n) => n.name === 'CollectionFlights').children;
    assert.equal(allNodes.filter((n) => n.activeInHierarchy).length, 1);
    assert.equal(
      allNodes.filter((n) => !n.destroyed).length,
      1,
      'Failed partial allocations are destroyed',
    );
    f.step(1);
    f.flights.collect('wood', 2, { x: 5, y: 6 });
    f.step(1);
    assert.equal(f.draws.length, 2);
    assert.equal(f.active().length, 0);
  }
});

test('full waiting queue plus hidden running pool remains bounded and does not reset expiry', () => {
  const f = fixture(),
    cold = f.target('chilledVegetable');
  for (let i = 0; i < 24; i++) f.flights.collect('chilledVegetable', 1, { x: i, y: 0 });
  f.step(0.2);
  cold.active = false;
  f.listed.delete('chilledVegetable');
  for (let i = 0; i < 96; i++) f.flights.collect('soil', 1, { x: i, y: 10 });
  f.step(20);
  f.target('wood');
  for (let i = 0; i < 24; i++) f.flights.collect('wood', 1, { x: i, y: 20 });
  assert.equal(f.flights.pool.length, 24);
  assert.equal(f.flights.pending.length, 96);
  assert.equal(f.draws.filter((d) => d.kind === 'wood').length, 24);
  const coldRewards = f.flights.pending.filter((r) => r.kind === 'chilledVegetable');
  assert.equal(coldRewards.length, 24);
  for (const reward of coldRewards) {
    near(reward.elapsed, 0.2);
    near(reward.unavailable, 20);
  }
  f.step(11);
  assert.equal(
    f.flights.pending.length,
    0,
    'Requeue and unrelated events did not refresh unavailable ages',
  );
  assert.equal(f.active().length, 0);
  f.flights.clear();
  assert.equal(f.flights.served.size, 0);
  assert.equal(f.flights.turn, 0);
});

test('target lookup failures are cached and cannot poison unrelated visible rewards', () => {
  const f = fixture();
  const lookup = f.flights.destination;
  let failures = 0;
  f.flights.destination = (kind) => {
    if (kind === 'soil') {
      failures++;
      throw Error('detached target');
    }
    return lookup(kind);
  };
  f.flights.collect('soil', 1, { x: 0, y: 0 });
  f.target('wood');
  assert.doesNotThrow(() => f.flights.collect('wood', 1, { x: 1, y: 2 }));
  assert.doesNotThrow(() => f.step(1));
  assert.equal(f.draws.length, 1);
  assert.equal(failures, 1);
  assert.equal(f.flights.pending.length, 0);
  assert.equal(f.active().length, 0);
});

test('a new kind at the pending limit merges a repeated kind instead of erasing a unique reward', () => {
  const f = fixture();
  f.flights.collect('stone', 1, { x: 1, y: 2 });
  for (let i = 0; i < 95; i++) f.flights.collect('wood', 1, { x: i, y: 3 });
  f.flights.collect('treeSeed', 1, { x: 4, y: 5 });
  assert.equal(f.flights.pending.length, 96);
  assert.equal(f.flights.pending.filter((r) => r.kind === 'stone').length, 1);
  assert.equal(f.flights.pending.filter((r) => r.kind === 'treeSeed').length, 1);
  assert.equal(f.flights.pending.filter((r) => r.kind === 'wood').length, 94);
  for (const kind of ['wood', 'stone', 'treeSeed']) f.target(kind);
  f.flights.update(0);
  assert.deepEqual(
    new Set(f.draws.slice(0, 3).map((d) => d.kind)),
    new Set(['wood', 'stone', 'treeSeed']),
  );
  f.step(4);
  assert.equal(f.draws.filter((d) => d.kind === 'stone').length, 1);
  assert.equal(f.draws.filter((d) => d.kind === 'treeSeed').length, 1);
  assert.equal(f.draws.length, 96);
});
