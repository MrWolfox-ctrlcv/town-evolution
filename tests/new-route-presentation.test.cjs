/** Production presentation routing with CPU collaborators, not Cocos/GPU/device verification. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const g = require('../.domain-build/domain/game');
const { stackDropCommand, stackDropMarker } = require('../.domain-build/application/StackDrop');
const { nextTransportTarget } = require('../.domain-build/application/CommerceSelection');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { BUILDING_ASSETS, buildingAssetId } = require('../.domain-build/art/BuildingAssets');
const { attachmentHeight } = require('../.domain-build/art/FeedbackMath');
const { load, Node } = require('./helpers/selection-ui.cjs');
const { StockDrag } = load('StockDrag');
const { ToolUseDrag } = load('ToolUseDrag');
const { productionActions, transportActions } = load('RouteActions');
const { actions } = load('HudActions');
const { createUiState } = load('UiContracts');
const { TRAY_LABELS } = load('TrayIcons');

function fixture() {
  let now = 100000;
  const session = {
    state: g.createGame(now),
    mode: 'normal',
    reason(command) {
      const result = g.dispatch(this.state, command, now);
      return result.ok ? null : result.error;
    },
    run(command) {
      const result = g.dispatch(this.state, command, now);
      if (result.ok) this.state = result.state;
      return result;
    },
  };
  const commands = [],
    results = [];
  const handlers = {
    command(c) {
      commands.push(c);
      results.push(session.run(c));
    },
    item() {},
    quantity() {},
  };
  return {
    session,
    commands,
    results,
    handlers,
    advance(ms) {
      now += ms;
    },
  };
}

test('all building kinds and new goods have canonical world art, labels and safe feedback heights', () => {
  for (const kind of Object.keys(g.CONFIG.buildings)) {
    assert.ok(ASSETS[BUILDING_ASSETS[kind]], kind);
    assert.ok(Number.isFinite(attachmentHeight(kind)), kind);
  }
  for (const item of ['rice', 'sapling', 'milledRice', 'flour', 'bread']) {
    assert.ok(TRAY_LABELS[item]);
    for (let n = 1; n <= g.stackLimitFor(item); n++) assert.ok(ASSETS[`pile-${item}-${n}`]);
  }
  const dock = { kind: 'dock' };
  assert.equal(buildingAssetId(dock, 0), 'dock');
  assert.equal(buildingAssetId({ ...dock, dockStyle: 'simple' }, 0), 'dock-simple-three');
  assert.equal(buildingAssetId({ kind: 'nursery' }, 0), 'nursery-empty');
  assert.equal(buildingAssetId({ kind: 'nursery', nurserySeeded: true }, 0), 'nursery-seeded');
  assert.equal(
    buildingAssetId({ kind: 'nursery', nurserySeeded: true, job: { readyAt: 10 } }, 11),
    'nursery-ready',
  );
});

test('inventory and ground drags route nursery inputs and saplings without mutating during preview', () => {
  const { session } = fixture();
  const crate = { id: 'crate', kind: 'crate', x: 5, z: 5, rotation: 0 };
  const nursery = { ...crate, id: 'nursery', kind: 'nursery', x: 7 };
  session.state.buildings.push(crate, nursery);
  const town = { pickTree: () => null, pickNatural: () => null, pickStack: () => null };
  const map = { contains: () => true, screenRay: () => ({}), ground: () => ({ x: 10.2, z: 11.3 }) };
  const drag = new StockDrag(new Node('World'), session, map, town, () => {});
  const snapshot = JSON.stringify(session.state);
  drag.item = 'mud';
  assert.deepEqual(drag.buildingCommand(crate.id), {
    type: 'attachMaterial',
    buildingId: crate.id,
    item: 'mud',
    quantity: 1,
  });
  drag.item = 'treeSeed';
  assert.deepEqual(drag.buildingCommand(nursery.id), {
    type: 'seedNursery',
    buildingId: nursery.id,
  });
  drag.item = 'sapling';
  assert.deepEqual(drag.dropCommand({}, null), { type: 'plantSapling', x: 10, z: 11 });
  assert.equal(JSON.stringify(session.state), snapshot);
  for (const [item, target, type] of [
    ['mud', crate, 'attachMaterial'],
    ['treeSeed', nursery, 'seedNursery'],
  ]) {
    session.state.groundStacks = [{ item, amount: 2, x: 4, z: 4 }];
    const command = stackDropCommand(
      { x: 4, z: 4 },
      { kind: 'building', building: target },
      session.state,
    );
    assert.deepEqual(
      command,
      type === 'attachMaterial'
        ? {
            type,
            buildingId: target.id,
            item,
            quantity: 1,
            source: { x: 4, z: 4, item, amount: 2 },
          }
        : { type, buildingId: target.id, source: { x: 4, z: 4 } },
    );
    assert.ok(stackDropMarker(session.state, command));
  }
  session.state.groundStacks = [{ item: 'sapling', amount: 1, x: 4, z: 4 }];
  assert.deepEqual(
    stackDropCommand({ x: 4, z: 4 }, { kind: 'ground', x: 9, z: 9 }, session.state),
    { type: 'plantSapling', x: 9, z: 9, source: { x: 4, z: 4 } },
  );
});

test('hammer selects ground stacks as well as buildings, while blocked surfaces cannot craft through', () => {
  const { session } = fixture();
  let building = null,
    blocked = false;
  const town = {
    pickBuilding: () => building,
    pickTree: () => (blocked ? 'tree' : null),
    pickNatural: () => null,
    pickStack: () => ({ x: 4, z: 5 }),
  };
  const map = { contains: () => true, screenRay: () => ({}) };
  const tool = new ToolUseDrag(new Node('World'), session, map, town, () => {});
  tool.tool = 'hammer';
  assert.deepEqual(tool.command({}), { type: 'useTool', tool: 'hammer', x: 4, z: 5 });
  building = session.state.buildings.find((b) => b.kind === 'warehouse').id;
  assert.deepEqual(tool.command({}), { type: 'useTool', tool: 'hammer', buildingId: building });
  building = null;
  blocked = true;
  assert.equal(tool.command({}), null);
});

test('nursery controls seed, water, wait and collect without replaying a harvest', () => {
  const f = fixture(),
    id = 'nursery-ui';
  f.session.state.buildings.push({ id, kind: 'nursery', x: 4, z: 4, rotation: 0 });
  f.session.state.inventory.treeSeed = 1;
  const menu = () =>
    productionActions(
      f.session,
      f.session.state.buildings.find((b) => b.id === id),
      f.handlers,
    );
  menu()[0].run();
  assert.equal(f.commands.at(-1).type, 'seedNursery');
  menu()[0].run();
  assert.equal(f.commands.at(-1).tool, 'wateringCan');
  assert.equal(menu()[0].enabled, false);
  f.advance(g.NURSERY.durationMs);
  const collect = menu()[0];
  assert.equal(collect.enabled, true);
  collect.run();
  const amount = f.session.state.inventory.sapling;
  collect.run();
  assert.equal(f.results.at(-1).ok, false);
  assert.equal(f.session.state.inventory.sapling, amount);
});

test('processing UI carries the job ID, prevents early collection, and rejects stale collect replay', () => {
  const f = fixture(),
    id = 'mill-ui';
  f.session.state.buildings.push({ id, kind: 'mill', x: 4, z: 4, rotation: 0 });
  f.session.state.inventory.rice = 2;
  const menu = () =>
    productionActions(
      f.session,
      f.session.state.buildings.find((b) => b.id === id),
      f.handlers,
    );
  menu()
    .find((a) => a.text.includes('大米'))
    .run();
  assert.equal(f.results.at(-1).ok, true);
  assert.equal(menu()[0].enabled, false);
  f.advance(10000);
  const collect = menu()[0];
  collect.run();
  assert.equal(f.commands.at(-1).type, 'collectProcessing');
  assert.ok(f.commands.at(-1).jobId);
  assert.equal(f.session.state.inventory.milledRice, 1);
  const before = f.session.state;
  collect.run();
  assert.equal(f.results.at(-1).ok, false);
  assert.strictEqual(f.session.state, before);
});

test('transport UI sends only the shown item and amount to an explicit target', () => {
  const f = fixture(),
    warehouse = { id: 'transport-ui', kind: 'transportWarehouse', x: 4, z: 4, rotation: 0 };
  f.session.state.buildings.push(warehouse);
  const ui = { ...createUiState(), tradeItem: 'bread', quantity: 1 };
  assert.equal(transportActions(f.session, warehouse, ui, f.handlers).at(-1).enabled, false);
  const shop = { id: 'shop-ui', kind: 'shop', x: 7, z: 7, rotation: 0 };
  f.session.state.buildings.push(shop);
  f.session.state.commerce.shopStock[shop.id] = { ...f.session.state.inventory };
  f.session.state.inventory.bread = 1;
  assert.equal(nextTransportTarget(f.session.state, null), shop.id);
  const menu = transportActions(f.session, warehouse, ui, f.handlers);
  assert.match(menu[2].text, /shop-ui/);
  menu.at(-1).run();
  assert.deepEqual(f.commands.at(-1), {
    type: 'transportDeliver',
    buildingId: warehouse.id,
    targetId: shop.id,
    cargo: [{ item: 'bread', quantity: 1 }],
  });
  assert.equal(f.results.at(-1).ok, true);
  assert.equal(f.session.state.inventory.bread, 0);
});

test('rice purchase and generated icon metadata are wired without pixel rewriting', () => {
  const f = fixture();
  const ui = { ...createUiState(), cropShopOpen: true };
  const purchase = actions(f.session, ui, f.handlers).find((a) =>
    a.text.includes(g.CROPS.rice.label),
  );
  assert.ok(purchase);
  purchase.run();
  assert.equal(f.commands.at(-1).item, 'rice');
  for (const entry of JSON.parse(fs.readFileSync('docs/art/new-route-icons.json'))) {
    const file = `assets/resources/crop-icons/${entry.name}.png`;
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      entry.sha256,
    );
    const meta = JSON.parse(fs.readFileSync(`${file}.meta`));
    assert.equal(meta.userData.hasAlpha, true);
    assert.equal(meta.subMetas['6c48a'].userData.premultiplyAlpha, false);
  }
});

test('destination cycling advances from the displayed fallback and recovers after target removal', () => {
  const state = {
    buildings: [
      { id: 'shop', kind: 'shop' },
      { id: 'dock', kind: 'dock' },
    ],
  };
  assert.equal(nextTransportTarget(state, null), 'dock');
  assert.equal(nextTransportTarget(state, 'removed'), 'dock');
  assert.equal(nextTransportTarget(state, 'dock'), 'shop');
  assert.equal(nextTransportTarget({ buildings: [] }, null), null);
});

test('simple dock extensions require both water rows while legacy docks retain one-row scenery', () => {
  const { collaborators } = require('./helpers/demo-campaign-scene.cjs');
  const { commerceDescription } = load('CommercePanel');
  const Factory = collaborators['./ModelFactory'].ModelFactory;
  const factory = new Factory();
  const state = g.createGame(100000, 42173);
  const before = g.exportSave(state);
  for (const rotation of [0, 1, 2, 3]) {
    let clear, narrow;
    for (let z = 0; z < g.worldSize(state.terrainVersion) && !(clear && narrow); z++)
      for (let x = 0; x < g.worldSize(state.terrainVersion) && !(clear && narrow); x++) {
        const dock = { id: 'shore-preview', kind: 'dock', x, z, rotation, dockStyle: 'simple' };
        if (!g.isDockShore(dock, state.mapSeed, state.terrainVersion, [])) continue;
        if (g.hasDockExit(state, dock)) clear ??= dock;
        else narrow ??= dock;
      }
    assert.ok(clear && narrow, `Both shoreline widths exist in facing ${rotation}`);
    const render = (dock) =>
      factory.building(dock, 100000, state.mapSeed, state.terrainVersion, []);
    const valid = render(clear).getChildByName('RotatedPier');
    assert.ok(valid?.getChildByName('PierExtension'));
    assert.equal(render(narrow).getChildByName('RotatedPier'), null);
    assert.ok(render({ ...narrow, dockStyle: undefined }).getChildByName('RotatedPier'));
    assert.match(
      commerceDescription({ state: { ...state, buildings: [narrow] } }, { selected: narrow.id }),
      /连续两格海面出口/,
    );
  }
  assert.equal(g.exportSave(state), before);
  factory.dispose();
});

test('discovered board and crate pages retain recipe identity but show the current hammer recipe', () => {
  const { handbookView } = require('../.domain-build/application/HandbookModel');
  const { HANDBOOK_TOOLS } = require('../.domain-build/art/HandbookAssets');
  const state = g.createGame(100000);
  for (const [id, amount] of [
    ['build-order-board', 1],
    ['build-crate', 2],
  ]) {
    state.fusion.discoveries[id] = { count: 3, firstDiscoveredAt: 90000 };
    const entry = handbookView(state).entries.find((e) => e.recipe.id === id);
    assert.equal(entry.count, 3);
    assert.equal(entry.discovered, true);
    assert.equal(entry.recipe.tool, 'hammer');
    assert.equal(HANDBOOK_TOOLS[entry.recipe.tool], 'hammer');
    assert.deepEqual(entry.recipe.ingredients, [{ kind: 'wood', label: '木材', amount }]);
    assert.match(entry.recipe.description, /锤子/);
    assert.doesNotMatch(entry.recipe.description, /锯子/);
  }
});
