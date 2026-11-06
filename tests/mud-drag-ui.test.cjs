/** Real presentation command routing with narrow collaborators, not a rendered browser test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const game = require('../.domain-build/domain/game');
class Node {
  constructor(name) {
    this.name = name;
    this.children = [];
  }
  addChild(n) {
    this.children.push(n);
  }
  setPosition(...p) {
    this.position = p;
  }
  setScale(...p) {
    this.scale = p;
  }
  destroy() {
    this.destroyed = true;
  }
}
class Factory {
  asset(id, name) {
    const n = new Node(name);
    n.asset = id;
    return n;
  }
  shape(parent, name, ...params) {
    const n = new Node(name);
    n.params = params;
    parent.addChild(n);
    return n;
  }
  dispose() {}
}
function load(name) {
  const deps = {
    '../application/DropSnapshot': require('../.domain-build/application/DropSnapshot'),
    './DiggingToolCommand': require('./helpers/selection-ui.cjs').load('DiggingToolCommand'),
    './ToolOutline': require('./helpers/selection-ui.cjs').load('ToolOutline'),
    './TerrainInteraction': require('./helpers/selection-ui.cjs').load('TerrainInteraction'),
    './UiContracts': require('./helpers/selection-ui.cjs').load('UiContracts'),
    cc: {
      Node,
      Vec3: class {
        constructor(x, y, z) {
          Object.assign(this, { x, y, z });
        }
      },
    },
    './ModelFactory': { ModelFactory: Factory },
    '../domain/game': game,
    '../application/SoilWatering': require('../.domain-build/application/SoilWatering'),
    '../application/MixedCraftSelection': require('../.domain-build/application/MixedCraftSelection'),
    '../application/EntityAssemblySelection': require('../.domain-build/application/EntityAssemblySelection'),
    './SingleHammerPreview': require('./helpers/selection-ui.cjs').load('SingleHammerPreview'),
    './HammerTarget': require('./helpers/selection-ui.cjs').load('HammerTarget'),
    './EntityAssemblyPreview': require('./helpers/selection-ui.cjs').load('EntityAssemblyPreview'),
    './MixedCraftPreview': require('./helpers/selection-ui.cjs').load('MixedCraftPreview'),
    '../application/StackDrop': require('../.domain-build/application/StackDrop'),
    '../application/CommerceSelection': require('../.domain-build/application/CommerceSelection'),
    '../art/NaturalBlockKit': require('../.domain-build/art/NaturalBlockKit'),
    './PileModel': { pileModel: () => new Node('Pile') },
  };
  const source = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', source)(
    (id) => {
      assert.ok(deps[id], id);
      return deps[id];
    },
    m,
    m.exports,
  );
  return m.exports[name];
}
function fixture() {
  const state = game.createGame(1000, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.groundStacks = [
    { x: 10, z: 10, item: 'soil', amount: 5 },
    { x: 11, z: 10, item: 'soil', amount: 5 },
  ];
  const commands = [];
  const session = {
    state,
    mode: 'normal',
    message: '',
    reason(c) {
      const r = game.dispatch(this.state, c, 1000);
      return r.ok ? null : r.error;
    },
    run(c) {
      commands.push(c);
      const r = game.dispatch(this.state, c, 1000);
      if (r.ok) this.state = r.state;
      else this.message = r.error;
      return r.ok;
    },
  };
  const map = {
    cancelGesture() {},
    contains: (p) => p.inside !== false,
    screenRay: (p) => p,
    ground: (p) => ({ x: p.x, z: p.z }),
  };
  const town = {
    pickBuilding: (p) => p.buildingId ?? null,
    pickTree: () => null,
    pickNatural: () => null,
    pickStack: (p) => p.pile ?? null,
    setLiftedStack() {},
  };
  return { session, commands, map, town, parent: new Node('World') };
}
test('watering gesture accumulates explicit piles, previews without text/spending, and commits once', () => {
  const f = fixture(),
    Drag = load('ToolUseDrag'),
    drag = new Drag(f.parent, f.session, f.map, f.town, () => {});
  const before = JSON.stringify(f.session.state),
    a = { pile: { x: 10, z: 10 } },
    b = { pile: { x: 11, z: 10 } };
  drag.begin('wateringCan', 7);
  drag.move(7, a);
  drag.move(7, a);
  drag.move(7, b);
  assert.equal(f.session.message, '');
  assert.equal(JSON.stringify(f.session.state), before);
  assert.equal(drag.marker.children.filter((n) => n.name === 'WaterDrop').length, 2);
  assert.ok(drag.marker.children.some((n) => n.asset === 'pile-mud-1'));
  drag.end(8, b);
  assert.equal(f.commands.length, 0);
  drag.end(7, b);
  drag.end(7, b);
  assert.equal(f.commands.length, 1);
  assert.equal(f.session.state.groundStacks.find((p) => p.item === 'mud').amount, 1);
  assert.deepEqual(f.session.state.fusion.discoveries, {
    'water-soil': { count: 1, firstDiscoveredAt: 1000 },
  });
  assert.equal(f.session.state.groundStacks.find((p) => p.item === 'soil').amount, 1);
  assert.equal(drag.marker, null);
});
test('cancel, tray-style cancel and releases outside the map keep every selected soil unit', () => {
  for (const cancel of [true, false]) {
    const f = fixture(),
      Drag = load('ToolUseDrag'),
      drag = new Drag(f.parent, f.session, f.map, f.town, () => {});
    const before = JSON.stringify(f.session.state);
    drag.begin('wateringCan', 7);
    drag.move(7, { pile: { x: 10, z: 10 } });
    drag.move(7, { pile: { x: 11, z: 10 } });
    if (cancel) drag.cancel();
    drag.end(7, { inside: false });
    assert.equal(f.commands.length, 0);
    assert.equal(JSON.stringify(f.session.state), before);
    drag.begin('wateringCan', 8);
    drag.move(8, { pile: { x: 11, z: 10 } });
    assert.equal(drag.soil.length, 1, 'a new gesture cannot inherit old soil');
  }
});
test('one watering gesture can target a whole farm instead of a soil recipe', () => {
  const f = fixture(),
    Drag = load('ToolUseDrag'),
    drag = new Drag(f.parent, f.session, f.map, f.town, () => {});
  drag.begin('wateringCan', 7);
  drag.move(7, { buildingId: 'b2' });
  drag.end(7, { buildingId: 'b2' });
  assert.deepEqual(f.commands, [{ type: 'useTool', tool: 'wateringCan', buildingId: 'b2' }]);
  assert.equal(f.session.state.buildings.find((b) => b.id === 'b2').irrigated, true);
});
test('mud from the product tray targets a basic house as a one-unit residence recipe', () => {
  const f = fixture(),
    Drag = load('StockDrag'),
    drag = new Drag(f.parent, f.session, f.map, f.town, () => {});
  f.session.state.buildings.push({ id: 'b3', kind: 'house', x: 10, z: 12, rotation: 0 });
  f.session.state.nextId = 4;
  f.session.state.inventory.mud = 2;
  drag.item = 'mud';
  assert.deepEqual(drag.buildingCommand('b3'), {
    type: 'attachMaterial',
    buildingId: 'b3',
    item: 'mud',
    quantity: 1,
  });
  drag.begin('mud', 7);
  drag.move(7, { buildingId: 'b3' });
  assert.equal(f.commands.length, 0);
  assert.equal(f.session.message, '');
  drag.end(7, { buildingId: 'b3' });
  drag.end(7, { buildingId: 'b3' });
  assert.equal(f.commands.length, 1);
  assert.equal(f.session.state.inventory.mud, 1);
  assert.equal(f.session.state.buildings[2].kind, 'house');
  assert.equal(f.session.state.fusion.discoveries['build-residence'], undefined);
  const hammer = new (load('ToolUseDrag'))(f.parent, f.session, f.map, f.town, () => {});
  hammer.begin('hammer', 91);
  hammer.end(91, { buildingId: 'b3' });
  assert.equal(f.session.state.buildings[2].kind, 'residence');
  assert.deepEqual(f.session.state.fusion.discoveries, {
    'build-residence': { count: 1, firstDiscoveredAt: 1000 },
  });
});
test('whole mud stack release routes coast expansion through domain and leaves no duplicate command', () => {
  const f = fixture(),
    Drag = load('StackDrag');
  f.session.state.groundStacks = [{ x: 10, z: 10, item: 'mud', amount: 9 }];
  let target;
  for (let z = 1; z < 23 && !target; z++)
    for (let x = 1; x < 23 && !target; x++)
      if (!game.isLandCell(x, z, 1, 1) && game.isLandCell(x + 1, z, 1, 1)) target = { x, z };
  const drag = new Drag(f.parent, f.session, {}, f.town, () => {}, {
    acceptsProductDrop: () => false,
    highlightProductDrop() {},
  });
  drag.source = { id: 'pile:10:10', x: 10, z: 10, item: 'mud', amount: 9 };
  const ray = { o: { x: target.x + 0.5, y: 5, z: target.z + 0.5 }, d: { x: 0, y: -1, z: 0 } };
  assert.equal(drag.command(ray, {}).type, 'expandLand');
  drag.drop('pile:10:10', ray, {});
  drag.drop('pile:10:10', ray, {});
  assert.equal(f.commands.length, 1);
  assert.deepEqual(f.session.state.landExtensions, [target]);
  assert.deepEqual(f.session.state.fusion.discoveries, {
    'expand-land': { count: 1, firstDiscoveredAt: 1000 },
  });
  assert.equal(f.session.state.groundStacks.length, 0);
});

for (const crop of game.CROP_KEYS)
  test(`watering a planted ${crop} field shows the actual reason on hover and release`, () => {
    const f = fixture(),
      Drag = load('ToolUseDrag'),
      drag = new Drag(f.parent, f.session, f.map, f.town, () => {});
    f.session.state.inventory[crop] = 1;
    if (crop === 'rice')
      assert.ok(f.session.run({ type: 'useTool', tool: 'wateringCan', buildingId: 'b2' }));
    assert.ok(f.session.run({ type: 'plantCell', buildingId: 'b2', cell: 8, crop }));
    f.commands.length = 0;
    const before = JSON.stringify(f.session.state),
      point = { buildingId: 'b2' };
    drag.begin('wateringCan', 7);
    drag.move(7, point);
    assert.match(f.session.message, crop === 'rice' ? /此田已经灌水/ : /请先收获.*旱作物/);
    assert.ok(drag.marker.children.every((n) => n.params.at(-1) === '#D97168'));
    assert.equal(JSON.stringify(f.session.state), before);
    drag.cancel();
    drag.end(7, point);
    assert.equal(f.commands.length, 0);
    drag.begin('wateringCan', 8);
    drag.end(8, point);
    drag.end(8, point);
    assert.equal(f.commands.length, 1);
    assert.match(f.session.message, crop === 'rice' ? /此田已经灌水/ : /请先收获.*旱作物/);
    assert.equal(JSON.stringify(f.session.state), before);
  });
