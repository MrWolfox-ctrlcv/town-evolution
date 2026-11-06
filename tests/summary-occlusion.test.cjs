const { assertCropDrops } = require('./helpers/loose-output.cjs');
/** Actual HUD/MapCamera/FarmTools/domain/save methods, not a Cocos renderer/device test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture: uiFixture } = require('./helpers/summary-occlusion-ui.cjs');
const {
  fixture: farmFixture,
  project,
  farmCellCenter,
  game,
} = require('./helpers/farm-picking-ui.cjs');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
const sizes = [
  [320, 568, 1],
  [390, 844, 3],
  [768, 1024, 2],
  [1200, 800, 1],
  [844, 390, 3],
];
function snapshot(f) {
  return {
    state: game.exportSave(f.session.state),
    save: f.values.get(SAVE_KEY),
    writes: f.writes(),
  };
}
function unchanged(f, before) {
  assert.deepEqual(snapshot(f), before);
}
function projectFarm(ui, f, anchor, target) {
  const ray = f.map.screenRay,
    scale = 0.03 * ui.screen.devicePixelRatio;
  ui.map.screenRay = (p) =>
    ray({ x: target.x + (p.x - anchor.x) / scale, y: target.y + (p.y - anchor.y) / scale });
  f.map.contains = (p) => ui.map.contains(p);
  f.map.screenRay = (p) => ui.map.screenRay(p);
  f.map.ground = (p, h) => ui.map.ground(p, h);
  ui.hud.cancelTools = () => f.tools.cancel();
}
for (const [width, height, dpr] of sizes) {
  test(`summary bounds block only their visible rectangle at ${width}x${height} DPR ${dpr}`, () => {
    const ui = uiFixture(width, height, dpr),
      b = ui.summary(),
      epsilon = 0.01 * dpr;
    for (const p of [
      { x: b.x, y: b.y },
      { x: b.left, y: b.y },
      { x: b.right, y: b.y },
      { x: b.x, y: b.bottom },
      { x: b.x, y: b.top },
    ]) {
      assert.equal(ui.hud.coversMapPoint(p), true);
      assert.equal(ui.map.contains(p), false);
    }
    for (const p of [
      { x: b.left - epsilon, y: b.y },
      { x: b.right + epsilon, y: b.y },
      { x: b.x, y: b.bottom - epsilon },
      { x: b.x, y: b.top + epsilon },
    ]) {
      assert.equal(ui.hud.coversMapPoint(p), false);
      assert.equal(ui.map.contains(p), true, 'Do not block a full-width top strip');
    }
    ui.top.active = false;
    assert.equal(ui.hud.coversMapPoint({ x: b.x, y: b.y }), false);
    assert.equal(ui.map.contains({ x: b.x, y: b.y }), true);
    ui.top.active = true;
    ui.canvas.active = false;
    assert.equal(ui.hud.coversMapPoint({ x: b.x, y: b.y }), false);
  });
  for (const kind of ['plant', 'harvest'])
    test(`${kind} captured stroke cannot change saves behind summary at ${width}x${height} DPR ${dpr}`, () => {
      const ui = uiFixture(width, height, dpr),
        f = farmFixture({ occupied: kind === 'harvest' }),
        b = ui.summary();
      const target =
        kind === 'harvest'
          ? f.cropPoint().point
          : project({ ...farmCellCenter(f.farm, 4), y: 0.17 });
      const anchor = { x: b.x, y: b.y };
      projectFarm(ui, f, anchor, target);
      const start = { x: b.x, y: b.y - 80 * dpr },
        before = snapshot(f);
      f.tools.begin(kind, 7, start);
      f.tools.move(7, anchor);
      f.tools.end(7, anchor);
      f.tools.end(7, anchor);
      unchanged(f, before);
      assert.equal(f.commands.length, 0);
      // Same real target in visible map space remains usable after a fresh gesture.
      const outside = { x: b.x, y: b.bottom - 16 * dpr };
      const previousRay = ui.map.screenRay;
      ui.map.screenRay = (p) => previousRay({ x: p.x, y: p.y + anchor.y - outside.y });
      f.tools.begin(kind, 8, outside);
      assert.equal(f.tools.end(8, outside), true);
      assert.equal(f.commands.length, 1);
      assert.equal(
        f.session.state.inventory[kind === 'plant' ? 'vegetable' : 'wheat'],
        kind === 'plant' ? 7 : 0,
      );
      if (kind === 'harvest') assertCropDrops(f.session.state, f.farm, [f.occupiedCell], 'wheat');
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
    });
}

for (const [width, height, dpr] of sizes)
  for (const kind of ['field', 'stone', 'soil'])
    test(`digging ${kind} cannot commit behind summary at ${width}x${height} DPR ${dpr}`, () => {
      const ui = uiFixture(width, height, dpr),
        f = farmFixture({ occupied: false }),
        b = ui.summary();
      if (kind !== 'field') f.session.state = game.createGame(f.now, 1, 2);
      const resource = f.session.state.naturalResources.find((r) => r.kind === kind);
      assert.equal(f.session.save(), true);
      const target = resource ?? { x: 10, z: 10 },
        anchor = { x: b.x, y: b.y };
      ui.map.screenRay = (p) => ({
        o: {
          x: target.x + 0.5 + (p.x - anchor.x) / (20 * dpr),
          y: 20,
          z: target.z + 0.5 + (p.y - anchor.y) / (20 * dpr),
        },
        d: { x: 0, y: -1, z: 0 },
      });
      const town = {
        pickNatural: (r) =>
          resource && Math.floor(r.o.x) === resource.x && Math.floor(r.o.z) === resource.z
            ? resource.id
            : null,
        pickBuilding: () => null,
        pickTree: () => null,
        pickStack: () => null,
        naturalOrigin: () => ({ x: target.x + 0.5, y: 1, z: target.z + 0.5 }),
      };
      const { ToolUseDrag } = ui.load('ToolUseDrag');
      const tool = new ToolUseDrag(ui.root, f.session, ui.map, town, () => {}),
        before = snapshot(f);
      tool.begin('diggingTool', 1);
      tool.move(1, anchor);
      tool.end(1, anchor);
      tool.end(1, anchor);
      unchanged(f, before);
      assert.equal(f.commands.length, 0);
      // Visible space immediately below the summary still gathers/builds normally.
      const outside = { x: b.x, y: b.bottom - 20 * dpr },
        oldRay = ui.map.screenRay;
      ui.map.screenRay = (p) => oldRay({ x: p.x, y: p.y + anchor.y - outside.y });
      tool.begin('diggingTool', 2);
      tool.move(2, outside);
      tool.end(2, outside);
      assert.equal(f.commands.length, 1);
      assert.equal(f.commands[0].type, kind === 'field' ? 'useTool' : 'gatherNatural');
      assert.notEqual(snapshot(f).state, before.state);
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
    });

function objectFixture(kind, width, height, dpr) {
  const f = farmFixture({ occupied: false });
  if (kind === 'pile') {
    const result = game.dispatch(
      f.session.state,
      { type: 'dropProduct', item: 'vegetable', quantity: 2, x: 4, z: 6 },
      f.now,
    );
    assert.equal(result.ok, true, result.error);
    f.session.state = result.state;
    assert.equal(f.session.save(), true);
  }
  let objects,
    clock = 0;
  const ui = uiFixture(width, height, dpr, {
    candidate: (r) => objects.candidate(r),
    drag: (...args) => objects.move(...args),
    drop: (...args) => objects.drop(...args),
    cancel: () => objects?.clear(),
  });
  const b = ui.summary(),
    target = kind === 'pile' ? { x: 8.5, z: 8.5 } : { x: 9, z: 9 };
  const screenOf = (p) => ({
    x: b.x + (p.x - target.x) * 20 * dpr,
    y: b.y + (p.z - target.z) * 20 * dpr,
  });
  ui.map.screenRay = (p) => ({
    o: { x: target.x + (p.x - b.x) / (20 * dpr), y: 20, z: target.z + (p.y - b.y) / (20 * dpr) },
    d: { x: 0, y: -1, z: 0 },
  });
  const town = {
    lifted: null,
    liftedStack: null,
    pickBuilding(r, exclude) {
      return (
        f.session.state.buildings.find(
          (b) =>
            b.id !== exclude &&
            b.id !== this.lifted &&
            r.o.x >= b.x &&
            r.o.x < b.x + game.footprint(b).width &&
            r.o.z >= b.z &&
            r.o.z < b.z + game.footprint(b).depth,
        )?.id ?? null
      );
    },
    pickStack(r, exclude) {
      const p = f.session.state.groundStacks.find(
        (p) => Math.floor(r.o.x) === p.x && Math.floor(r.o.z) === p.z,
      );
      const id = p ? `pile:${p.x}:${p.z}` : null;
      return p && id !== exclude && id !== this.liftedStack ? { ...p, id } : null;
    },
    pickTree: () => null,
    pickNatural: () => null,
    setLifted(id) {
      this.lifted = id;
    },
    setLiftedStack(id) {
      this.liftedStack = id;
    },
  };
  const { BuildingDrag } = ui.load('BuildingDrag'),
    { StackDrag } = ui.load('StackDrag');
  const { ObjectDrag } = ui.load('ObjectDrag', {
    './BuildingDrag': { BuildingDrag },
    './StackDrag': { StackDrag },
  });
  objects = new ObjectDrag(ui.root, f.session, {}, town, () => {}, {
    acceptsProductDrop: () => false,
    highlightProductDrop() {},
  });
  ui.map.gesture.now = () => clock;
  const source = kind === 'pile' ? { x: 4.5, z: 6.5 } : { x: 7, z: 7 },
    origin = screenOf(source),
    covered = { x: b.x, y: b.y },
    outside = { x: b.x, y: b.bottom - 20 * dpr };
  function lift() {
    ui.touch('start', origin);
    clock += 500;
    ui.map.tick();
    assert.equal(ui.map.interacting, true);
    assert.ok(town.lifted || town.liftedStack);
  }
  return { f, ui, town, lift, origin, covered, outside };
}
for (const [width, height, dpr] of sizes)
  for (const kind of ['building', 'pile'])
    test(`${kind} captured map drag discards valid previews behind summary at ${width}x${height} DPR ${dpr}`, () => {
      const { f, ui, town, lift, covered, outside } = objectFixture(kind, width, height, dpr),
        before = snapshot(f);
      lift();
      ui.touch('move', outside);
      assert.equal(f.commands.length, 0);
      ui.touch('move', covered);
      ui.touch('end', covered);
      ui.touch('end', outside);
      unchanged(f, before);
      assert.equal(f.commands.length, 0);
      assert.equal(town.lifted, null);
      assert.equal(town.liftedStack, null);
      lift();
      ui.touch('move', covered);
      ui.touch('move', outside);
      ui.touch('end', outside);
      assert.equal(f.commands.length, 1);
      assert.equal(f.commands[0].type, kind === 'building' ? 'moveBuilding' : 'moveStack');
      assert.notEqual(snapshot(f).state, before.state);
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
      const after = snapshot(f);
      ui.touch('end', covered);
      unchanged(f, after);
    });

for (const kind of ['building', 'pile'])
  test(`${kind} cancel and responsive relayout release capture without saved changes`, () => {
    for (const cancel of ['cancel', 'resize']) {
      const { f, ui, town, lift, outside, covered } = objectFixture(kind, 390, 844, 3),
        before = snapshot(f);
      lift();
      ui.touch('move', outside);
      if (cancel === 'cancel') ui.touch('cancel', covered);
      else ui.resize(844, 390, 2);
      assert.equal(ui.map.interacting, false);
      assert.equal(town.lifted, null);
      assert.equal(town.liftedStack, null);
      ui.touch('end', outside);
      unchanged(f, before);
      assert.equal(f.commands.length, 0);
      const b = ui.summary();
      assert.equal(ui.map.contains({ x: b.x, y: b.y }), false);
      assert.equal(ui.map.contains({ x: b.x, y: b.bottom - 1 }), true);
    }
  });

test('resize and explicit cancellation stop captured farm and digging commands', () => {
  for (const kind of ['plant', 'harvest']) {
    const ui = uiFixture(390, 844, 3),
      f = farmFixture({ occupied: kind === 'harvest' }),
      b = ui.summary(),
      anchor = { x: b.x, y: b.y };
    projectFarm(
      ui,
      f,
      anchor,
      kind === 'plant' ? project({ ...farmCellCenter(f.farm, 4), y: 0.17 }) : f.cropPoint().point,
    );
    const before = snapshot(f);
    f.tools.begin(kind, 1, anchor);
    ui.resize(844, 390, 2);
    f.tools.end(1, anchor);
    unchanged(f, before);
    f.tools.begin(kind, 2, anchor);
    f.tools.cancel();
    f.tools.end(2, anchor);
    unchanged(f, before);
  }
  const ui = uiFixture(),
    f = farmFixture({ occupied: false }),
    b = ui.summary();
  const { ToolUseDrag } = ui.load('ToolUseDrag');
  const tool = new ToolUseDrag(ui.root, f.session, ui.map, {}, () => {}),
    before = snapshot(f);
  ui.hud.cancelTools = () => tool.cancel();
  tool.begin('diggingTool', 1);
  ui.resize(390, 844, 3);
  tool.end(1, b);
  unchanged(f, before);
});
