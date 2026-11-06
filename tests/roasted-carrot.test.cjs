const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock, initializeFacility } = require('../.domain-build/domain/commerce');
function town() {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.buildings.push({ id: 'b3', kind: 'stoneOven', x: 9, z: 5, rotation: 0 });
  s.nextId = 4;
  s.inventory = { ...emptyStock(), vegetable: 4 };
  return s;
}
function run(s, c, now = s.lastSeenAt) {
  const before = g.exportSave(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, true, r.error);
  assert.equal(g.exportSave(s), before);
  assert.deepEqual(g.importSave(g.exportSave(r.state), r.state.lastSeenAt), r.state);
  return r.state;
}
function reject(s, c, now = s.lastSeenAt) {
  const before = JSON.stringify(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
}
const start = { type: 'startProcessing', buildingId: 'b3', recipeId: 'roast-carrot' };
test('stone oven converts exactly two carrots into one roasted product without extra fuel', () => {
  let s = run(town(), start);
  const job = s.buildings[2].processingJob;
  assert.deepEqual(job.inputs, [{ item: 'vegetable', amount: 2 }]);
  assert.deepEqual(job.outputs, [{ item: 'roastedCarrot', amount: 1 }]);
  assert.equal(s.inventory.wood, 0);
  assert.equal(s.inventory.vegetable, 2);
  reject(s, start);
  const collect = { type: 'collectProcessing', buildingId: 'b3', jobId: job.id };
  reject(s, collect, job.readyAt - 1);
  s = run(s, collect, job.readyAt);
  assert.equal(s.inventory.roastedCarrot, 1);
  assert.equal(s.fusion.discoveries['roast-carrot'].count, 1);
  reject(s, collect);
});
test('wrong facility, short input, full warehouse and stale receipts preserve all assets', () => {
  const short = town();
  short.inventory.vegetable = 1;
  reject(short, start);
  const wrong = town();
  wrong.buildings[2].kind = 'bakery';
  reject(wrong, start);
  let s = run(town(), start);
  const job = s.buildings[2].processingJob;
  s.inventory.wood += g.getCapacity(s) - g.getUsedStorage(s);
  reject(s, { type: 'collectProcessing', buildingId: 'b3', jobId: job.id }, job.readyAt);
  reject(s, { type: 'collectProcessing', buildingId: 'b3', jobId: 'j999' }, job.readyAt);
  reject(s, { type: 'dragMerge', sourceId: 'b3', targetId: 'b1' });
});
test('saved roasting promises are independent from later balance edits', () => {
  let s = run(town(), start);
  const job = s.buildings[2].processingJob,
    recipe = g.PROCESSING_RECIPES['roast-carrot'];
  const before = structuredClone(recipe);
  try {
    recipe.outputs[0].amount = 3;
    recipe.durationMs = 25000;
    s = g.importSave(g.exportSave(s), job.readyAt + 500000);
    s = run(s, { type: 'collectProcessing', buildingId: 'b3', jobId: job.id });
    assert.equal(s.inventory.roastedCarrot, 1);
  } finally {
    Object.assign(recipe, before);
  }
});
test('roasted products trade as explicit new goods, with ordinary ground-stack limits', () => {
  let s = town();
  const shop = { id: 'b4', kind: 'shop', x: 11, z: 5, rotation: 0 };
  s.buildings.push(shop);
  s.nextId = 5;
  initializeFacility(s.commerce, shop);
  s.inventory.roastedCarrot = 3;
  s = run(s, { type: 'dropProduct', item: 'roastedCarrot', quantity: 2, x: 10, z: 5 });
  assert.equal(s.groundStacks[0].amount, 2);
  assert.equal(g.isGroundTradeItem('roastedCarrot'), true);
  s = run(s, { type: 'pickupStack', x: 10, z: 5 });
  assert.equal(s.inventory.roastedCarrot, 3);
  const before = s.coins;
  s = run(s, {
    type: 'shopTrade',
    buildingId: 'b4',
    side: 'sell',
    item: 'roastedCarrot',
    quantity: 2,
  });
  assert.equal(s.inventory.roastedCarrot, 1);
  assert.equal(s.coins, before + 2 * g.COMMERCE.prices.roastedCarrot.sell);
});
