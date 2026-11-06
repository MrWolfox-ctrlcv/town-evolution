const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_SAVE_CHARACTERS: LIMIT,
  SaveSizeError,
  assertSaveFits,
  serializedSaveLength,
} = require('../.domain-build/domain/save-limits');
const { createGame, dispatch, advance } = require('../.domain-build/domain/game');
const { GameSession } = require('../.domain-build/application/GameSession');
const { V6_GENERATOR_REVISION } = require('../.domain-build/domain/v6-world');
/** Controlled JSON-size fixture, not an import-valid geography fixture. The deliberate
 * padding isolates exact publication boundaries without generating another large world.
 * Real imported/exported v6 shape equality is covered in terrain6-domain-edit.roundtrip.
 */
function sizedState(length, version = 6) {
  const state = createGame(1000, 1, 1);
  state.terrainVersion = version;
  if (version === 6) {
    state.terrainRevision = V6_GENERATOR_REVISION;
    state.terrain6 = { format: 1, nextOperation: 1, cells: [] };
  }
  state.inventory.vegetable = 9;
  state.serializationBoundaryFixture = '';
  state.serializationBoundaryFixture = 'x'.repeat(length - serializedSaveLength(state));
  assert.equal(serializedSaveLength(state), length);
  return state;
}
function repad(state, length) {
  state.serializationBoundaryFixture = '';
  state.serializationBoundaryFixture = 'x'.repeat(length - serializedSaveLength(state));
  return state;
}
const buy = { type: 'buyCrop', item: 'vegetable', quantity: 1 };

test('save-size helper uses the exact existing JSON character boundary, including escaping', () => {
  for (const delta of [-1, 0, 1]) {
    const value = { value: 'x'.repeat(LIMIT - JSON.stringify({ value: '' }).length + delta) };
    assert.equal(serializedSaveLength(value), LIMIT + delta);
    if (delta <= 0) assert.doesNotThrow(() => assertSaveFits(value));
    else assert.throws(() => assertSaveFits(value), SaveSizeError);
  }
  const escaped = { value: '\n"中😀', ignored: undefined };
  assert.equal(serializedSaveLength(escaped), JSON.stringify(escaped).length);
});

test('every successful v6 dispatch branch checks the final snapshot before publishing it', () => {
  const below = sizedState(LIMIT - 2),
    equal = sizedState(LIMIT - 1),
    over = sizedState(LIMIT);
  for (const [state, expected] of [
    [below, LIMIT - 1],
    [equal, LIMIT],
  ]) {
    const result = dispatch(state, buy, 1001);
    assert.equal(result.ok, true, result.error);
    assert.equal(serializedSaveLength(result.state), expected);
    assert.equal(result.state.inventory.vegetable, 10);
  }
  const before = JSON.stringify(over),
    result = dispatch(over, buy, 1001);
  assert.equal(result.ok, false);
  assert.match(result.error, /存档大小上限/);
  assert.equal(result.state, over);
  assert.equal(JSON.stringify(over), before);
});

test('oversize v6 planting/material commands roll back IDs, jobs, inventory and discovery updates', () => {
  for (const command of [
    { type: 'plantCell', buildingId: 'b2', cell: 0, crop: 'vegetable' },
    { type: 'attachMaterial', buildingId: 'b1', item: 'soil', quantity: 1 },
  ]) {
    const state = sizedState(LIMIT);
    state.inventory.soil = 1.5;
    repad(state, LIMIT);
    const before = JSON.stringify(state),
      result = dispatch(state, command, 1001);
    assert.equal(result.ok, false);
    assert.match(result.error, /存档大小上限/);
    assert.equal(result.state, state);
    assert.equal(JSON.stringify(state), before);
  }
});

test('v6 GameSession rejects predictable size overflow before state, feedback or storage changes', () => {
  const state = sizedState(LIMIT),
    writes = [],
    storage = {
      getItem: () => null,
      setItem: (...args) => writes.push(args),
      removeItem: () => assert.fail('Unexpected delete'),
    };
  const session = new GameSession(
    storage,
    () => 1001,
    () => state,
  );
  let rewards = 0;
  session.setCollectionListener(() => rewards++);
  assert.equal(session.run(buy), false);
  assert.equal(session.state, state);
  assert.match(session.statusMessage, /存档大小上限/);
  assert.equal(session.hasUnsavedChanges, false);
  assert.equal(rewards, 0);
  assert.deepEqual(writes, []);
});

test('clock-only v6 growth preserves the valid original snapshot instead of declaring it corrupt', () => {
  const state = sizedState(LIMIT);
  state.lastSeenAt = 9999;
  repad(state, LIMIT);
  assert.equal(advance(state, 10000), state);
  assert.equal(state.lastSeenAt, 9999);
  assert.equal(serializedSaveLength(state), LIMIT);
  const normal = sizedState(LIMIT - 1);
  normal.lastSeenAt = 9999;
  repad(normal, LIMIT - 1);
  const next = advance(normal, 10000);
  assert.notEqual(next, normal);
  assert.equal(next.lastSeenAt, 10000);
  assert.equal(serializedSaveLength(next), LIMIT);
});

test('old-world dispatch and clock behavior are not given the new v6 gate', () => {
  for (const version of [1, 2, 3, 4, 5]) {
    const state = sizedState(LIMIT, version),
      result = dispatch(state, buy, 1001);
    assert.equal(result.ok, true, result.error);
    assert.equal(serializedSaveLength(result.state), LIMIT + 1);
    state.lastSeenAt = 9999;
    const next = advance(state, 10000);
    assert.notEqual(next, state);
    assert.equal(next.lastSeenAt, 10000);
  }
});
