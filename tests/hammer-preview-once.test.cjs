/** Production gesture/session code with CPU scene collaborators, not rendered Cocos QA. */
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { GameSession } = require('../.domain-build/application/GameSession');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
const { presentation, SceneNode } = require('./helpers/demo-campaign-scene.cjs');
const { ToolUseDrag } = presentation('ToolUseDrag');
const { singleHammerPreview, singleHammerResult } = presentation('SingleHammerPreview');
const command = { type: 'useTool', tool: 'hammer', buildingId: 'b3' };
const point = { buildingId: 'b3' };
function fixture(kind = 'crate', attachment) {
  const state = game.createGame(1000, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.buildings.push({ id: 'b3', kind, x: 10, z: 5, rotation: 0 });
  state.nextId = 4;
  if (attachment) state.fusion.attachments.b3 = { ...emptyStock(), ...attachment };
  const data = new Map(),
    writes = [];
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: () => assert.fail('Unexpected delete'),
  };
  const session = new GameSession(
    storage,
    () => 1000,
    () => game.importSave(game.exportSave(state), 1000),
  );
  const map = { cancelGesture() {}, contains: (p) => !p.outside, screenRay: (p) => p };
  const town = {
    pickBuilding: (p) => p.buildingId ?? null,
    pickTree: () => null,
    pickNatural: () => null,
    pickDrop: () => null,
    pickStack: () => null,
  };
  const tool = new ToolUseDrag(new SceneNode('World'), session, map, town, () => {});
  const previews = [],
    mark = tool.mark.bind(tool);
  tool.mark = (command, valid, at, single) => {
    previews.push(single?.kind ?? null);
    mark(command, valid, at, single);
  };
  return { session, storage, data, writes, tool, previews };
}
function countDispatch(run) {
  const original = game.dispatch;
  let calls = 0;
  game.dispatch = (...args) => {
    calls++;
    return original(...args);
  };
  try {
    run(() => calls);
  } finally {
    game.dispatch = original;
  }
}

for (const [kind, attachment, expected] of [
  ['crate', undefined, 'compostBarrel'],
  ['crate', { mud: 1 }, 'nursery'],
  ['crate', { wood: 1 }, null],
  ['house', { mud: 1 }, 'residence'],
  ['warehouse', { wood: game.FUSION.expansionWood }, 'expandedWarehouse'],
])
  test(`single hammer ${kind}/${JSON.stringify(attachment)} has one preview and rechecks release`, () => {
    const f = fixture(kind, attachment),
      before = game.exportSave(f.session.state);
    f.tool.begin('hammer', 7);
    countDispatch((calls) => {
      f.tool.move(7, point);
      assert.equal(calls(), 1);
      assert.equal(f.previews.at(-1), expected);
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual(f.writes, []);
      f.tool.move(7, point);
      assert.equal(calls(), 2, 'Repeated move makes a fresh advisory result');
      f.tool.end(7, point);
      assert.equal(calls(), 3, 'Release dispatches again instead of adopting hover state');
      f.tool.end(7, point);
      assert.equal(calls(), 3);
    });
    assert.equal(f.session.state.buildings.find((b) => b.id === 'b3').kind, expected ?? kind);
    if (expected)
      assert.equal(
        game.importSave(f.data.get(SAVE_KEY), 1000).buildings.find((b) => b.id === 'b3').kind,
        expected,
      );
    else {
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual(f.writes, []);
    }
  });

test('in-place material changes after hover are revalidated, never cached by state identity', () => {
  const f = fixture(),
    same = f.session.state;
  f.tool.begin('hammer', 7);
  f.tool.move(7, point);
  assert.equal(f.previews.at(-1), 'compostBarrel');
  same.fusion.attachments.b3 = { ...emptyStock(), mud: 1 };
  f.tool.move(7, point);
  assert.equal(f.previews.at(-1), 'nursery');
  same.fusion.attachments.b3 = { ...emptyStock(), wood: 1 };
  const before = game.exportSave(same);
  f.tool.end(7, point);
  assert.equal(f.session.state, same);
  assert.equal(game.exportSave(f.session.state), before);
  assert.deepEqual(f.writes, []);
});

test('source change then restoration, cancellation and off-map release cannot commit an old preview', () => {
  for (const finish of ['changed-restored', 'cancelled', 'outside']) {
    const f = fixture();
    f.tool.begin('hammer', 7);
    f.tool.move(7, point);
    if (finish === 'changed-restored') {
      const crate = f.session.state.buildings.find((b) => b.id === 'b3');
      crate.kind = 'house';
      f.tool.move(7, point);
      crate.kind = 'crate';
    } else if (finish === 'cancelled') f.tool.cancel();
    const before = game.exportSave(f.session.state);
    f.tool.end(7, finish === 'outside' ? { ...point, outside: true } : point);
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual(f.writes, []);
  }
});

test('preview respects recovery/corruption/conflict gates and returned buildings are never committed', () => {
  for (const mode of ['recovered', 'corrupt', 'conflict']) {
    const f = fixture();
    if (mode === 'conflict') {
      f.data.set(SAVE_KEY, game.exportSave({ ...f.session.state, coins: 90 }));
      assert.equal(f.session.run(command), false);
    } else f.session.mode = mode;
    countDispatch((calls) => {
      assert.ok(singleHammerPreview(f.session, command).reason);
      assert.equal(singleHammerResult(f.session, command), null);
      assert.equal(calls(), 0);
    });
    assert.deepEqual(f.writes, []);
  }
  const f = fixture(),
    advisory = singleHammerPreview(f.session, command);
  advisory.building.kind = 'nursery';
  assert.equal(f.session.state.buildings.find((b) => b.id === 'b3').kind, 'crate');
  assert.equal(f.session.run(command), true);
  assert.equal(f.session.state.buildings.find((b) => b.id === 'b3').kind, 'compostBarrel');
});
