const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
function town(water) {
  const s = g.createGame(1000, 1, 1);
  s.inventory = emptyStock();
  s.coins = 0;
  if (water) s.buildings[1].irrigated = true;
  return s;
}
for (const water of [false, true])
  test(`${water ? 'water-only' : 'dry'} farms recover exactly one immediately plantable crop`, () => {
    const s = town(water),
      r = g.dispatch(s, { type: 'recoverCrop' }, 1000),
      crop = water ? 'rice' : 'vegetable';
    assert.equal(r.ok, true, r.error);
    assert.equal(r.state.inventory[crop], 1);
    assert.equal(r.state.cropRecoveryAvailable, false);
    const p = g.dispatch(r.state, { type: 'plantCell', buildingId: 'b2', cell: 0, crop }, 1000);
    assert.equal(p.ok, true, p.error);
    assert.equal(g.dispatch(p.state, { type: 'recoverCrop' }, 1000).ok, false);
  });
test('mixed fields retain carrot recovery and missing fields never consume the flag', () => {
  const mixed = town(true);
  mixed.trees = [];
  mixed.naturalResources = [];
  mixed.buildings.push({
    id: 'b3',
    kind: 'farm',
    x: 9,
    z: 5,
    rotation: 0,
    cropJobs: Array(9).fill(null),
  });
  mixed.nextId = 4;
  assert.equal(g.dispatch(mixed, { type: 'recoverCrop' }, 1000).state.inventory.vegetable, 1);
  const none = town(true);
  none.buildings = none.buildings.filter((b) => b.kind !== 'farm');
  const before = JSON.stringify(none),
    r = g.dispatch(none, { type: 'recoverCrop' }, 1000);
  assert.equal(r.ok, false);
  assert.equal(r.state, none);
  assert.equal(JSON.stringify(none), before);
});
test('rice anywhere in inventory, ground, attachments or staged cargo prevents duplicate emergency seeds', () => {
  const variants = [
    (s) => {
      s.inventory.rice = 1;
    },
    (s) => {
      s.groundStacks.push({ x: 9, z: 5, item: 'rice', amount: 1 });
    },
    (s) => {
      s.fusion.attachments.b1 = { ...emptyStock(), rice: 1 };
    },
    (s) => {
      s.commerce.dockCargo.b9 = { ...emptyStock(), rice: 1 };
    },
  ];
  for (const apply of variants) {
    const s = town(true);
    apply(s);
    const before = JSON.stringify(s),
      r = g.dispatch(s, { type: 'recoverCrop' }, 1000);
    assert.equal(r.ok, false);
    assert.equal(r.state, s);
    assert.equal(JSON.stringify(s), before);
  }
});
