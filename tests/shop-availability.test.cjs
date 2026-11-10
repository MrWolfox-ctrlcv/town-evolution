/** Real shop UI commands and domain rules; not a rendered Cocos/device test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
const { withLegacyBuildingAtFreeCell } = require('./helpers/legacy-town.cjs');
const { GameSession } = require('../.domain-build/application/GameSession.js');

const code = ts.transpileModule(
  fs.readFileSync('assets/scripts/presentation/CommercePanel.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', code)(
  (id) => {
    assert.ok(id.startsWith('../'), `Unexpected dependency: ${id}`);
    return require(`../.domain-build/${id.slice(3)}.js`);
  },
  loaded,
  loaded.exports,
);
const { commerceActions, commerceDescription } = loaded.exports;
const baseline = withLegacyBuildingAtFreeCell(game.createGame(0), 'shop');

function fixture(item, quantity = 1) {
  const state = structuredClone(baseline);
  const shop = state.buildings.find((building) => building.kind === 'shop');
  state.inventory = { ...emptyStock(), [item]: 4 };
  state.coins = 100;
  const session = new GameSession(
    { getItem: () => null, setItem() {}, removeItem() {} },
    () => 0,
    () => state,
  );
  const ui = { selected: shop.id, tradeItem: item, quantity };
  const commands = [];
  const actions = commerceActions(session, ui, {
    item() {},
    quantity() {},
    command: (command) => commands.push(command),
  });
  return { state, shop, session, ui, commands, actions };
}

test('only the four crops get shop purchase controls with existing prices and stock gates', () => {
  assert.deepEqual(game.CROP_KEYS, ['vegetable', 'wheat', 'lettuce', 'rice']);
  for (const item of game.ITEM_KEYS) {
    const f = fixture(item);
    const buys = f.actions.filter((action) => /^买/.test(action.text));
    assert.equal(buys.length, game.isCrop(item) ? 1 : 0, item);
    if (!game.isCrop(item)) continue;
    const buy = buys[0];
    assert.equal(buy.text, `买1 · ${game.COMMERCE.prices[item].buy}币`);
    buy.run();
    const command = {
      type: 'shopTrade',
      buildingId: f.shop.id,
      item,
      quantity: 1,
      side: 'buy',
    };
    assert.deepEqual(f.commands, [command]);
    const stock = f.state.commerce.shopStock[f.shop.id][item];
    assert.equal(buy.enabled, stock > 0, `${item} keeps its existing quota`);
    assert.match(commerceDescription(f.session, f.ui), new RegExp(`在售${stock} / 库存4`));
    const result = game.dispatch(f.state, command, 0);
    if (stock === 0) {
      assert.equal(result.ok, false);
      assert.equal(result.error, '商店存货不足');
      assert.equal(result.state, f.state);
    } else {
      assert.equal(result.ok, true, result.error);
      assert.equal(result.state.coins, f.state.coins - game.COMMERCE.prices[item].buy);
      assert.equal(result.state.inventory[item], 5);
      assert.equal(result.state.commerce.shopStock[f.shop.id][item], stock - 1);
    }
  }
});

test('tradable non-crops are sell-only and only cold legacy goods mention old stock', () => {
  for (const item of game.ITEM_KEYS.filter((item) => !game.isCrop(item))) {
    const f = fixture(item);
    const text = commerceDescription(f.session, f.ui);
    if (!game.isTradableItem(item)) {
      assert.match(text, /暂不可交易/);
      assert.equal(f.actions.length, 1);
      assert.equal(f.actions[0].enabled, false);
      continue;
    }
    assert.match(text, /仅可售出/);
    assert.match(text, /库存4/);
    assert.doesNotMatch(text, /在售/);
    assert.equal(/清理旧库存/.test(text), item === 'chilledVegetable');
    assert.equal(/冷藏/.test(text), item === 'chilledVegetable');
  }
});

test('all tradable goods retain selected sale quantities and prices without changing shop quotas', () => {
  for (const item of game.ITEM_KEYS.filter(game.isTradableItem))
    for (const quantity of [1, 4, 'all']) {
      const f = fixture(item, quantity);
      const amount = quantity === 'all' ? 4 : quantity;
      const sells = f.actions.filter((action) => /^卖/.test(action.text));
      assert.equal(sells.length, 1, item);
      assert.equal(sells[0].enabled, true);
      assert.equal(sells[0].text, `卖${amount} · +${amount * game.COMMERCE.prices[item].sell}币`);
      sells[0].run();
      assert.deepEqual(f.commands, [
        { type: 'shopTrade', buildingId: f.shop.id, item, quantity: amount, side: 'sell' },
      ]);
      const before = game.exportSave(f.state);
      const result = game.dispatch(f.state, f.commands[0], 0);
      assert.equal(result.ok, true, result.error);
      assert.equal(result.state.coins, f.state.coins + amount * game.COMMERCE.prices[item].sell);
      assert.equal(result.state.inventory[item], 4 - amount);
      assert.deepEqual(result.state.commerce, f.state.commerce);
      assert.equal(game.exportSave(f.state), before);
    }
});

test('illegal non-crop purchases preserve state and reserve cold-clearance rejection for legacy goods', () => {
  for (const item of game.ITEM_KEYS.filter((item) => !game.isCrop(item))) {
    const f = fixture(item);
    const before = game.exportSave(f.state);
    const result = game.dispatch(
      f.state,
      { type: 'shopTrade', buildingId: f.shop.id, item, quantity: 1, side: 'buy' },
      0,
    );
    assert.equal(result.ok, false, item);
    assert.equal(result.state, f.state, item);
    assert.equal(game.exportSave(f.state), before, item);
    if (item === 'chilledVegetable')
      assert.equal(result.error, '冷藏货物仅用于清理旧库存，不再出售新货');
    else {
      assert.doesNotMatch(result.error, /冷藏|旧库存/);
      if (game.isTradableItem(item)) assert.match(result.error, /仅可售出/);
    }
  }
});
