const test = require('node:test');
const assert = require('node:assert/strict');
const { bridgeCrossingPlan } = require('../.domain-build/domain/bridge-crossing');
const { getV5Hydrology } = require('../.domain-build/domain/v5-hydrology');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { createGame } = require('../.domain-build/domain/game');
function town(seed = 1, x = 133, z = 135, rotation = 1, length = 15) {
  const state = createGame(1000, seed, 1);
  state.terrainVersion = 5;
  state.trees = [];
  state.naturalResources = [];
  state.buildings = [
    { id: 'b3', kind: 'woodenPier', x, z, rotation: 0 },
    {
      id: 'b4',
      kind: 'woodenPier',
      x: x + (rotation === 1 ? length - 2 : 0),
      z: z + (rotation === 0 ? length - 2 : 0),
      rotation: 3,
    },
  ];
  state.nextId = 5;
  return state;
}
function snap(s) {
  return s.buildings.map(({ id, kind, x, z, rotation }) => ({ id, kind, x, z, rotation }));
}
function rejected(s, sources = snap(s)) {
  const before = JSON.stringify(s);
  assert.throws(() => bridgeCrossingPlan(s, sources));
  assert.equal(JSON.stringify(s), before);
}
for (const args of [
  [1, 133, 135, 1, 15],
  [42, 136, 130, 0, 15],
  [20261106, 137, 130, 0, 14],
])
  test(`two explicit piers on opposite real river banks produce a pure crossing for seed ${args[0]}`, () => {
    const state = town(...args),
      before = JSON.stringify(state),
      plan = bridgeCrossingPlan(state, snap(state)),
      hydro = getV5Hydrology(state.mapSeed);
    assert.equal(JSON.stringify(state), before);
    assert.equal(plan.length, args[4]);
    assert.equal(plan.rotation, args[3]);
    assert.equal(plan.endpointCells.length, 8);
    assert.equal(plan.occupiedCells.length, 2 * plan.length);
    for (const p of plan.endpointCells) assert.equal(hydro.at(p.x, p.z).state, 'dryBuildable');
    assert.ok(plan.riverCells.length >= 4);
    for (const p of plan.riverCells) {
      assert.equal(hydro.at(p.x, p.z).state, 'clearWater');
      assert.equal(hydro.at(p.x, p.z).waterKind, 'river');
    }
    assert.deepEqual(bridgeCrossingPlan(state, snap(state).reverse()), plan);
  });
test('old islands, same-bank pairs, ocean/lake proximity and incomplete endpoints fail closed', () => {
  const old = town();
  old.terrainVersion = 4;
  rejected(old);
  rejected(town(1, 3, 3, 0, 10));
  rejected(town(1, 108, 120, 1, 15));
  rejected(town(1, 180, 170, 0, 15));
  rejected(town(1, 138, 135, 1, 10));
});
test('sources must be exact, distinct, aligned and within the provisional span limit', () => {
  const state = town(),
    sources = snap(state);
  for (const change of [
    (v) => v.splice(1, 1),
    (v) => v.push({ ...v[0] }),
    (v) => (v[1] = { ...v[0] }),
    (v) => v[0].x++,
    (v) => (v[0].kind = 'crate'),
    (v) => (v[0].rotation = 2),
  ]) {
    const changed = structuredClone(sources);
    change(changed);
    rejected(state, changed);
  }
  const misaligned = town();
  misaligned.buildings[1].z++;
  rejected(misaligned);
  rejected(town(1, 133, 135, 1, 17));
  rejected(town(1, 133, 135, 1, 6));
});
test('every occupied tile protects buildings, trees, resource stock, piles, drops and reclamation', () => {
  const original = town(),
    p = bridgeCrossingPlan(original, snap(original)).occupiedCells[12];
  for (const obstruct of [
    (s) => s.buildings.push({ id: 'b5', kind: 'crate', ...p, rotation: 0 }),
    (s) => s.trees.push({ id: 't1', ...p }),
    (s) => s.naturalResources.push({ id: `n${p.x}_${p.z}`, kind: 'soil', ...p, amount: 9 }),
    (s) => s.groundStacks.push({ item: 'vegetable', amount: 2, ...p }),
    (s) =>
      s.looseDrops.push({
        id: 'd5',
        item: 'vegetable',
        amount: 2,
        x6: p.x * 6 + 3,
        z6: p.z * 6 + 3,
      }),
    (s) => s.landExtensions.push({ ...p }),
  ]) {
    const state = structuredClone(original);
    obstruct(state);
    rejected(state, snap(original));
  }
});
test('attached materials are retained by the plan and over-capacity rejects without changes', () => {
  const state = town();
  state.fusion.attachments.b3 = { ...emptyStock(), wood: 2 };
  state.fusion.attachments.b4 = { ...emptyStock(), stone: 3 };
  const before = JSON.stringify(state),
    plan = bridgeCrossingPlan(state, snap(state));
  assert.equal(plan.retainedId, 'b3');
  assert.equal(plan.consumedId, 'b4');
  assert.equal(JSON.stringify(state), before);
  state.fusion.attachments.b4.stone++;
  rejected(state);
});
