/** Narrow presentation collaborators verify routing, not a rendered Cocos scene. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
const { collectionOrigin } = require('../.domain-build/application/Collections.js');
const { GameSession } = require('../.domain-build/application/GameSession.js');

function presentation(name, dependencies) {
  const source = fs.readFileSync(
    path.join(__dirname, '../assets/scripts/presentation', `${name}.ts`),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => {
      if (id === '../domain/game') return game;
      if (id === '../application/MaterialQuantity')
        return require('../.domain-build/application/MaterialQuantity');
      if (
        id === '../application/BuildingDragSelection' ||
        id === '../application/BuildingMergePreview'
      )
        return require('../.domain-build/' + id.slice(3));
      if (id === './InputProvenance') return require('./helpers/input-provenance.cjs');
      if (id === './UiContracts') return require('./helpers/selection-ui.cjs').load('UiContracts');
      if (id === '../application/SoilWatering')
        return require('../.domain-build/application/SoilWatering.js');
      if (id === '../application/EntityAssemblySelection')
        return require('../.domain-build/application/EntityAssemblySelection');
      if (
        id === './TerrainNavigation' ||
        id === './DiggingToolCommand' ||
        id === './ToolOutline' ||
        id === './TerrainInteraction' ||
        id === './V6TerrainTool' ||
        id === './SingleHammerPreview' ||
        id === './BuildingOutline' ||
        id === './HammerTarget' ||
        id === './EntityAssemblyPreview'
      )
        return require('./helpers/selection-ui.cjs').load(id.slice(2));
      if (id === '../application/MixedCraftSelection')
        return require('../.domain-build/application/MixedCraftSelection.js');
      if (id === './MixedCraftPreview')
        return require('./helpers/selection-ui.cjs').load('MixedCraftPreview');
      assert.ok(Object.hasOwn(dependencies, id), `Missing isolated dependency: ${id}`);
      return dependencies[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}

class TargetNode {
  setPosition(...position) {
    this.position = position;
  }
  addChild() {}
  destroy() {
    this.destroyed = true;
  }
}
class Factory {
  shape() {
    return new TargetNode();
  }
  dispose() {}
}
const { ToolUseDrag } = presentation('ToolUseDrag', {
  cc: { Node: TargetNode },
  './ModelFactory': { ModelFactory: Factory },
});
const stone = { id: 'r1', kind: 'stone', x: 4, z: 9, amount: 3 };
const soil = { id: 'r2', kind: 'soil', x: 15, z: 11, amount: 2 };
function fixture() {
  const commands = [];
  const state = {
    naturalResources: [structuredClone(stone), structuredClone(soil)],
    trees: [{ id: 't1', x: 5, z: 5 }],
    buildings: [{ id: 'b1', kind: 'warehouse', x: 7, z: 7 }],
    groundStacks: [],
    fusion: { discoveries: {} },
  };
  const session = {
    state,
    reason: () => null,
    preview(command) {
      // This routing double keeps injected rejection text consistent across both APIs.
      const error = this.reason(command);
      return error
        ? { ok: false, state: this.state, error }
        : { ok: true, state: this.state, events: [] };
    },
    run: (command) => commands.push(command),
    message: '',
  };
  const map = {
    cancelGesture() {},
    contains: (point) => point.inside !== false,
    screenRay: (point) => point,
    ground: (point) => ({ x: point.x ?? 0, z: point.z ?? 0 }),
  };
  const town = {
    naturalOrigin: (id) => {
      const r = state.naturalResources.find((r) => r.id === id);
      return r ? { x: r.x + 0.5, y: r.amount * 0.7 + 4, z: r.z + 0.5 } : null;
    },
    pickNatural: (ray) => ray.resourceId ?? null,
    pickBuilding: (ray) => ray.buildingId ?? null,
    pickTree: (ray) => ray.treeId ?? null,
    pickStack: (ray) => ray.pile ?? null,
  };
  const drag = new ToolUseDrag(new TargetNode(), session, map, town, () => {});
  return { drag, session, map, town, commands };
}

test('digging tool previews the current resource top and commits one gather only on release', () => {
  for (const resource of [stone, soil]) {
    const { drag, session, commands } = fixture();
    const point = { resourceId: resource.id };
    drag.begin('diggingTool', 7);
    drag.move(7, point);
    assert.deepEqual(commands, [], 'Hovering never mines');
    assert.deepEqual(drag.marker.position, [
      resource.x + 0.5,
      resource.amount * 0.7 + 4,
      resource.z + 0.5,
    ]);
    assert.equal(
      session.message,
      '',
      'The target marker and tool art carry the hint, without recipe text',
    );
    drag.end(8, point);
    assert.deepEqual(commands, [], 'Foreign pointer cannot commit');
    drag.end(7, point);
    drag.end(7, point);
    assert.deepEqual(commands, [{ type: 'gatherNatural', resourceId: resource.id }]);
    assert.equal(drag.marker, null);
  }
});

test('resource marker follows its current height and blocked collection reports domain reason', () => {
  const { drag, session, commands } = fixture();
  drag.begin('diggingTool', 7);
  drag.move(7, { resourceId: soil.id });
  const previous = drag.marker;
  session.state.naturalResources[1].amount--;
  drag.move(7, { resourceId: soil.id });
  assert.equal(previous.destroyed, true);
  assert.equal(drag.marker.position[1], (soil.amount - 1) * 0.7 + 4);
  session.reason = () => '仓库已满';
  drag.move(7, { resourceId: soil.id });
  assert.equal(session.message, '仓库已满');
  drag.cancel();
  drag.end(7, { resourceId: soil.id });
  assert.deepEqual(commands, []);
});

test('hammer retains upgrades; only the digging tool gathers natural stone and soil', () => {
  const { drag } = fixture();
  drag.begin('hammer', 7);
  assert.deepEqual(drag.command({ buildingId: 'b1' }), {
    type: 'useTool',
    tool: 'hammer',
    buildingId: 'b1',
  });
  assert.equal(drag.command({ resourceId: stone.id, inside: false }), null);
  for (const tool of ['axe', 'saw', 'hammer']) {
    drag.begin(tool, 7);
    assert.equal(drag.command({ resourceId: soil.id }), null);
  }
  drag.begin('diggingTool', 7);
  assert.deepEqual(drag.command({ resourceId: stone.id }), {
    type: 'gatherNatural',
    resourceId: stone.id,
  });
  assert.deepEqual(drag.command({ x: 2, z: 5 }), {
    type: 'useTool',
    tool: 'diggingTool',
    x: 2,
    z: 5,
  });
});

test('returning the digging tool to a tray cancels gathering and the next gesture can gather', () => {
  let activeTool;
  class PassiveDrag {
    hasActed = false;
    begin() {}
    move() {}
    cancel() {}
    end() {
      return false;
    }
  }
  const { ToolRouter } = presentation('ToolRouter', {
    './FarmTools': { FarmTools: PassiveDrag },
    './StockDrag': { StockDrag: PassiveDrag },
    './ToolUseDrag': {
      ToolUseDrag: class extends ToolUseDrag {
        constructor(...args) {
          super(...args);
          activeTool = this;
        }
      },
    },
  });
  const { session, map, town, commands } = fixture();
  session.mode = 'normal';
  session.state.tools = { diggingTool: 0 };
  const router = new ToolRouter(new TargetNode(), session, map, town, {}, () => {});
  router.begin('diggingTool', 7, {});
  router.move(7, { resourceId: soil.id }, false);
  router.end(7, { resourceId: soil.id }, true);
  assert.deepEqual(commands, []);
  assert.equal(activeTool.marker, null);
  router.begin('diggingTool', 8, {});
  router.end(8, { resourceId: soil.id }, false);
  assert.deepEqual(commands, [{ type: 'gatherNatural', resourceId: soil.id }]);
});

test('natural resources block stock drops instead of dropping at their ground projection', () => {
  const { StockDrag } = presentation('StockDrag', {
    './ModelFactory': { ModelFactory: Factory },
    '../application/CommerceSelection': require('../.domain-build/application/CommerceSelection.js'),
    '../application/DropSnapshot': require('../.domain-build/application/DropSnapshot'),
  });
  const { session, map, town } = fixture();
  const drag = new StockDrag(new TargetNode(), session, map, town, () => {});
  session.state.inventory = { soil: 2 };
  drag.item = 'soil';
  drag.sourceAmount = 2;
  assert.equal(drag.dropCommand({ resourceId: stone.id, x: 4, z: 9 }, null), null);
  assert.deepEqual(drag.dropCommand({ x: 2.3, z: 5.2 }, null), {
    type: 'dropProduct',
    item: 'soil',
    x: 2,
    z: 5,
  });
});

test('gathered soil stays on ground and only explicit pickup flies, then stock drop and return conserve it', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const session = new GameSession(storage, () => 0);
  const resource = session.state.naturalResources.find((entry) => entry.kind === 'soil');
  assert.ok(resource, 'New island exposes soil');
  const surfaceOrigin = { x: resource.x + 0.5, y: 7.625, z: resource.z + 0.5 };
  const events = [];
  session.setCollectionListener((event) => events.push(event));
  assert.equal(session.run({ type: 'gatherNatural', resourceId: resource.id }), true);
  assert.equal(events.length, 0);
  assert.equal(session.state.inventory.soil, 0);
  assert.deepEqual(
    session.state.looseDrops.map((d) => d.amount),
    [5, 4],
  );
  for (const drop of [...session.state.looseDrops])
    assert.equal(session.run({ type: 'pickupDrop', dropId: drop.id }), true);
  assert.deepEqual(
    events.map((e) => e.gains),
    [[{ kind: 'soil', amount: 5 }], [{ kind: 'soil', amount: 4 }]],
  );
  assert.deepEqual(
    collectionOrigin(events[0], undefined, () => surfaceOrigin),
    surfaceOrigin,
  );
  assert.equal(collectionOrigin(events[0]), null, 'No fabricated amount-height fallback');
  const original = game.exportSave(session.state);
  let drop;
  for (let z = 0; z < game.CONFIG.gridSize && !drop; z++)
    for (let x = 0; x < game.CONFIG.gridSize && !drop; x++) {
      const command = { type: 'dropProduct', item: 'soil', x, z };
      if (!session.reason(command)) drop = command;
    }
  assert.ok(drop);
  assert.equal(session.run(drop), true);
  assert.equal(session.run({ type: 'pickupStack', x: drop.x, z: drop.z }), true);
  assert.equal(game.exportSave(session.state), original);
  assert.deepEqual(new GameSession(storage, () => 0).state, session.state);
});

test('soil loading/error fallback draws a distinct faceted block and scales locally', () => {
  const { drawSoilIcon } = presentation('SoilIcon', {
    './Palette': { color: (hex) => ({ hex, a: 255 }) },
  });
  const calls = [];
  const graphics = Object.fromEntries(
    ['clear', 'moveTo', 'lineTo', 'close', 'fill', 'circle'].map((name) => [
      name,
      (...args) => calls.push([name, ...args]),
    ]),
  );
  drawSoilIcon(graphics, 80);
  assert.equal(calls.filter(([name]) => name === 'close').length, 3);
  assert.equal(calls.filter(([name]) => name === 'circle').length, 4);
  assert.ok(calls.some((entry) => entry[0] === 'moveTo' && entry[1] === -34 && entry[2] === 12));
});

test('soil commerce UI uses the soil label and never offers new soil for sale by the shop', () => {
  const { commerceActions } = presentation('CommercePanel', {
    '../domain/island': game,
    '../application/CommerceSelection': require('../.domain-build/application/CommerceSelection.js'),
    '../application/DropSnapshot': require('../.domain-build/application/DropSnapshot'),
  });
  const state = game.createGame(0);
  const shop = { id: 'shop-display-fixture', kind: 'shop' };
  state.buildings.push(shop);
  const actions = commerceActions(
    { state, reason: () => null },
    { selected: shop.id, tradeItem: 'soil', quantity: 1 },
    { command() {} },
  );
  assert.equal(actions[0].text, '货物：土壤');
  assert.equal(
    actions.some((action) => /^买/.test(action.text)),
    false,
  );
  assert.equal(
    actions.some((action) => /^卖/.test(action.text)),
    true,
  );
});

test('tree seeds never offer an implicit trade and digging art uses the provided transparent PNG', () => {
  const { commerceActions } = presentation('CommercePanel', {
    '../domain/island': game,
    '../application/CommerceSelection': require('../.domain-build/application/CommerceSelection.js'),
    '../application/DropSnapshot': require('../.domain-build/application/DropSnapshot'),
  });
  const state = game.createGame(0);
  state.buildings.push({ id: 'shop-display-fixture', kind: 'shop' });
  const actions = commerceActions(
    { state, reason: () => null },
    { selected: 'shop-display-fixture', tradeItem: 'treeSeed', quantity: 1 },
    { command() {} },
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0].enabled, false);
  assert.equal(actions[0].text, '树种暂不可交易');
  const image = fs.readFileSync(
    path.join(__dirname, '../assets/resources/crop-icons/digging-tool.png'),
  );
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image[25], 6, 'RGBA preserves the provided transparent background');
  assert.ok(image.readUInt32BE(16) >= 256 && image.readUInt32BE(20) >= 256);
  const { TRAY_LABELS } = presentation('TrayIcons', {
    cc: {},
    './CropArtwork': {},
    './Palette': {},
    './SoilIcon': {},
    './MudIcon': {},
    './TreeSeedIcon': {},
  });
  assert.equal(TRAY_LABELS.diggingTool, '挖掘工具');
  assert.equal(TRAY_LABELS.treeSeed, '树种');
});

test('one digging category switches its drag image between shovel and pickaxe without a new action', () => {
  const { drag, commands } = fixture();
  assert.equal(drag.appearance({ resourceId: soil.id }), 'diggingTool');
  assert.equal(drag.appearance({ resourceId: stone.id }), 'diggingPickaxe');
  assert.equal(drag.appearance({ resourceId: stone.id, inside: false }), 'diggingTool');
  assert.equal(drag.appearance({}), 'diggingTool');
  assert.deepEqual(commands, []);
  assert.equal(game.TOOL_IDS.filter((kind) => /digging/.test(kind)).length, 1);
  const { ToolTray } = presentation('ToolTray', {
    cc: {},
    './Palette': {},
    './Widgets': {},
    './TrayIcons': {},
    './TrayColumn': {},
  });
  const surface = Object.create(ToolTray.prototype);
  const draws = [];
  Object.assign(surface, {
    held: 'diggingTool',
    origin: { x: 0, y: 0 },
    ghostAppearance: null,
    width: 100,
    height: 100,
    ghost: new TargetNode(),
    icons: { draw: (_node, kind) => draws.push(kind) },
    handlers: { appearance: (_kind, point) => drag.appearance(point) },
    acceptsProductDrop: (point) => Boolean(point.returning),
  });
  for (const point of [
    { resourceId: soil.id },
    { resourceId: stone.id },
    { resourceId: stone.id },
    { resourceId: stone.id, returning: true },
  ])
    surface.moveGhost({ getLocation: () => point, getUILocation: () => ({ x: 20, y: 20 }) });
  assert.deepEqual(draws, ['diggingTool', 'diggingPickaxe', 'diggingTool']);
  const image = fs.readFileSync(
    path.join(__dirname, '../assets/resources/crop-icons/digging-pickaxe.png'),
  );
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image[25], 6);
});

test('house merges use the shared compatibility rule and retain the house selection in either drag direction', () => {
  class BuildingFactory extends Factory {
    building() {
      return new TargetNode();
    }
  }
  const { BuildingDrag } = presentation('BuildingDrag', {
    cc: { Node: TargetNode },
    './ModelFactory': { ModelFactory: BuildingFactory },
  });
  for (const additionKind of ['stoneMill', 'stoneOven'])
    for (const reversed of [false, true]) {
      const state = game.createDemoGame(100000),
        house = state.buildings.find((b) => b.kind === 'house'),
        addition = state.buildings.find((b) => b.kind === additionKind);
      assert.ok(house && addition);
      const source = reversed ? addition : house,
        target = reversed ? house : addition;
      const commands = [];
      const session = {
        state,
        reason(command) {
          const result = game.dispatch(this.state, command, 100000);
          return result.ok ? null : result.error;
        },
        run(command) {
          commands.push(command);
          const result = game.dispatch(this.state, command, 100000);
          assert.ok(result.ok, result.error);
          this.state = result.state;
          return result.ok;
        },
      };
      const ui = {};
      const drag = new BuildingDrag(
        new TargetNode(),
        session,
        ui,
        { pickBuilding: () => target.id, setLifted() {} },
        () => {},
      );
      const before = game.exportSave(session.state);
      drag.move(source.id, { x: target.x, z: target.z }, {});
      const command = drag.command(source, {});
      assert.deepEqual(command, { type: 'dragMerge', sourceId: source.id, targetId: target.id });
      assert.equal(
        game.exportSave(session.state),
        before,
        'Real domain preview cannot mutate state',
      );
      drag.drop(source.id, {});
      assert.deepEqual(commands, [command]);
      assert.equal(ui.selected, house.id);
      assert.equal(
        session.state.buildings.find((b) => b.id === house.id).kind,
        additionKind === 'stoneMill' ? 'mill' : 'bakery',
      );
      assert.equal(
        session.state.buildings.some((b) => b.id === addition.id),
        false,
      );
    }
});

test('synthesis hover and rejected release keep ingredient requirements out of text hints', () => {
  for (const tool of ['saw', 'hammer']) {
    const { drag, session } = fixture();
    const point =
      tool === 'hammer'
        ? { buildingId: 'b1' }
        : { x: 4, z: 5, pile: { id: 'pile:4:5', x: 4, z: 5 } };
    session.reason = () => '需要指定数量木材才能合成';
    session.run = () => {
      session.message = '木材数量必须恰好为1、2或4份';
      return false;
    };
    drag.begin(tool, 7);
    assert.equal(session.message, '');
    drag.move(7, point);
    assert.equal(session.message, '当前组合未能合成');
    drag.end(7, point);
    assert.equal(session.message, '当前组合未能合成');
  }
});

test('synthesis does not disguise blocked space, full storage or save conflicts as an unavailable feature', () => {
  for (const reason of [
    '此处有树木',
    '请先采集此处的天然资源',
    '此处已有建筑',
    '请先取回地上的产品',
    '此处是水域，不能建造',
    '建筑超出地图',
    '仓库空间不足',
    '另一页面已更新存档，本页已暂停保存。',
  ]) {
    const { drag, session } = fixture();
    const point = { x: 4, z: 5, pile: { id: 'pile:4:5', x: 4, z: 5 } };
    session.reason = () => reason;
    session.run = () => {
      session.message = reason;
      return false;
    };
    drag.begin('saw', 7);
    drag.move(7, point);
    assert.equal(session.message, reason);
    drag.end(7, point);
    assert.equal(session.message, reason);
  }
});

test('saw misses identify a missing target without dispatching or revealing a material quantity', () => {
  const { drag, session, commands } = fixture();
  session.reason = () => assert.fail('Air misses must not query a ground-cell recipe');
  drag.begin('saw', 7);
  drag.move(7, { x: 4, z: 5 });
  assert.equal(session.message, '未选中地面材料');
  assert.equal(drag.marker, null);
  drag.end(7, { x: 4, z: 5 });
  assert.equal(session.message, '未选中地面材料');
  assert.deepEqual(commands, []);
});

test('HUD passes the contextual tool appearance through its drag adapter', () => {
  const { TownHUD } = presentation('TownHUD', {
    cc: {},
    './SafeControls': {},
    './Widgets': {},
    '../application/HudLayout': {},
    './ToolTray': {},
    './CollectionFlights': {},
    './RecipeHandbook': {},
    './BottomActions': {},
    './RadialActions': {},
    './ActionArtwork': {},
    './StatusToast': {},
    './ResourceCounters': {},
  });
  let delegated;
  const hud = {
    tools: { setHandlers: (handlers) => (delegated = handlers) },
  };
  const calls = [];
  TownHUD.prototype.setToolHandlers.call(hud, {
    appearance: (kind, point) => {
      calls.push([kind, point]);
      return 'diggingPickaxe';
    },
  });
  const point = { x: 60, y: 80 };
  assert.equal(delegated.appearance('diggingTool', point), 'diggingPickaxe');
  assert.deepEqual(calls, [['diggingTool', point]]);
});

test('real digging release records soil and stone discoveries exactly once, with previews and cancellation untouched', () => {
  for (const kind of ['soil', 'stone']) {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const session = new GameSession(
      storage,
      () => 60000,
      () => game.createDemoGame(60000),
    );
    const resource = session.state.naturalResources.find((r) => r.kind === kind);
    const point = { resourceId: resource.id },
      before = game.exportSave(session.state);
    const f = fixture();
    f.town.naturalOrigin = () => ({ x: resource.x + 0.5, y: 2, z: resource.z + 0.5 });
    const drag = new ToolUseDrag(new TargetNode(), session, f.map, f.town, () => {});
    drag.begin('diggingTool', 7);
    drag.move(7, point);
    drag.cancel();
    drag.end(7, point);
    assert.equal(game.exportSave(session.state), before);
    assert.equal(values.size, 0);
    drag.begin('diggingTool', 8);
    drag.move(8, point);
    assert.equal(game.exportSave(session.state), before);
    drag.end(8, point);
    drag.end(8, point);
    assert.deepEqual(session.state.fusion.discoveries, {
      ['gather-' + kind]: { count: 1, firstDiscoveredAt: 60000 },
    });
    assert.deepEqual(new GameSession(storage, () => 60000).state, session.state);
  }
});
