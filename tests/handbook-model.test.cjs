const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  createDemoGame,
  dispatch,
  exportSave,
  importSave,
} = require('../.domain-build/domain/game.js');
const {
  RECIPE_DEFINITIONS,
  ACTIVE_RECIPE_DEFINITIONS,
} = require('../.domain-build/domain/recipes.js');
const {
  handbookEntry,
  handbookProgress,
  handbookView,
  HANDBOOK_PAGE_SIZE,
} = require('../.domain-build/application/HandbookModel.js');
test('handbook uses recorded discoveries, not starting buildings or recipe availability', () => {
  const state = createGame(0);
  assert.equal(handbookProgress(state), 0);
  const recipe = RECIPE_DEFINITIONS.find((recipe) => recipe.id === 'build-house');
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
  const recipe = RECIPE_DEFINITIONS.find((recipe) => recipe.id === 'build-house');
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

const activeIds = [
  'gather-wood',
  'build-order-board',
  'build-crate',
  'build-house',
  'build-warehouse',
  'build-shop',
  'expand-warehouse',
  'dig-farm',
  'merge-farms',
  'irrigate-farm',
  'gather-soil',
  'gather-stone',
  'water-soil',
  'expand-land',
  'build-residence',
  'build-fence',
  'build-bench',
  'build-wooden-bridge',
  'build-compost-barrel',
  'make-fertilizer',
  'roast-carrot',
  'attach-farm-box',
  'build-nursery',
  'grow-sapling',
  'plant-sapling',
  'grow-rice',
  'build-stone-mill',
  'build-mill',
  'mill-rice',
  'mill-wheat',
  'build-stone-oven',
  'build-bakery',
  'bake-bread',
  'build-handcart',
  'build-transport-warehouse',
  'build-wooden-pier',
  'build-dock',
  'build-boat',
];

test('active handbook keeps every open recipe and excludes only the legacy cold recipe', () => {
  assert.deepEqual(
    ACTIVE_RECIPE_DEFINITIONS.map((recipe) => recipe.id),
    activeIds,
  );
  assert.equal(
    new Set(RECIPE_DEFINITIONS.map((recipe) => recipe.id)).size,
    RECIPE_DEFINITIONS.length,
  );
  assert.deepEqual(
    RECIPE_DEFINITIONS.filter((recipe) => recipe.availability === 'legacy').map(
      (recipe) => recipe.id,
    ),
    ['merge-cold'],
  );
  for (const state of [createGame(100), createDemoGame(100)]) {
    const before = exportSave(state);
    const view = handbookView(state);
    assert.deepEqual(
      view.entries.map((entry) => entry.recipe.id),
      activeIds,
    );
    assert.equal(view.entries.length, 38);
    assert.equal(view.progress, 0, 'starting resources and buildings do not discover recipes');
    assert.equal(exportSave(state), before);
  }
});

test('directory and detail navigation wrap within the same active catalog, including the partially filled last page', () => {
  const state = createGame(100);
  const before = exportSave(state);
  assert.equal(HANDBOOK_PAGE_SIZE, 4);
  const expectedPages = [
    activeIds.slice(0, 4),
    activeIds.slice(4, 8),
    activeIds.slice(8, 12),
    activeIds.slice(12, 16),
    activeIds.slice(16, 20),
    activeIds.slice(20, 24),
    activeIds.slice(24, 28),
    activeIds.slice(28, 32),
    activeIds.slice(32, 36),
    activeIds.slice(36),
  ];
  for (let page = -10; page <= 10; page++) {
    const view = handbookView(state, 0, page);
    const expectedPage = ((page % 10) + 10) % 10;
    assert.equal(view.directoryPageCount, 10);
    assert.equal(view.directoryPage, expectedPage);
    assert.deepEqual(
      view.directoryEntries.map((entry) => entry.recipe.id),
      expectedPages[expectedPage],
    );
    for (const [row, entry] of view.directoryEntries.entries()) {
      const opened = handbookView(state, view.directoryPage * HANDBOOK_PAGE_SIZE + row, page);
      assert.equal(
        opened.detail.recipe.id,
        entry.recipe.id,
        'directory selection opens matching detail',
      );
    }
  }
  for (let selection = -64; selection <= 64; selection++) {
    const view = handbookView(state, selection);
    assert.equal(view.selected, ((selection % 38) + 38) % 38);
    assert.equal(view.detail.recipe.id, activeIds[view.selected]);
    assert.notEqual(view.detail.recipe.id, 'merge-cold');
  }
  assert.equal(exportSave(state), before, 'repeated navigation never changes save data');
});

test('legacy discoveries survive import and export but never add handbook rows or progress', () => {
  const state = createGame(100);
  state.fusion.discoveries['merge-cold'] = { count: 7, firstDiscoveredAt: 25 };
  let restored = importSave(exportSave(state), 100);
  assert.deepEqual(restored, state);
  const legacy = RECIPE_DEFINITIONS.find((recipe) => recipe.id === 'merge-cold');
  assert.equal(
    handbookEntry(restored, legacy).count,
    7,
    'full registry still exposes the saved record',
  );
  assert.equal(handbookProgress(restored), 0);
  assert.equal(handbookView(restored).progress, 0);
  for (const id of activeIds) restored.fusion.discoveries[id] = { count: 2, firstDiscoveredAt: 50 };
  restored = importSave(exportSave(restored), 100);
  const before = exportSave(restored);
  const view = handbookView(restored);
  assert.equal(
    view.progress,
    view.entries.length,
    'all current recipes reach 38 / 38, excluding the retained legacy record',
  );
  assert.equal(view.progress, 38);
  assert.ok(view.entries.every((entry) => entry.discovered && entry.count === 2));
  assert.deepEqual(restored.fusion.discoveries['merge-cold'], { count: 7, firstDiscoveredAt: 25 });
  assert.equal(exportSave(restored), before);
});

test('active discoveries still unlock and announce once when a town already has legacy records', () => {
  const initial = createGame(100);
  initial.fusion.discoveries['merge-cold'] = { count: 7, firstDiscoveredAt: 25 };
  let state = importSave(exportSave(initial), 100);
  const initialSave = exportSave(state);
  const treeIds = state.trees.slice(0, 2).map((tree) => tree.id);
  assert.equal(treeIds.length, 2);
  for (const [index, treeId] of treeIds.entries()) {
    const result = dispatch(state, { type: 'useTool', tool: 'axe', treeId }, 200 + index);
    assert.equal(result.ok, true, result.error);
    assert.equal(
      result.events.filter((event) => event.startsWith('图鉴新发现')).length,
      index === 0 ? 1 : 0,
    );
    state = result.state;
    const view = handbookView(state);
    assert.equal(view.progress, 1, 'repeat crafts count one distinct active discovery');
    assert.equal(view.entries.filter((entry) => entry.discovered).length, 1);
    assert.equal(view.detail.recipe.id, 'gather-wood');
    assert.equal(view.detail.count, index + 1);
    assert.deepEqual(state.fusion.discoveries['merge-cold'], {
      count: 7,
      firstDiscoveredAt: 25,
    });
    const beforeFailure = exportSave(state);
    const failed = dispatch(state, { type: 'useTool', tool: 'axe', treeId }, 200 + index);
    assert.equal(failed.ok, false);
    assert.equal(failed.state, state);
    assert.equal(exportSave(state), beforeFailure);
  }
  assert.equal(exportSave(initial), initialSave, 'commands never mutate the original snapshot');
  assert.deepEqual(state.fusion.discoveries['gather-wood'], {
    count: 2,
    firstDiscoveredAt: 200,
  });
  const restored = importSave(exportSave(state), 201);
  assert.deepEqual(handbookView(restored), handbookView(state));
});

test('hidden legacy records remain strictly validated instead of being silently dropped', () => {
  for (const discovery of [
    null,
    [],
    { count: 0, firstDiscoveredAt: 0 },
    { count: -1, firstDiscoveredAt: 0 },
    { count: 1.5, firstDiscoveredAt: 0 },
    { count: 1_000_000_001, firstDiscoveredAt: 0 },
    { count: 1, firstDiscoveredAt: -1 },
    { count: 1, firstDiscoveredAt: 101 },
    { count: 1, firstDiscoveredAt: 0.5 },
    { count: 1 },
  ]) {
    const raw = JSON.parse(exportSave(createGame(100)));
    raw.fusion.discoveries['merge-cold'] = discovery;
    const text = JSON.stringify(raw);
    assert.throws(() => importSave(text, 100), 'legacy is hidden from the UI, not from validation');
    assert.equal(JSON.stringify(raw), text, 'rejected input remains untouched');
  }
});
