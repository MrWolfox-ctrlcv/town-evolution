/** Production domain, geometry and HUD decisions with in-memory storage. No WebGL claim. */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const g = require('../.domain-build/domain/game');
const { clone } = require('../.domain-build/domain/state');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { v6EditPlane: plane } = require('../.domain-build/domain/v6-material-volume');
const { GameSession } = require('../.domain-build/application/GameSession');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
const {
  MAX_SAVE_CHARACTERS,
  serializedSaveLength,
} = require('../.domain-build/domain/save-limits');
const { buildV6SurfaceMesh } = require('../.domain-build/art/V6SurfaceMesh');
const { finishV6Chunk } = require('../.domain-build/art/V6SurfaceMerge');
const { V6TerrainPicking } = require('../.domain-build/application/V6TerrainPicking');
const { presentation } = require('./helpers/demo-campaign-scene.cjs');
const { actions } = presentation('HudActions');
let initial;
before(() => {
  const prep = new V6WorldPreparation(42173);
  while (prep.step(50000).status !== 'ready') {}
  prep.takeResult();
  initial = g.createGame(1000, 42173, 6);
});
function fixture(state = clone(initial)) {
  const bytes = new Map();
  let blocked = false;
  const session = new GameSession(
    {
      getItem: (key) => bytes.get(key) ?? null,
      setItem: (key, value) => {
        if (blocked) throw Error('test storage unavailable');
        bytes.set(key, value);
      },
      removeItem: () => assert.fail('Unexpected storage deletion'),
    },
    () => 1001,
    () => state,
  );
  return { session, bytes, block: (value) => (blocked = value) };
}
const gather = (id) => ({ type: 'gatherNatural', resourceId: id });
const dig = (state, r) => ({
  type: 'editTerrain6',
  kind: 'dig',
  x: r.x,
  z: r.z,
  level: g.terrain6EditLevel(state, r.x, r.z, 'dig'),
  expectedOperation: state.terrain6.nextOperation,
});
function sameExcavation(actual, expected) {
  const { fusion: actualFusion, ...actualState } = actual;
  const { fusion: expectedFusion, ...expectedState } = expected;
  assert.deepEqual(actualState, expectedState);
  assert.deepEqual(actualFusion.attachments, expectedFusion.attachments);
  // Existing resource-menu discovery tracking differs from explicit terrain edits.
  // Preserve it rather than changing that unrelated command contract.
}
function roundtrip(state) {
  const text = g.exportSave(state);
  const loaded = g.importSave(text, state.lastSeenAt);
  assert.equal(g.exportSave(loaded), text);
  return loaded;
}
function pickNatural(state, r) {
  const mesh = buildV6SurfaceMesh(g.getV6EditSurface(state), r.x, r.z, 1, 1);
  const triangle = mesh.triangles.findIndex((t) => t.resourceId === r.id);
  assert.ok(triangle >= 0, 'the real resource must have exposed geometry');
  const centroid = (axis) =>
    mesh.indices
      .slice(triangle * 3, triangle * 3 + 3)
      .reduce((sum, i) => sum + mesh.positions[i * 3 + axis], 0) / 3;
  const picker = new V6TerrainPicking();
  picker.sync([finishV6Chunk('probe', mesh)]);
  return picker.pick({
    o: { x: centroid(0), y: 80, z: centroid(2) },
    d: { x: 0, y: -1, z: 0 },
  });
}
for (const [id, item, amount] of [
  ['n10_14', 'soil', 124 / 4096],
  ['n17_15', 'stone', 1 / 4096],
])
  test(`v6 ${item} resource HUD accepts an exposed slope whose minimum is the protected plane`, () => {
    const { session, bytes } = fixture();
    const r = session.state.naturalResources.find((v) => v.id === id);
    const [lo, hi] = g.getV6EditSurface(session.state).range(r.x, r.z);
    assert.equal(lo, plane(0));
    assert.ok(hi > lo);
    assert.equal(pickNatural(session.state, r).resourceId, id);
    const expected = g.dispatch(session.state, dig(session.state, r), 1001);
    assert.equal(expected.ok, true, expected.error);
    const button = actions(
      session,
      { selectedResource: { kind: 'natural', id }, tab: 'manage' },
      { command: (command) => assert.equal(session.run(command), true, session.message) },
    )[0];
    assert.equal(button.text, item === 'soil' ? '挖土' : '采石');
    assert.equal(button.enabled, true, button.reason);
    button.run();
    sameExcavation(session.state, expected.state);
    assert.equal(session.state.fusion.discoveries[`gather-${item}`].count, 1);
    assert.equal(
      session.state.looseDrops.reduce((sum, d) => sum + d.amount, 0),
      amount,
    );
    assert.ok(session.state.looseDrops.every((d) => d.item === item));
    assert.deepEqual(session.state.inventory, initial.inventory);
    assert.equal(bytes.get(SAVE_KEY), g.exportSave(session.state));
    const mesh = buildV6SurfaceMesh(g.getV6EditSurface(session.state), r.x, r.z, 1, 1);
    const loaded = roundtrip(session.state);
    assert.deepEqual(buildV6SurfaceMesh(g.getV6EditSurface(loaded), r.x, r.z, 1, 1), mesh);
    const before = g.exportSave(session.state);
    assert.equal(session.run(gather(id)), false, 'depleted resource cannot pay twice');
    assert.equal(g.exportSave(session.state), before);
    assert.equal(bytes.get(SAVE_KEY), before);
    for (const drop of [...session.state.looseDrops])
      assert.equal(session.run({ type: 'pickupDrop', dropId: drop.id }), true, session.message);
    assert.equal(session.state.inventory[item], initial.inventory[item] + amount);
    roundtrip(session.state);
  });

test('v6 resource and explicit digging agree between planes and on subsequent flat layers', () => {
  const r = initial.naturalResources.find((resource) => {
    if (resource.kind !== 'stone' || resource.amount < 3) return false;
    const cmd = dig(initial, resource);
    const [lo] = g.getV6EditSurface(initial).range(resource.x, resource.z);
    return cmd.level > 1 && lo !== plane(cmd.level) && g.dispatch(initial, cmd, 1001).ok;
  });
  assert.ok(r);
  let state = clone(initial);
  for (let i = 0; i < 3; i++) {
    const cmd = dig(state, r);
    const explicit = g.dispatch(state, cmd, 1001);
    const selected = g.dispatch(state, gather(r.id), 1001);
    assert.equal(selected.ok, true, selected.error);
    assert.equal(explicit.ok, true, explicit.error);
    sameExcavation(selected.state, explicit.state);
    assert.equal(selected.state.fusion.discoveries['gather-stone'].count, i + 1);
    state = selected.state;
    assert.deepEqual(g.getV6EditSurface(state).range(r.x, r.z), [
      plane(cmd.level),
      plane(cmd.level),
    ]);
    for (const drop of [...state.looseDrops]) {
      const picked = g.dispatch(state, { type: 'pickupDrop', dropId: drop.id }, 1001);
      assert.equal(picked.ok, true, picked.error);
      state = picked.state;
    }
    state = roundtrip(state);
  }
});

test('the shared v6 selector keeps exact low/high boundary semantics, including genuine exhaustion', () => {
  // Range-only unit fixture executes the actual helper, not a second selector or fake world.
  const code = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, '../assets/scripts/domain/v6-edit-level.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  let range;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) =>
      id === './v6-edit-surface'
        ? { getV6EditSurface: () => ({ range: () => range }) }
        : require('../.domain-build/domain/v6-material-volume'),
    module,
    module.exports,
  );
  for (const [lo, hi, expected] of [
    [plane(0), plane(0) + 1e-9, 0],
    [plane(0), plane(0), null],
    [plane(3), plane(3) + 1e-9, 3],
    [plane(3), plane(3), 2],
    [plane(3) + 0.25, plane(4), 3],
    [plane(3) - 1e-9, plane(3), 2],
  ]) {
    range = [lo, hi];
    assert.equal(module.exports.terrain6EditLevel({}, 10, 14, 'dig'), expected);
  }
});

test('v6 gathering retains object and coastal protection with atomic failure', () => {
  const r = initial.naturalResources.find((v) => v.id === 'n10_14');
  const cases = [
    (s) => s.trees.push({ ...s.trees[0], id: 'blocked-tree', x: r.x, z: r.z }),
    (s) => s.buildings.push({ ...s.buildings[0], id: 'blocked-building', x: r.x, z: r.z }),
    (s) => s.groundStacks.push({ x: r.x, z: r.z, item: 'wood', amount: 1 }),
    (s) => {
      const dug = g.dispatch(s, dig(s, r), 1001);
      assert.equal(dug.ok, true, dug.error);
      // Production excavation now prefers nearby ground outside its pit. This
      // fixture specifically protects a drop occupying the resource being dug,
      // independent of the production spill placement policy.
      assert.ok(dug.state.looseDrops.length > 0);
      s.looseDrops = dug.state.looseDrops.map((drop) => ({
        ...drop,
        x6: r.x * 6 + 3,
        z6: r.z * 6 + 3,
      }));
      assert.ok(
        s.looseDrops.every(
          (drop) => Math.floor(drop.x6 / 6) === r.x && Math.floor(drop.z6 / 6) === r.z,
        ),
      );
    },
  ];
  for (const block of cases) {
    const state = clone(initial);
    block(state);
    const before = JSON.stringify(state);
    const result = g.dispatch(state, gather(r.id), 1001);
    assert.equal(result.ok, false);
    assert.match(result.error, /树木|建筑|田地|地堆|掉落/);
    assert.equal(result.state, state);
    assert.equal(JSON.stringify(state), before);
  }
  const coastal = initial.naturalResources.find((resource) => {
    const result = g.dispatch(initial, dig(initial, resource), 1001);
    return !result.ok && /缓冲区/.test(result.error);
  });
  assert.ok(coastal);
  const before = JSON.stringify(initial);
  const result = g.dispatch(initial, gather(coastal.id), 1001);
  assert.equal(result.ok, false);
  assert.match(result.error, /缓冲区/);
  assert.equal(JSON.stringify(initial), before);
});

test('v6 resource gather cannot publish a predictable save overflow', () => {
  // Same controlled size padding pattern as terrain6-save-size; not an imported world fixture.
  const state = clone(initial);
  state.serializationBoundaryFixture = '';
  state.serializationBoundaryFixture = 'x'.repeat(
    MAX_SAVE_CHARACTERS - serializedSaveLength(state),
  );
  assert.equal(serializedSaveLength(state), MAX_SAVE_CHARACTERS);
  const { session, bytes } = fixture(state);
  const before = JSON.stringify(state);
  assert.equal(session.run(gather('n10_14')), false);
  assert.match(session.statusMessage, /存档大小上限/);
  assert.equal(session.state, state);
  assert.equal(JSON.stringify(state), before);
  assert.equal(bytes.size, 0);
});

test('v6 resource gather preserves the old durable save and new in-memory cut on storage denial', () => {
  const { session, bytes, block } = fixture();
  assert.equal(session.save(), true);
  const stored = bytes.get(SAVE_KEY);
  block(true);
  assert.equal(session.run(gather('n10_14')), true, session.message);
  assert.equal(session.hasUnsavedChanges, true);
  assert.match(session.statusMessage, /保存失败/);
  assert.equal(bytes.get(SAVE_KEY), stored);
  const changed = g.exportSave(session.state);
  assert.notEqual(changed, stored);
  assert.equal(session.run(gather('n10_14')), false);
  assert.equal(g.exportSave(session.state), changed);
  block(false);
  assert.equal(session.save(), true);
  assert.equal(session.hasUnsavedChanges, false);
  assert.equal(bytes.get(SAVE_KEY), changed);
  roundtrip(session.state);
});
