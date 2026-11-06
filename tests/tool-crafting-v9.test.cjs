const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
function town(item, amount) {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = emptyStock();
  s.groundStacks = [{ x: 9, z: 5, item, amount }];
  return s;
}
for (const [tool, item, amount, kind, recipeId] of [
  ['hammer', 'wood', 1, 'orderBoard', 'build-order-board'],
  ['hammer', 'wood', 2, 'crate', 'build-crate'],
  ['saw', 'wood', 3, 'handcart', 'build-handcart'],
  ['saw', 'wood', 4, 'boat', 'build-boat'],
  ['hammer', 'wood', 3, 'woodenPier', 'build-wooden-pier'],
  ['hammer', 'wood', 4, 'house', 'build-house'],
  ['hammer', 'stone', 2, 'stoneMill', 'build-stone-mill'],
])
  test(`${amount} ${item} + ${tool} makes exactly ${kind} and discovers only its own recipe`, () => {
    const s = town(item, amount),
      before = JSON.stringify(s);
    const plan = g.toolCraftPlan(s, tool, 9, 5);
    assert.equal(plan.reason, null);
    assert.equal(plan.building.kind, kind);
    const r = g.dispatch(s, { type: 'useTool', tool, x: 9, z: 5 }, 1000);
    assert.equal(r.ok, true, r.error);
    assert.equal(JSON.stringify(s), before);
    assert.equal(r.state.buildings.at(-1).kind, kind);
    assert.equal(r.state.groundStacks.length, 0);
    assert.equal(r.state.coins, s.coins);
    assert.deepEqual(Object.keys(r.state.fusion.discoveries), [recipeId]);
    assert.deepEqual(g.importSave(g.exportSave(r.state), 1000), r.state);
  });
test('unknown materials, wrong amounts and occupied candidate footprints reject without loss', () => {
  for (const [tool, item, amount] of [
    ['saw', 'stone', 2],
    ['saw', 'wood', 5],
    ['saw', 'wood', 1],
    ['hammer', 'stone', 3],
    ['hammer', 'stone', 4],
  ]) {
    const s = town(item, amount),
      text = JSON.stringify(s),
      r = g.dispatch(s, { type: 'useTool', tool, x: 9, z: 5 }, 1000);
    assert.equal(r.ok, false);
    assert.equal(r.state, s);
    assert.equal(JSON.stringify(s), text);
  }
  const s = town('wood', 4);
  for (const [x, z] of [
    [8, 4],
    [10, 4],
    [8, 6],
    [10, 6],
  ])
    s.trees.push({ id: `t${s.nextTreeId++}`, x, z });
  const text = JSON.stringify(s),
    r = g.dispatch(s, { type: 'useTool', tool: 'hammer', x: 9, z: 5 }, 1000);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), text);
});
test('legacy house discovery remains the same ID while its current recipe specifies the hammer', () => {
  const s = town('wood', 4);
  s.fusion.discoveries['build-house'] = { count: 2, firstDiscoveredAt: 0 };
  const saved = g.importSave(g.exportSave(s), 1000);
  assert.deepEqual(saved.fusion.discoveries['build-house'], s.fusion.discoveries['build-house']);
  assert.equal(g.RECIPE_DEFINITIONS.find((r) => r.id === 'build-house').tool, 'hammer');
});
