const { looseAmount, pickupDrops } = require('./helpers/loose-output.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { cropSupportsField } = require('../.domain-build/domain/crops');
const { emptyStock, initializeFacility } = require('../.domain-build/domain/commerce');
const { PROCESSING_RECIPES } = require('../.domain-build/domain/processing');

function town() {
  const state = g.createGame(100000, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  return state;
}
function accept(state, command, now = state.lastSeenAt) {
  const before = JSON.stringify(state);
  const result = g.dispatch(state, command, now);
  assert.equal(result.ok, true, result.error);
  assert.equal(JSON.stringify(state), before, 'successful commands do not mutate their input');
  assert.deepEqual(g.importSave(g.exportSave(result.state), result.state.lastSeenAt), result.state);
  return result.state;
}
function reject(state, command, now = state.lastSeenAt, pattern) {
  const before = JSON.stringify(state);
  const result = g.dispatch(state, command, now);
  assert.equal(result.ok, false);
  if (pattern) assert.match(result.error, pattern);
  assert.equal(result.state, state);
  assert.equal(JSON.stringify(state), before, 'rejection is atomic, including IDs and discovery');
}
function craftStoneMill(state, amount = 2) {
  state = accept(state, { type: 'dropProduct', item: 'stone', quantity: amount, x: 11, z: 5 });
  return accept(state, { type: 'useTool', tool: 'hammer', x: 11, z: 5 });
}
function millPair() {
  let state = town();
  state.inventory.wood = 4;
  state.inventory.stone = 2;
  state = accept(state, { type: 'dropProduct', item: 'wood', quantity: 4, x: 8, z: 5 });
  state = accept(state, { type: 'useTool', tool: 'hammer', x: 8, z: 5 });
  const houseId = state.buildings.at(-1).id;
  state = craftStoneMill(state);
  return { state, houseId, stoneMillId: state.buildings.at(-1).id };
}
function millTown() {
  const pair = millPair();
  const state = accept(pair.state, {
    type: 'dragMerge',
    sourceId: pair.stoneMillId,
    targetId: pair.houseId,
  });
  return { state, millId: pair.houseId };
}
function processingFixture(recipeId = 'mill-rice') {
  const { state: initial, millId } = millTown();
  initial.inventory.rice = 4;
  initial.inventory.wheat = 4;
  const state = accept(initial, { type: 'startProcessing', buildingId: millId, recipeId });
  return { state, millId, job: state.buildings.find((b) => b.id === millId).processingJob };
}

for (const size of [3, 6])
  test(`rice plants only in ${size}x${size} water fields and yields two from one`, () => {
    let state = g.createDemoGame(100000);
    for (const item of g.ITEM_KEYS) state.inventory[item] = 0;
    state.inventory.rice = 2;
    const dry = state.buildings.find(
      (b) => b.kind === 'farm' && g.farmGridSize(b) === size && !b.irrigated,
    );
    const water = state.buildings.find(
      (b) => b.kind === 'farm' && g.farmGridSize(b) === size && b.irrigated,
    );
    dry.cropJobs.fill(null);
    water.cropJobs.fill(null);
    const cell = size * size - 1;
    assert.equal(cropSupportsField('rice', false), false);
    assert.equal(cropSupportsField('rice', true), true);
    reject(
      state,
      { type: 'plantCell', buildingId: dry.id, cell, crop: 'rice' },
      state.lastSeenAt,
      /水田/,
    );
    state = accept(state, { type: 'plantCell', buildingId: water.id, cell, crop: 'rice' });
    const job = state.buildings.find((b) => b.id === water.id).cropJobs[cell];
    assert.equal(state.inventory.rice, 1);
    assert.equal(job.crop, 'rice');
    assert.equal(job.yield, 2);
    assert.equal(job.readyAt - job.startedAt, g.CROPS.rice.durationMs);
    reject(state, { type: 'plantCell', buildingId: water.id, cell, crop: 'rice' });
    reject(state, { type: 'harvestCell', buildingId: water.id, cell }, job.readyAt - 1);
    state = accept(state, { type: 'harvestCell', buildingId: water.id, cell }, job.readyAt);
    assert.equal(state.inventory.rice, 1);
    assert.equal(looseAmount(state, 'rice'), 2);
    assert.equal(state.inventory.rice + looseAmount(state, 'rice'), 3);
    state = pickupDrops(state, (drop) => drop.item === 'rice');
    assert.equal(state.inventory.rice, 3);
    assert.equal(looseAmount(state, 'rice'), 0);
    reject(state, { type: 'harvestCell', buildingId: water.id, cell });
  });

test('rice can be bought and stacked to ten; flour and milled rice cannot be planted', () => {
  let state = town();
  const coins = state.coins;
  state = accept(state, { type: 'buyCrop', item: 'rice', quantity: 1 });
  assert.equal(state.coins, coins - g.CROPS.rice.buy);
  assert.equal(state.inventory.rice, 1);
  state.inventory.rice = 11;
  assert.equal(g.stackLimitFor('rice'), 10);
  state = accept(state, { type: 'dropProduct', item: 'rice', quantity: 10, x: 8, z: 5 });
  reject(state, { type: 'dropProduct', item: 'rice', x: 8, z: 5 });
  for (const crop of ['milledRice', 'flour']) {
    assert.equal(g.isCrop(crop), false);
    reject(state, { type: 'plantCell', buildingId: 'b2', cell: 0, crop });
  }
});

test('exactly two stone and a hammer craft a stone mill without spending coins or durable tools', () => {
  let state = town();
  state.inventory.stone = 2;
  state.tools.hammer = 0;
  const coins = state.coins;
  state = craftStoneMill(state);
  assert.equal(state.buildings.at(-1).kind, 'stoneMill');
  assert.equal(state.inventory.stone, 0);
  assert.equal(state.groundStacks.length, 0);
  assert.equal(state.tools.hammer, 0);
  assert.equal(state.coins, coins);
  assert.equal(state.fusion.discoveries['build-stone-mill'].count, 1);
  assert.equal(state.fusion.discoveries['expand-warehouse'], undefined);
  reject(state, { type: 'useTool', tool: 'hammer', x: 11, z: 5 });
});

test('wrong stone counts, wrong material and absent piles reject without changing stock', () => {
  for (const [item, amount] of [
    ['stone', 1],
    ['stone', 3],
    ['stone', 5],
    ['wood', 5],
    ['soil', 2],
  ]) {
    let state = town();
    state.inventory[item] = amount;
    state = accept(state, { type: 'dropProduct', item, quantity: amount, x: 11, z: 5 });
    reject(state, { type: 'useTool', tool: 'hammer', x: 11, z: 5 });
  }
  reject(town(), { type: 'useTool', tool: 'hammer', x: 11, z: 5 });
});

for (const reverse of [false, true])
  test(`stone mill merge ${reverse ? 'from house' : 'onto house'} keeps house identity and mounted stock`, () => {
    let { state, houseId, stoneMillId } = millPair();
    state.inventory.treeSeed = 2;
    state = accept(state, {
      type: 'attachMaterial',
      buildingId: houseId,
      item: 'treeSeed',
      quantity: 1,
    });
    state = accept(state, {
      type: 'attachMaterial',
      buildingId: stoneMillId,
      item: 'treeSeed',
      quantity: 1,
    });
    state = accept(state, { type: 'rotateBuilding', buildingId: houseId });
    const house = structuredClone(state.buildings.find((b) => b.id === houseId));
    const inventory = structuredClone(state.inventory);
    const coins = state.coins;
    const command = {
      type: 'dragMerge',
      sourceId: reverse ? houseId : stoneMillId,
      targetId: reverse ? stoneMillId : houseId,
    };
    state = accept(state, command);
    assert.deepEqual(
      state.buildings.find((b) => b.id === houseId),
      { ...house, kind: 'mill' },
    );
    assert.equal(
      state.buildings.some((b) => b.id === stoneMillId),
      false,
    );
    assert.equal(state.fusion.attachments[houseId].treeSeed, 2);
    assert.equal(state.fusion.attachments[stoneMillId], undefined);
    assert.deepEqual(state.inventory, inventory);
    assert.equal(state.coins, coins);
    assert.equal(
      state.commerce.shopStock[houseId],
      undefined,
      'mill never silently becomes a shop',
    );
    assert.equal(state.fusion.discoveries['build-mill'].count, 1);
    reject(state, command);
  });

for (const [recipeId, input, output] of [
  ['mill-rice', 'rice', 'milledRice'],
  ['mill-wheat', 'wheat', 'flour'],
])
  test(`${recipeId} consumes two raw goods and produces one promised output exactly once`, () => {
    const { state: initial, millId } = millTown();
    initial.inventory[input] = 4;
    let state = accept(initial, { type: 'startProcessing', buildingId: millId, recipeId });
    const job = state.buildings.find((b) => b.id === millId).processingJob;
    assert.equal(state.inventory[input], 2);
    assert.equal(state.inventory[output], 0);
    assert.deepEqual(job.inputs, [{ item: input, amount: 2 }]);
    assert.deepEqual(job.outputs, [{ item: output, amount: 1 }]);
    assert.equal(job.durationMs, 10000, 'explicit provisional first-version timing');
    assert.equal(job.readyAt - job.startedAt, job.durationMs);
    reject(state, { type: 'startProcessing', buildingId: millId, recipeId });
    const collect = { type: 'collectProcessing', buildingId: millId, jobId: job.id };
    reject(state, collect, job.readyAt - 1);
    state = accept(state, collect, job.readyAt);
    assert.equal(state.inventory[output], 1);
    assert.equal(state.buildings.find((b) => b.id === millId).processingJob, undefined);
    reject(state, collect);
    state = accept(state, { type: 'startProcessing', buildingId: millId, recipeId });
    reject(state, collect, state.buildings.find((b) => b.id === millId).processingJob.readyAt);
    assert.equal(state.inventory[output], 1, 'stale job ID cannot collect the replacement batch');
  });

test('processing rejects wrong facilities, missing inputs and unknown recipes atomically', () => {
  const { state, millId } = millTown();
  reject(state, { type: 'startProcessing', buildingId: millId, recipeId: 'mill-rice' });
  state.inventory.rice = 1;
  reject(state, { type: 'startProcessing', buildingId: millId, recipeId: 'mill-rice' });
  state.inventory.rice = 2;
  for (const buildingId of ['b1', 'b2', 'b999'])
    reject(state, { type: 'startProcessing', buildingId, recipeId: 'mill-rice' });
  reject(state, { type: 'startProcessing', buildingId: millId, recipeId: 'bake-bread' });
  reject(state, { type: 'startProcessing', buildingId: millId, recipeId: 'arbitrary-recipe' });
});

test('ready processing survives offline reload and a full warehouse without losing the output', () => {
  const { state: initial, millId, job } = processingFixture();
  let state = g.importSave(g.exportSave(initial), job.readyAt + 300000);
  assert.deepEqual(state.buildings.find((b) => b.id === millId).processingJob, job);
  state.inventory.wood += g.getCapacity(state) - g.getUsedStorage(state);
  const collect = { type: 'collectProcessing', buildingId: millId, jobId: job.id };
  reject(state, collect, state.lastSeenAt, /仓/);
  assert.equal(state.inventory.milledRice, 0);
  state.inventory.wood--;
  state = accept(state, collect);
  assert.equal(state.inventory.milledRice, 1);
  assert.equal(g.getUsedStorage(state), g.getCapacity(state));
});

test('successful commands deeply clone processing snapshots', () => {
  const { state, millId, job } = processingFixture();
  const next = accept(state, { type: 'rotateBuilding', buildingId: millId });
  const nextJob = next.buildings.find((b) => b.id === millId).processingJob;
  assert.notEqual(nextJob, job);
  assert.notEqual(nextJob.inputs, job.inputs);
  assert.notEqual(nextJob.outputs, job.outputs);
  assert.notEqual(nextJob.inputs[0], job.inputs[0]);
  assert.notEqual(nextJob.outputs[0], job.outputs[0]);
  nextJob.outputs[0].amount++;
  assert.equal(job.outputs[0].amount, 1);
});

test('saved milling promises survive later changes to provisional time and output balance', () => {
  const { state, millId, job } = processingFixture();
  const recipe = PROCESSING_RECIPES['mill-rice'];
  const old = structuredClone(recipe);
  try {
    recipe.durationMs = 30000;
    recipe.inputs[0].amount = 3;
    recipe.outputs[0].amount = 2;
    const restored = g.importSave(g.exportSave(state), job.readyAt);
    assert.deepEqual(restored.buildings.find((b) => b.id === millId).processingJob, job);
    const collected = accept(restored, {
      type: 'collectProcessing',
      buildingId: millId,
      jobId: job.id,
    });
    assert.equal(collected.inventory.milledRice, 1);
    assert.equal(
      collected.inventory.rice,
      state.inventory.rice,
      'collection never recharges input',
    );
  } finally {
    Object.assign(recipe, old);
  }
});

test('schema8 towns gain zero rice and processing goods while original stock and water-field jobs survive', () => {
  const state = town();
  state.inventory.wood = 2;
  state.fusion.attachments.b1 = { ...emptyStock(), stone: 1 };
  const shop = { id: `b${state.nextId++}`, kind: 'shop', x: 8, z: 5, rotation: 0 };
  state.buildings.push(shop);
  initializeFacility(state.commerce, shop);
  const farm = state.buildings.find((b) => b.id === 'b2');
  farm.irrigated = true;
  farm.cropJobs[0] = {
    id: `j${state.nextId++}`,
    startedAt: 100000,
    readyAt: 115000,
    crop: 'wheat',
    durationMs: 15000,
    yield: 3,
  };
  const raw = JSON.parse(g.exportSave(state));
  raw.schemaVersion = 8;
  const added = ['rice', 'milledRice', 'flour', 'bread', 'sapling', 'roastedCarrot'];
  for (const stock of [
    raw.inventory,
    ...Object.values(raw.fusion.attachments),
    ...Object.values(raw.commerce.shopStock),
  ])
    for (const key of added) delete stock[key];
  const restored = g.importSave(JSON.stringify(raw), 100000);
  assert.equal(restored.schemaVersion, 10);
  for (const key of added) assert.equal(restored.inventory[key], 0);
  assert.equal(restored.inventory.wood, 2);
  assert.equal(restored.fusion.attachments.b1.stone, 1);
  assert.equal(restored.commerce.shopStock[shop.id].rice, 0);
  assert.deepEqual(restored.buildings.find((b) => b.id === 'b2').cropJobs, farm.cropJobs);
});

test('processing saves reject malformed or misplaced snapshots rather than silently dropping jobs', () => {
  const { state, millId } = processingFixture();
  const text = g.exportSave(state);
  const mutations = [
    (job) => {
      job.recipeId = 'unknown';
    },
    (job) => {
      job.durationMs = -1;
    },
    (job) => {
      job.readyAt++;
    },
    (job) => {
      job.startedAt = state.lastSeenAt + 1;
    },
    (job) => {
      job.inputs[0].amount = 0;
    },
    (job) => {
      job.outputs[0].amount = -1;
    },
    (job) => {
      job.outputs[0].amount = '1';
    },
    (job) => {
      job.outputs[0].item = 'unknown';
    },
    (job) => {
      job.outputs = [];
    },
    (job) => {
      job.inputs.push({ ...job.inputs[0] });
    },
  ];
  for (const mutate of mutations) {
    const raw = JSON.parse(text);
    mutate(raw.buildings.find((b) => b.id === millId).processingJob);
    assert.throws(() => g.importSave(JSON.stringify(raw), state.lastSeenAt));
  }
  const raw = JSON.parse(text);
  raw.buildings.find((b) => b.id === millId).kind = 'house';
  assert.throws(() => g.importSave(JSON.stringify(raw), state.lastSeenAt));
});
