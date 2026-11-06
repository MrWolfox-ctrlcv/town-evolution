/** Real presentation routing and domain transitions, using CPU Cocos collaborators, not GPU QA. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { createCompostState } = require('../.domain-build/domain/compost');
const { GameSession } = require('../.domain-build/application/GameSession');
const { stackDropCommand } = require('../.domain-build/application/StackDrop');
const { buildingAssetId } = require('../.domain-build/art/BuildingAssets');
const { handbookEntry } = require('../.domain-build/application/HandbookModel');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { load } = require('./helpers/selection-ui.cjs');
const { presentation, SceneNode } = require('./helpers/demo-campaign-scene.cjs');
const { StockDrag } = presentation('StockDrag');
const { DropDrag } = presentation('DropDrag');
const { StackDrag } = presentation('StackDrag');
const { productionActions } = load('RouteActions');
const { compostDescription } = load('CompostControls');
const { singleHammerResult } = load('SingleHammerPreview');
const { createUiState } = load('UiContracts');
function fixture() {
  let now = Date.now();
  const state = g.createDemoGame(now),
    barrel = state.buildings.find((b) => b.kind === 'compostBarrel');
  barrel.compost = createCompostState();
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    };
  const session = new GameSession(
      storage,
      () => now,
      () => state,
    ),
    commands = [],
    events = [];
  const run = session.run.bind(session);
  session.run = (c) => {
    commands.push(c);
    return run(c);
  };
  session.setCollectionListener((e) => events.push(e));
  const ui = createUiState(),
    parent = new SceneNode('World');
  const town = {
    pickBuilding: (r) => r.buildingId ?? null,
    pickDrop: (r) => r.dropId ?? null,
    pickStack: (r) => r.pile ?? null,
    pickTree: () => null,
    pickNatural: () => null,
    setLiftedDrop() {},
    setLiftedStack() {},
    dropOrigin: () => ({ x: 10.5, y: 0.3, z: 10.5 }),
  };
  const map = {
    contains: (p) => p.outside !== true,
    screenRay: (p) => p,
    ground: () => ({ x: 10.5, z: 10.5 }),
    cancelGesture() {},
  };
  const products = { acceptsProductDrop: () => false, highlightProductDrop() {} };
  const handlers = { command: (c) => session.run(c), quantity() {} };
  return {
    session,
    commands,
    events,
    values,
    barrelId: barrel.id,
    ui,
    parent,
    town,
    map,
    products,
    handlers,
    barrel: () => session.state.buildings.find((b) => b.id === barrel.id),
    advance: (ms) => (now += ms),
    stock: new StockDrag(parent, session, map, town, () => {}),
    drop: new DropDrag(parent, session, ui, town, () => {}, products),
    stack: new StackDrag(parent, session, ui, town, () => {}, products),
    persist() {
      assert.deepEqual(g.importSave(g.exportSave(session.state), now), session.state);
    },
  };
}
function ray(x, z, extra = {}) {
  return { o: { x, y: 20, z }, d: { x: 0, y: -1, z: 0 }, ...extra };
}
test('inventory chip deposits one explicit unit from its starting snapshot, never during preview or twice', () => {
  const f = fixture();
  f.session.state.inventory.treeSeed = 3;
  const at = { buildingId: f.barrelId };
  f.stock.begin('treeSeed', 1);
  const before = g.exportSave(f.session.state);
  f.stock.move(1, at);
  assert.equal(g.exportSave(f.session.state), before);
  assert.equal(f.commands.length, 0);
  f.stock.end(1, at);
  assert.deepEqual(f.commands[0], {
    type: 'depositCompost',
    buildingId: f.barrelId,
    quantity: 1,
    source: { type: 'inventory', item: 'treeSeed', amount: 3 },
  });
  assert.equal(f.barrel().compost.stock.treeSeed, 1);
  assert.equal(f.session.state.inventory.treeSeed, 2);
  assert.equal(f.events.length, 0);
  const saved = g.exportSave(f.session.state);
  f.stock.end(1, at);
  assert.equal(g.exportSave(f.session.state), saved);
  f.persist();
});
test('inventory drag cancels, rejects changed/restored snapshots, unsupported ingredients and full barrel atomically', () => {
  const f = fixture();
  f.session.state.inventory.treeSeed = 3;
  const at = { buildingId: f.barrelId };
  f.stock.begin('treeSeed', 1);
  f.stock.cancel(true);
  f.stock.end(1, at);
  assert.equal(f.commands.length, 0);
  f.stock.begin('treeSeed', 2);
  f.session.state.inventory.treeSeed = 2;
  f.stock.move(2, at);
  f.session.state.inventory.treeSeed = 3;
  f.stock.end(2, at);
  assert.equal(f.commands.length, 0);
  for (const item of ['sapling', 'roastedCarrot', 'wood']) {
    f.stock.begin(item, 3);
    const before = g.exportSave(f.session.state);
    f.stock.move(3, at);
    f.stock.end(3, at);
    assert.equal(g.exportSave(f.session.state), before);
  }
  f.barrel().compost.stock.treeSeed = 16;
  f.stock.begin('treeSeed', 4);
  const before = g.exportSave(f.session.state);
  f.stock.move(4, at);
  assert.match(f.session.message, /满|容量|空间/);
  f.stock.end(4, at);
  assert.equal(g.exportSave(f.session.state), before);
  f.persist();
});
for (const source of ['ground', 'drop'])
  test(`${source} long drag deposits its exact whole source without touching town inventory`, () => {
    const f = fixture(),
      at = ray(18, 17, { buildingId: f.barrelId });
    let key, expected;
    if (source === 'ground') {
      const pile = f.session.state.groundStacks.find((p) => p.item === 'vegetable');
      expected = { type: 'ground', stack: { ...pile } };
      key = f.stack.candidate(
        ray(pile.x + 0.5, pile.z + 0.5, {
          pile: { id: `pile:${pile.x}:${pile.z}`, x: pile.x, z: pile.z },
        }),
      );
    } else {
      const drop = f.session.state.looseDrops[0];
      expected = {
        type: 'drop',
        drop: { id: drop.id, item: drop.item, amount: drop.amount, x6: drop.x6, z6: drop.z6 },
      };
      key = f.drop.candidate(ray(drop.x6 / 6, drop.z6 / 6, { dropId: drop.id }));
    }
    assert.ok(key);
    const drag = f[source === 'ground' ? 'stack' : 'drop'];
    const before = g.exportSave(f.session.state),
      stock = { ...f.session.state.inventory };
    drag.move(key, { x: 18, y: 0, z: 17 }, at, { x: 20, y: 20 });
    assert.equal(g.exportSave(f.session.state), before);
    drag.drop(key, at, { x: 20, y: 20 });
    assert.equal(f.commands.length, 1);
    assert.deepEqual(f.commands[0].source, expected);
    assert.equal(f.commands[0].quantity, (expected.stack ?? expected.drop).amount);
    assert.deepEqual(f.session.state.inventory, stock);
    assert.equal(f.events.length, 0);
    assert.ok(f.barrel().compost.job);
    f.persist();
    const saved = g.exportSave(f.session.state);
    drag.drop(key, at, { x: 20, y: 20 });
    assert.equal(g.exportSave(f.session.state), saved);
  });
test('barrel controls reserve working inputs, withdraw only waiting goods and collect a finite fertilizer token', () => {
  const f = fixture();
  f.session.state.inventory.treeSeed = 5;
  assert.equal(
    f.session.run({
      type: 'depositCompost',
      buildingId: f.barrelId,
      quantity: 5,
      source: { type: 'inventory', item: 'treeSeed', amount: 5 },
    }),
    true,
  );
  const menu = () =>
    productionActions(f.session, f.barrel(), f.handlers, { ...f.ui, quantity: 'all' });
  assert.equal(buildingAssetId(f.barrel(), f.session.state.lastSeenAt), 'compost-barrel-working');
  const first = menu()[0];
  assert.equal(first.enabled, false);
  assert.match(menu().find((a) => a.text.includes('待加工树种')).text, /×3/);
  menu()
    .find((a) => a.text.includes('待加工树种'))
    .run();
  assert.equal(f.barrel().compost.stock.treeSeed, 0);
  assert.equal(f.barrel().compost.job.inputs[0].amount, 2);
  const before = f.session.state.tools.fertilizer;
  f.advance(15000);
  const collect = menu()[0];
  assert.equal(collect.enabled, true);
  collect.run();
  assert.equal(f.session.state.tools.fertilizer, before + 1);
  assert.deepEqual(f.events.at(-1).gains, [{ kind: 'fertilizer', amount: 1 }]);
  assert.equal(f.session.state.inventory.fertilizer, undefined);
  assert.match(compostDescription(f.session, f.barrel()), /肥料用途待设计/);
  assert.equal(g.hasUnlimitedDurability('fertilizer'), false);
  const saved = g.exportSave(f.session.state);
  collect.run();
  assert.equal(g.exportSave(f.session.state), saved);
  f.persist();
});
test('real hammer preview discriminates empty crate, attached mud and incompatible material without writes', () => {
  for (const item of [null, 'mud', 'wood']) {
    const f = fixture(),
      crate = f.session.state.buildings.find((b) => b.kind === 'crate');
    if (item) f.session.state.fusion.attachments[crate.id] = { ...emptyStock(), [item]: 1 };
    const before = g.exportSave(f.session.state),
      c = { type: 'useTool', tool: 'hammer', buildingId: crate.id };
    const result = singleHammerResult(f.session, c);
    assert.equal(
      result?.kind ?? null,
      item === 'mud' ? 'nursery' : item === 'wood' ? null : 'compostBarrel',
    );
    assert.equal(g.exportSave(f.session.state), before);
    if (result) {
      assert.equal(f.session.run(c), true);
      assert.equal(f.session.state.buildings.find((b) => b.id === crate.id).kind, result.kind);
    }
  }
});
test('stone oven starts exact two-to-one roast, protects job token and leaves the bakery recipe intact', () => {
  const f = fixture(),
    oven = f.session.state.buildings.find((b) => b.kind === 'stoneOven');
  f.session.state.inventory.vegetable = 2;
  const menus = () =>
    productionActions(
      f.session,
      f.session.state.buildings.find((b) => b.id === oven.id),
      f.handlers,
    );
  assert.equal(menus().length, 1);
  assert.match(menus()[0].text, /胡萝卜2 → 烤胡萝卜1/);
  const wood = f.session.state.inventory.wood,
    old = f.session.state.inventory.roastedCarrot;
  menus()[0].run();
  assert.equal(f.session.state.inventory.wood, wood);
  assert.equal(menus()[0].enabled, false);
  f.advance(10000);
  const collect = menus()[0];
  collect.run();
  assert.equal(f.session.state.inventory.roastedCarrot, old + 1);
  const saved = g.exportSave(f.session.state);
  collect.run();
  assert.equal(g.exportSave(f.session.state), saved);
  const bakery = f.session.state.buildings.find((b) => b.kind === 'bakery');
  assert.match(productionActions(f.session, bakery, f.handlers)[0].text, /面粉2\+木材1 → 面包2/);
  f.persist();
});
test('mixed compost availability counts only accepted inputs across inventory, ground and drops', () => {
  const f = fixture();
  f.session.state.inventory = emptyStock();
  f.session.state.groundStacks = [];
  f.session.state.looseDrops = [];
  f.session.state.inventory.treeSeed = 1;
  f.session.state.inventory.sapling = 50;
  f.session.state.inventory.roastedCarrot = 20;
  f.session.state.groundStacks = [{ item: 'rice', amount: 1, x: 10, z: 10 }];
  const recipe = g.ACTIVE_RECIPE_DEFINITIONS.find((r) => r.id === 'make-fertilizer');
  const material = handbookEntry(f.session.state, recipe).materials[0];
  assert.deepEqual(material.choices, g.COMPOST_ITEMS);
  assert.equal(material.amount, g.COMPOST_BALANCE.inputAmount);
  assert.equal(material.available, 2);
  assert.equal(material.missing, 0);
});
test('catalog and tool icon reuse include all barrel stages, five roast piles and untouched generated pixels', () => {
  for (const id of [
    'compost-barrel',
    'compost-barrel-working',
    'compost-barrel-ready',
    'roasted-carrot',
    ...Array.from({ length: 5 }, (_, i) => `pile-roastedCarrot-${i + 1}`),
  ])
    assert.ok(ASSETS[id], id);
  const icons = load('TrayIcons');
  assert.equal(icons.TRAY_LABELS.roastedCarrot, '烤胡萝卜');
  assert.ok(fs.existsSync('assets/resources/crop-icons/roasted-carrot.png'));
  const { HANDBOOK_TOOLS } = require('../.domain-build/art/HandbookAssets');
  assert.equal(HANDBOOK_TOOLS.fertilizer, 'fertilizer');
});
