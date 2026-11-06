/** Real FarmTools routing with narrow collaborators, not a rendered Cocos/browser test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const game = require('../.domain-build/domain/game');
const { farmCellCenter } = require('../.domain-build/application/FarmCells');
class Node {
  constructor(name) {
    this.name = name;
    this.children = [];
  }
  addChild(node) {
    this.children.push(node);
  }
  getChildByName(name) {
    return this.children.find((n) => n.name === name) ?? null;
  }
  destroy() {
    this.destroyed = true;
  }
  setRotationFromEuler() {}
}
class ModelFactory {
  shape(parent, name) {
    const node = new Node(name);
    parent.addChild(node);
    return node;
  }
  dispose() {}
}
function load() {
  const source = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/FarmTools.ts', 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    },
  ).outputText;
  const deps = {
    cc: { Node },
    './ModelFactory': { ModelFactory },
    '../domain/farming': require('../.domain-build/domain/farming'),
    '../application/FarmCells': require('../.domain-build/application/FarmCells'),
    '../application/StrokeSampling': require('../.domain-build/application/StrokeSampling'),
    '../application/FarmSweep': require('../.domain-build/application/FarmSweep'),
  };
  const m = { exports: {} };
  new Function('require', 'module', 'exports', source)(
    (id) => {
      assert.ok(deps[id], id);
      return deps[id];
    },
    m,
    m.exports,
  );
  return m.exports.FarmTools;
}
function fixture(irrigated = true) {
  const state = game.createGame(100000, 1, 1);
  const farm = state.buildings.find((b) => b.id === 'b2');
  if (irrigated) farm.irrigated = true;
  for (const crop of game.CROP_KEYS) state.inventory[crop] = 2;
  const commands = [];
  const session = {
    state,
    mode: 'normal',
    message: '',
    reason(command) {
      const result = game.dispatch(this.state, command, 100000);
      return result.ok ? null : result.error;
    },
    run(command) {
      commands.push(command);
      const result = game.dispatch(this.state, command, 100000);
      if (result.ok) this.state = result.state;
      this.message = result.ok ? result.events.join('；') : result.error;
      return result.ok;
    },
  };
  const point = { x: 1, y: 1 },
    parent = new Node('World');
  const cell = farmCellCenter(farm, 8);
  const map = {
    cancelGesture() {},
    contains: (p) => p.x >= 0 && p.y >= 0,
    screenRay: () => ({ o: { x: cell.x, y: 1, z: cell.z }, d: { x: 0, y: -1, z: 0 } }),
  };
  const town = {
    pickBuilding: () => 'b2',
    pickCrop: () => null,
    pickPlant: () => ({ buildingId: 'b2', cell: null, distance: 0.83 }),
  };
  const FarmTools = load();
  return {
    session,
    parent,
    point,
    commands,
    tools: new FarmTools(parent, session, map, town, () => {}),
  };
}
for (const crop of game.CROP_KEYS) {
  const waterCrop = game.CROPS[crop].field === 'water';
  const supportedField = waterCrop ? 'water' : 'dryland';
  const rejectedField = waterCrop ? 'dryland' : 'water';
  test(`dragging ${crop} onto ${rejectedField} cannot plant, highlight eligible cells, consume or repeat`, () => {
    const f = fixture(!waterCrop),
      before = JSON.stringify(f.session.state);
    f.tools.begin('plant', 1, f.point, crop);
    assert.equal(f.tools.highlights.children.length, 0);
    f.tools.move(2, f.point);
    assert.equal(f.commands.length, 0);
    f.tools.move(1, f.point);
    assert.match(
      f.session.message,
      new RegExp(`${game.CROPS[crop].label}.*${waterCrop ? '水田.*旱田' : '旱田.*水田'}`),
    );
    assert.equal(f.tools.hasActed, false);
    assert.equal(f.tools.end(1, f.point), false);
    assert.equal(f.tools.end(1, f.point), false);
    assert.equal(f.commands.length, 1);
    assert.equal(JSON.stringify(f.session.state), before);
    f.tools.begin('plant', 3, f.point, crop);
    f.tools.cancel();
    f.tools.end(3, f.point);
    assert.equal(f.commands.length, 1);
    f.tools.begin('plant', 4, { x: -1, y: -1 }, crop);
    f.tools.end(4, { x: -2, y: -2 });
    assert.equal(f.commands.length, 1);
    assert.equal(JSON.stringify(f.session.state), before);
  });
  test(`dragging ${crop} onto ${supportedField} still highlights and plants once`, () => {
    const f = fixture(waterCrop);
    f.tools.begin('plant', 1, f.point, crop);
    assert.equal(f.tools.highlights.children.length, 9);
    assert.equal(f.tools.end(1, f.point), true);
    assert.equal(f.tools.end(1, f.point), false);
    assert.equal(f.commands.length, 1);
    assert.equal(f.session.state.inventory[crop], 1);
    assert.equal(f.session.state.buildings.find((b) => b.id === 'b2').cropJobs[8].crop, crop);
  });
}
