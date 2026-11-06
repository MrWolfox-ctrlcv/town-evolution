const { hammerAssemblyCommand } = require('./helpers/hammer-assembly.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  createDemoGame,
  dispatch,
  importSave,
  exportSave,
  TOOL_IDS,
  ACTIVE_TOOLS,
  UNLIMITED_TOOL_DURABILITY,
  hasUnlimitedDurability,
} = require('../.domain-build/domain/game.js');
const { MAX_VALUE } = require('../.domain-build/domain/config.js');
function run(state, command, now = state.lastSeenAt) {
  const before = exportSave(state);
  const result = dispatch(state, command, now);
  assert.equal(result.ok, true, result.error);
  assert.equal(exportSave(state), before);
  assert.deepEqual(importSave(exportSave(result.state), now), result.state);
  return result.state;
}
function rejects(state, command) {
  const before = exportSave(state);
  const result = dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(exportSave(state), before);
}
test('temporary unlimited policy covers durable tools but never fertilizer quantity', () => {
  assert.equal(UNLIMITED_TOOL_DURABILITY, true);
  for (const tool of TOOL_IDS) assert.equal(hasUnlimitedDurability(tool), tool !== 'fertilizer');
});
test('all active tools work at saved zero, one and maximum durability without rewriting resources', () => {
  for (const durability of [0, 1, MAX_VALUE]) {
    let state = createDemoGame(60000);
    for (const tool of ACTIVE_TOOLS) state.tools[tool] = durability;
    state.tools.fertilizer = 3;
    const tools = { ...state.tools };
    const recovery = { ...state.toolRecoveryAvailable };
    state = importSave(exportSave(state), state.lastSeenAt);
    state = run(state, { type: 'harvestCell', buildingId: 'b2', cell: 0 });
    state = run(state, { type: 'useTool', tool: 'axe', treeId: state.trees[0].id });
    const pile = state.groundStacks.find((item) => item.item === 'wood' && item.amount === 4);
    state = run(state, { type: 'useTool', tool: 'hammer', x: pile.x, z: pile.z });
    const houseId = state.buildings.at(-1).id;
    const cratePile = state.groundStacks.find((item) => item.item === 'wood' && item.amount === 2);
    state = run(state, { type: 'useTool', tool: 'hammer', x: cratePile.x, z: cratePile.z });
    const crateId = state.buildings.at(-1).id;
    state = run(state, hammerAssemblyCommand(state, [crateId, houseId]));
    const buildingId = houseId;
    state = run(state, { type: 'attachMaterial', buildingId, item: 'wood', quantity: 2 });
    state = run(state, { type: 'useTool', tool: 'hammer', buildingId });
    assert.equal(state.buildings.find((b) => b.id === buildingId).kind, 'expandedWarehouse');
    const cartPile = state.groundStacks.find((item) => item.item === 'wood' && item.amount === 1);
    state = run(state, {
      type: 'dropProduct',
      item: 'wood',
      quantity: 2,
      x: cartPile.x,
      z: cartPile.z,
    });
    state = run(state, { type: 'useTool', tool: 'saw', x: cartPile.x, z: cartPile.z });
    assert.equal(state.buildings.at(-1).kind, 'handcart');
    assert.deepEqual(state.tools, tools);
    assert.deepEqual(state.toolRecoveryAvailable, recovery);
    rejects(state, { type: 'harvestCell', buildingId: 'b2', cell: 0 });
    rejects(state, { type: 'useTool', tool: 'hammer', buildingId });
  }
});
test('unnecessary tool purchases and recovery reject atomically for rich and poor old saves', () => {
  for (const coins of [0, 9, 10, 120]) {
    const state = createGame(0);
    state.coins = coins;
    for (const tool of TOOL_IDS) {
      state.tools[tool] = 0;
      state.toolRecoveryAvailable[tool] = true;
    }
    for (const tool of TOOL_IDS) {
      rejects(state, { type: 'buyTool', tool });
      rejects(state, { type: 'recoverTool', tool });
    }
  }
});
test('unlimited durability does not activate watering or fertilizer recipes', () => {
  const state = createGame(0);
  for (const tool of ['wateringCan', 'fertilizer'])
    rejects(state, { type: 'useTool', tool, x: 2, z: 5 });
  assert.equal(state.tools.fertilizer, 5);
});
test('finite current-save counters and recovery flags roundtrip exactly including exhausted tools', () => {
  const state = createGame(0);
  TOOL_IDS.forEach((tool, index) => {
    state.tools[tool] = index % 2 ? MAX_VALUE : 0;
    state.toolRecoveryAvailable[tool] = index % 2 === 0;
  });
  for (let i = 0; i < 5; i++) assert.deepEqual(importSave(exportSave(state), 0), state);
  assert.equal(exportSave(state).includes('Infinity'), false);
});
test('infinite-policy saves still reject invalid numeric fields instead of resetting or coercing', () => {
  for (const tool of TOOL_IDS)
    for (const value of [-1, 0.5, MAX_VALUE + 1, null, '∞', 'Infinity']) {
      const state = createGame(0);
      state.tools[tool] = value;
      const raw = JSON.stringify(state);
      assert.throws(() => importSave(raw, 0), `${tool}: ${value}`);
      assert.equal(JSON.stringify(state), raw);
    }
});
