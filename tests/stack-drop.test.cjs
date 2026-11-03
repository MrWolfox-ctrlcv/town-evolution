const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  stackDropCommand,
  stackDropHint,
  stackDropMarker,
} = require('../.domain-build/application/StackDrop.js');
const { createDemoGame } = require('../.domain-build/domain/game.js');
const source = { x: 6, z: 7 };
test('right products recover whole pile while blocked overlays never create a command', () => {
  assert.deepEqual(stackDropCommand(source, { kind: 'products' }), {
    type: 'pickupStack',
    x: 6,
    z: 7,
  });
  assert.equal(stackDropCommand(source, { kind: 'blocked' }), null);
});
test('only storage building targets route recovery and marker uses real rotated footprint', () => {
  const state = createDemoGame(60000);
  for (const kind of ['warehouse', 'expandedWarehouse', 'coldWarehouse', 'shop', 'farm', 'dock']) {
    const building = { ...state.buildings[0], kind, rotation: 1 };
    const command = stackDropCommand(source, { kind: 'building', building });
    if (['warehouse', 'expandedWarehouse', 'coldWarehouse'].includes(kind)) {
      assert.deepEqual(command, { type: 'pickupStack', x: 6, z: 7, warehouseId: building.id });
      state.buildings[0] = building;
      assert.ok(stackDropMarker(state, command));
    } else assert.equal(command, null);
  }
});
test('merge preview describes overflow left at source, not a failed or destructive move', () => {
  const state = createDemoGame(60000);
  state.groundStacks = [
    { ...source, item: 'wood', amount: 4 },
    { x: 8, z: 7, item: 'wood', amount: 3 },
  ];
  const command = stackDropCommand(source, { kind: 'ground', x: 8, z: 7 });
  assert.deepEqual(command, { type: 'moveStack', fromX: 6, fromZ: 7, x: 8, z: 7 });
  assert.equal(stackDropHint(state, command), '合并2份 · 余下留原地');
  state.groundStacks[0].amount = 1;
  assert.equal(stackDropHint(state, command), '松手合并1份');
});
