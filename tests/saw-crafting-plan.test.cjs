const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../.domain-build/domain/game.js');
const { validatePlacement } = require('../.domain-build/domain/geometry.js');

function fixture(amount = 4, x = 10, z = 7) {
  const state = game.createGame(100, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.groundStacks = [{ x, z, item: 'wood', amount }];
  return state;
}
function block(state, kind, x, z) {
  if (kind === 'tree') state.trees.push({ id: `t${state.nextTreeId++}`, x, z });
  if (kind === 'natural')
    state.naturalResources.push({ id: `rock-${x}-${z}`, kind: 'stone', amount: 2, x, z });
  if (kind === 'pile') state.groundStacks.push({ item: 'stone', amount: 1, x, z });
  if (kind === 'building')
    state.buildings.push({ id: `b${state.nextId++}`, kind: 'crate', rotation: 0, x, z });
}
function craft(state, x = 10, z = 7, tool = 'hammer') {
  const before = game.exportSave(state);
  const plan = game.toolCraftPlan(state, tool, x, z);
  assert.equal(plan.reason, null);
  assert.equal(game.exportSave(state), before, 'Planning is pure');
  const result = game.dispatch(state, { type: 'useTool', tool, x, z }, 100);
  assert.equal(result.ok, true, result.error);
  assert.equal(game.exportSave(state), before, 'Commit never mutates input');
  assert.deepEqual(result.state.buildings.at(-1), plan.building);
  assert.deepEqual(game.importSave(game.exportSave(result.state), 100), result.state);
  return result.state;
}

test('all recipes preserve an already legal origin, and repeated planning consumes nothing', () => {
  for (const [tool, amount, kind, width, depth] of [
    ['hammer', 1, 'orderBoard', 1, 1],
    ['hammer', 2, 'crate', 1, 1],
    ['saw', 3, 'handcart', 1, 1],
    ['saw', 4, 'boat', 1, 2],
    ['hammer', 3, 'woodenPier', 2, 2],
    ['hammer', 4, 'house', 2, 2],
  ]) {
    const state = fixture(amount);
    const before = game.exportSave(state);
    for (let i = 0; i < 10; i++) {
      const plan = game.toolCraftPlan(state, tool, 10, 7);
      assert.deepEqual(
        [plan.building.x, plan.building.z, plan.width, plan.depth],
        [10, 7, width, depth],
      );
      assert.equal(plan.building.kind, kind);
      if (tool === 'saw') assert.deepEqual(game.sawCraftPlan(state, 10, 7), plan);
    }
    assert.equal(game.exportSave(state), before);
    const after = craft(state, 10, 7, tool);
    assert.equal(after.nextId, state.nextId + 1);
    assert.deepEqual(after.tools, state.tools);
    assert.deepEqual(after.inventory, state.inventory);
  }
});

test('house selects each containing alternate anchor deterministically and records its discovery once', () => {
  for (const [blocks, expected] of [
    [[[11, 7]], [9, 7]],
    [[[10, 8]], [10, 6]],
    [
      [
        [11, 7],
        [10, 8],
      ],
      [9, 6],
    ],
  ]) {
    const state = fixture();
    for (const [x, z] of blocks) block(state, 'tree', x, z);
    const plan = game.toolCraftPlan(state, 'hammer', 10, 7);
    assert.deepEqual([plan.building.x, plan.building.z], expected);
    const after = craft(state);
    assert.equal(after.fusion.discoveries['build-house'].count, 1);
    assert.equal(after.fusion.discoveries['build-house'].firstDiscoveredAt, 100);
    assert.deepEqual(after.trees, state.trees, 'Placement never clears the obstacles');
    const duplicate = game.dispatch(after, { type: 'useTool', tool: 'hammer', x: 10, z: 7 }, 100);
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.state, after);
    assert.equal(after.fusion.discoveries['build-house'].count, 1);
  }
});

test('trees, natural resources, other piles and buildings are never ignored by alternate placement', () => {
  for (const kind of ['tree', 'natural', 'pile', 'building']) {
    const state = fixture();
    // Every containing 2x2 candidate intersects one of these cardinal blockers.
    for (const [x, z] of [
      [9, 7],
      [11, 7],
      [10, 6],
      [10, 8],
    ])
      block(state, kind, x, z);
    // Synthetic cardinal blockers isolate placement; successful fixtures above
    // separately verify valid-save round trips. Natural resources are seed-bound.
    const before = JSON.stringify(state);
    const plan = game.toolCraftPlan(state, 'hammer', 10, 7);
    assert.ok(plan.reason);
    assert.deepEqual([plan.building.x, plan.building.z, plan.width, plan.depth], [10, 7, 2, 2]);
    const result = game.dispatch(state, { type: 'useTool', tool: 'hammer', x: 10, z: 7 }, 100);
    assert.equal(result.ok, false);
    assert.equal(result.state, state);
    assert.equal(
      JSON.stringify(state),
      before,
      'Failed placement changes no stock, ID, tools, discovery or save state',
    );
    assert.equal(state.groundStacks[0].amount, 4);
  }
});

test('coastal houses only choose fully dry containing footprints, never an unrelated free location', () => {
  let successes = 0;
  let failures = 0;
  for (let z = 0; z < game.CONFIG.gridSize; z++)
    for (let x = 0; x < game.CONFIG.gridSize; x++) {
      const state = fixture(4, x, z);
      if (!game.isLandCell(x, z, state.mapSeed, state.terrainVersion, state.landExtensions))
        continue;
      if (
        state.buildings.some(
          (b) =>
            x >= b.x &&
            x < b.x + game.footprint(b).width &&
            z >= b.z &&
            z < b.z + game.footprint(b).depth,
        )
      )
        continue;
      const plan = game.toolCraftPlan(state, 'hammer', x, z);
      if (plan.reason) {
        failures++;
        const result = game.dispatch(state, { type: 'useTool', tool: 'hammer', x, z }, 100);
        assert.equal(result.ok, false);
        assert.equal(result.state, state);
        continue;
      }
      successes++;
      const b = plan.building;
      assert.ok(x >= b.x && x < b.x + 2 && z >= b.z && z < b.z + 2);
      assert.doesNotThrow(() => validatePlacement({ ...state, groundStacks: [] }, b));
      assert.ok(
        b.x >= 0 && b.z >= 0 && b.x + 2 <= game.CONFIG.gridSize && b.z + 2 <= game.CONFIG.gridSize,
      );
      for (let dx = 0; dx < 2; dx++)
        for (let dz = 0; dz < 2; dz++)
          assert.equal(
            game.isLandCell(
              b.x + dx,
              b.z + dz,
              state.mapSeed,
              state.terrainVersion,
              state.landExtensions,
            ),
            true,
          );
      const original = { ...b, x, z };
      let originalValid = true;
      try {
        validatePlacement({ ...state, groundStacks: [] }, original);
      } catch {
        originalValid = false;
      }
      if (originalValid) assert.deepEqual(b, original, 'Legal original position has priority');
      else {
        const after = craft(state, x, z);
        assert.equal(after.fusion.discoveries['build-house'].count, 1);
      }
    }
  assert.ok(successes > 0);
  assert.ok(failures > 0);
});

test('invalid inputs, unknown quantities, water and map-edge failures do not spend or invent a recipe', () => {
  for (const [x, z, amount] of [
    [-1, 7, 4],
    [40, 7, 4],
    [0.5, 7, 4],
    [NaN, 7, 4],
    [10, 7, 5],
    [0, 0, 4],
    [39, 39, 4],
  ]) {
    const state = fixture(amount, x, z);
    const before = JSON.stringify(state);
    const plan = game.toolCraftPlan(state, 'hammer', x, z);
    assert.ok(plan.reason);
    const result = game.dispatch(state, { type: 'useTool', tool: 'hammer', x, z }, 100);
    assert.equal(result.ok, false);
    assert.equal(result.state, state);
    assert.equal(JSON.stringify(state), before);
  }
});

test('planning preserves the final recovery tile and does not allocate an exhausted building ID', () => {
  const state = fixture();
  const footprint = { x: 10, z: 7, width: 2, depth: 2 };
  for (let z = 0; z < game.CONFIG.gridSize; z++)
    for (let x = 0; x < game.CONFIG.gridSize; x++) {
      if (!game.isLandCell(x, z, state.mapSeed, state.terrainVersion, state.landExtensions))
        continue;
      if (x >= footprint.x && x < footprint.x + 2 && z >= footprint.z && z < footprint.z + 2)
        continue;
      if (
        state.buildings.some(
          (b) =>
            x >= b.x &&
            x < b.x + game.footprint(b).width &&
            z >= b.z &&
            z < b.z + game.footprint(b).depth,
        )
      )
        continue;
      state.groundStacks.push({ item: 'wood', amount: 1, x, z });
    }
  const before = game.exportSave(state);
  assert.equal(game.toolCraftPlan(state, 'hammer', 10, 7).reason, '请保留一格空地，避免占满小岛');
  assert.equal(
    game.dispatch(state, { type: 'useTool', tool: 'hammer', x: 10, z: 7 }, 100).ok,
    false,
  );
  assert.equal(game.exportSave(state), before);
  const exhausted = fixture();
  exhausted.nextId = require('../.domain-build/domain/config.js').MAX_VALUE;
  const snapshot = JSON.stringify(exhausted);
  assert.equal(game.toolCraftPlan(exhausted, 'hammer', 10, 7).reason, '编号达到上限');
  assert.equal(
    game.dispatch(exhausted, { type: 'useTool', tool: 'hammer', x: 10, z: 7 }, 100).ok,
    false,
  );
  assert.equal(JSON.stringify(exhausted), snapshot);
});
