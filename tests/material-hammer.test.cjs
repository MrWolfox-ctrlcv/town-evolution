const test = require('node:test'),
  assert = require('node:assert/strict'),
  g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
function town(kind) {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = { ...emptyStock(), mud: 2 };
  s.buildings.push({ id: 'b3', kind, x: 9, z: 5, rotation: 0 });
  s.nextId = 4;
  return s;
}
function accept(s, c) {
  const text = JSON.stringify(s),
    r = g.dispatch(s, c, 1000);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), text);
  assert.deepEqual(g.importSave(g.exportSave(r.state), 1000), r.state);
  return r.state;
}
function reject(s, c) {
  const text = JSON.stringify(s),
    r = g.dispatch(s, c, 1000);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), text);
}
for (const [kind, result, id, legacy] of [
  ['crate', 'nursery', 'build-nursery', 'buildNursery'],
  ['house', 'residence', 'build-residence', 'buildResidence'],
])
  test(`${kind} stages mud explicitly and only a hammer finishes ${result}`, () => {
    let s = town(kind);
    reject(s, { type: legacy, buildingId: 'b3' });
    const unstaged = structuredClone(s);
    // An empty crate now makes a compost barrel; unrelated attachments still reject atomically.
    if (kind === 'crate') unstaged.fusion.attachments.b3 = { ...emptyStock(), wood: 1 };
    reject(unstaged, { type: 'useTool', tool: 'hammer', buildingId: 'b3' });
    s = accept(s, { type: 'attachMaterial', buildingId: 'b3', item: 'mud', quantity: 1 });
    assert.equal(s.buildings[2].kind, kind);
    assert.equal(s.inventory.mud, 1);
    assert.equal(s.fusion.discoveries[id], undefined);
    s = accept(s, { type: 'useTool', tool: 'hammer', buildingId: 'b3' });
    assert.equal(s.buildings[2].kind, result);
    assert.equal(s.inventory.mud, 1);
    assert.equal(s.fusion.attachments.b3, undefined);
    assert.equal(s.fusion.discoveries[id].count, 1);
    assert.equal(s.fusion.discoveries['expand-warehouse'], undefined);
  });
test('ground material staging requires exact source snapshot, preserves leftovers and never takes inventory', () => {
  let s = town('crate');
  s.groundStacks = [{ x: 11, z: 5, item: 'mud', amount: 3 }];
  const source = { ...s.groundStacks[0] },
    c = { type: 'attachMaterial', buildingId: 'b3', item: 'mud', quantity: 1, source };
  reject(s, { ...c, source: { ...source, amount: 2 } });
  reject(s, { ...c, source: { ...source, item: 'wood' } });
  s = accept(s, c);
  assert.equal(s.groundStacks[0].amount, 2);
  assert.equal(s.inventory.mud, 2);
  reject(s, c);
  s = accept(s, { type: 'useTool', tool: 'hammer', buildingId: 'b3' });
  assert.equal(s.groundStacks[0].amount, 2);
  assert.equal(s.inventory.mud, 2);
});
test('direct building facilities merge, but house plus crate or board cannot bypass hammer', () => {
  for (const kind of ['crate', 'orderBoard', 'stoneMill', 'stoneOven']) {
    let s = town('house');
    s.buildings.push({ id: 'b4', kind, x: 12, z: 5, rotation: 0 });
    s.nextId = 5;
    const c = { type: 'dragMerge', sourceId: 'b4', targetId: 'b3' };
    if (kind === 'crate' || kind === 'orderBoard') reject(s, c);
    else {
      s = accept(s, c);
      assert.equal(
        s.buildings.find((b) => b.id === 'b3').kind,
        kind === 'stoneMill' ? 'mill' : 'bakery',
      );
    }
  }
});
