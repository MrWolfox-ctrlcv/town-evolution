const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
function town(amount = 1) {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.groundStacks = [
    { x: 9, z: 5, item: 'wood', amount },
    { x: 10, z: 5, item: 'stone', amount },
  ];
  return s;
}
function request(s, x = 9, z = 5) {
  return {
    type: 'craftMixed',
    recipeId: 'build-stone-oven',
    tool: 'hammer',
    sources: s.groundStacks.map((p) => ({ ...p })),
    x,
    z,
  };
}
function reject(s, c) {
  const text = JSON.stringify(s),
    r = g.dispatch(s, c, 1000);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), text);
}
test('explicit wood and stone snapshots make one oven; preview is pure and all assets roundtrip', () => {
  const s = town(),
    c = request(s),
    text = JSON.stringify(s);
  const plan = g.mixedCraftPlan(s, c);
  assert.equal(plan.reason, null);
  assert.equal(JSON.stringify(s), text);
  const r = g.dispatch(s, c, 1000);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.state.groundStacks.length, 0);
  assert.equal(r.state.buildings.at(-1).kind, 'stoneOven');
  assert.deepEqual(r.state.inventory, s.inventory);
  assert.deepEqual(Object.keys(r.state.fusion.discoveries), ['build-stone-oven']);
  assert.deepEqual(g.importSave(g.exportSave(r.state), 1000), r.state);
  reject(r.state, c);
});
test('large source piles retain exact remainders and require a clear explicit target', () => {
  const s = town(4);
  reject(s, request(s));
  const c = request(s, 11, 5);
  const r = g.dispatch(s, c, 1000);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(
    r.state.groundStacks.map((p) => p.amount),
    [3, 3],
  );
  assert.deepEqual(r.state.inventory, s.inventory);
});
test('stale, duplicate, wrong, partial or extra sources never consume materials or tools', () => {
  for (const edit of [
    (c) => c.sources[0].amount++,
    (c) => (c.sources[0].item = 'soil'),
    (c) => (c.sources[1] = { ...c.sources[0] }),
    (c) => c.sources.pop(),
    (c) => c.sources.push({ ...c.sources[0], x: 11 }),
    (c) => (c.tool = 'saw'),
    (c) => (c.recipeId = 'build-stone-mill'),
    (c) => {
      c.x = 3;
      c.z = 3;
    },
    (c) => (c.x = Infinity),
  ]) {
    const s = town(),
      c = request(s);
    edit(c);
    reject(s, c);
  }
  const s = town();
  s.groundStacks = [{ x: 9, z: 5, item: 'stone', amount: 4 }];
  reject(s, { type: 'useTool', tool: 'hammer', x: 9, z: 5 });
});
test('old saved ovens and their discovery remain valid after recipe replacement', () => {
  const s = town();
  s.groundStacks = [];
  s.buildings.push({ id: 'b3', kind: 'stoneOven', x: 9, z: 5, rotation: 0 });
  s.nextId = 4;
  s.fusion.discoveries['build-stone-oven'] = { count: 2, firstDiscoveredAt: 0 };
  assert.deepEqual(g.importSave(g.exportSave(s), 1000), s);
  assert.equal(g.RECIPE_DEFINITIONS.find((r) => r.id === 'build-stone-oven').ingredients.length, 2);
});
