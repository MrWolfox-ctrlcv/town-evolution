const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { buildingMergePlan, hasDockExit } = require('../.domain-build/domain/merge-plan');
const { emptyStock } = require('../.domain-build/domain/commerce');
function pair(base, addition) {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = emptyStock();
  s.buildings = [
    { id: 'b3', kind: base, x: 8, z: 5, rotation: 1 },
    { id: 'b4', kind: addition, x: 11, z: 5, rotation: 0 },
  ];
  s.nextId = 5;
  return s;
}
for (const [base, addition, kind] of [
  ['house', 'crate', 'warehouse'],
  ['house', 'orderBoard', 'shop'],
  ['house', 'stoneMill', 'mill'],
  ['house', 'stoneOven', 'bakery'],
  ['warehouse', 'handcart', 'transportWarehouse'],
])
  test(`${base} + ${addition} has the same zero-cost retained identity in both directions`, () => {
    const s = pair(base, addition);
    s.fusion.attachments.b3 = { ...emptyStock(), wheat: 1 };
    s.fusion.attachments.b4 = { ...emptyStock(), stone: 1 };
    const before = JSON.stringify(s);
    const a = buildingMergePlan(s, 'b3', 'b4'),
      b = buildingMergePlan(s, 'b4', 'b3');
    assert.deepEqual(a, b);
    assert.equal(a.retainedId, 'b3');
    assert.equal(a.consumedId, 'b4');
    assert.equal(a.building.kind, kind);
    assert.equal(a.building.x, 8);
    assert.equal(a.building.rotation, 1);
    assert.equal(a.cost, 0);
    assert.equal(JSON.stringify(s), before);
  });
test('planned dock keeps wooden-pier anchor, selects a safe sea direction and never gifts a boat', () => {
  const s = pair('woodenPier', 'crate');
  Object.assign(s.buildings[0], { x: 2, z: 2, rotation: 0 });
  s.buildings.push({ id: 'b5', kind: 'orderBoard', x: 12, z: 6, rotation: 0 });
  s.nextId = 6;
  const withBoard = JSON.stringify(s);
  const a = g.dockAssemblyPlan(s, 'b3', 'b4', 'b5');
  assert.throws(() => buildingMergePlan(s, 'b3', 'b4'));
  assert.deepEqual(a.consumedIds, ['b4', 'b5']);
  assert.equal(JSON.stringify(s), withBoard);
  assert.equal(a.building.kind, 'dock');
  assert.equal(a.building.x, 2);
  assert.equal(a.building.z, 2);
  assert.equal(a.building.dockStyle, 'simple');
  assert.equal(a.building.boatAttached, undefined);
  assert.ok(hasDockExit(s, a.building));
  assert.equal(JSON.stringify(s), withBoard);
});
test('invalid merge plans never mutate inputs and reject inland docks, blocked occupancy and excessive attachments', () => {
  const inland = pair('woodenPier', 'crate'),
    before = JSON.stringify(inland);
  assert.throws(() => buildingMergePlan(inland, 'b3', 'b4'));
  assert.equal(JSON.stringify(inland), before);
  const blocked = pair('house', 'stoneMill');
  blocked.trees.push({ id: 't1', x: 8, z: 5 });
  assert.throws(() => buildingMergePlan(blocked, 'b3', 'b4'));
  const full = pair('house', 'stoneMill');
  full.fusion.attachments.b3 = { ...emptyStock(), wood: 3 };
  full.fusion.attachments.b4 = { ...emptyStock(), stone: 3 };
  assert.throws(() => buildingMergePlan(full, 'b3', 'b4'));
  assert.throws(() => buildingMergePlan(full, 'b3', 'b3'));
  assert.throws(() => buildingMergePlan(full, 'missing', 'b4'));
});
