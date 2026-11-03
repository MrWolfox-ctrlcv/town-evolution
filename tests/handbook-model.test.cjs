const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('../.domain-build/domain/game.js');
const { RECIPE_DEFINITIONS } = require('../.domain-build/domain/recipes.js');
const {
  handbookEntry,
  handbookProgress,
} = require('../.domain-build/application/HandbookModel.js');
test('handbook uses recorded discoveries, not starting buildings or recipe availability', () => {
  const state = createGame(0);
  assert.equal(handbookProgress(state), 0);
  const recipe = RECIPE_DEFINITIONS.find((recipe) => recipe.id === 'build-warehouse');
  state.inventory.wood = 99;
  assert.equal(handbookEntry(state, recipe).discovered, false);
  state.fusion.discoveries[recipe.id] = { count: 3, firstDiscoveredAt: 0 };
  assert.equal(handbookEntry(state, recipe).count, 3);
  assert.equal(handbookProgress(state), 1);
});
test('handbook separates stock, ground and attached materials without mutating town', () => {
  const state = createGame(0);
  state.inventory.wood = 2;
  state.groundStacks.push({ item: 'wood', amount: 3, x: 1, z: 1 });
  state.fusion.attachments.b1 = { ...state.inventory, wood: 7 };
  const before = JSON.stringify(state);
  const recipe = RECIPE_DEFINITIONS.find((recipe) => recipe.id === 'build-warehouse');
  const material = handbookEntry(state, recipe).materials.find(
    (material) => material.kind === 'wood',
  );
  assert.equal(material.inventory, 2);
  assert.equal(material.ground, 3);
  assert.equal(material.attached, 7);
  assert.equal(material.available, 5);
  assert.equal(material.missing, Math.max(0, material.amount - 5));
  assert.equal(JSON.stringify(state), before);
});
test('expansion counts only the best single eligible warehouse attachment', () => {
  const state = createGame(0);
  const stock = { ...state.inventory, wood: 1 };
  state.fusion.attachments.b1 = stock;
  state.buildings.push({ id: 'other', kind: 'warehouse', x: 9, z: 9, rotation: 0 });
  state.fusion.attachments.other = { ...stock };
  state.fusion.attachments.b2 = { ...stock, wood: 5 };
  state.inventory.wood = 0;
  const recipe = RECIPE_DEFINITIONS.find((recipe) => recipe.id === 'expand-warehouse');
  const material = handbookEntry(state, recipe).materials.find(
    (material) => material.kind === 'wood',
  );
  assert.equal(material.targetAttached, 1);
  assert.equal(material.attachmentMissing, 1);
  assert.equal(material.missing, 1);
});
