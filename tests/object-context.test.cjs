const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const g = require('../.domain-build/domain/game.js');
function presentation(name, dependencies = {}) {
  const code = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id in dependencies) return dependencies[id];
      if (id.startsWith('../')) return require(`../.domain-build/${id.slice(3)}.js`);
      throw new Error(`Missing dependency ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}
const { createUiState } = presentation('UiContracts');
const { objectTarget, pickObject } = presentation('ObjectContext', {
  './UiContracts': presentation('UiContracts'),
});
const { commerceActions } = presentation('CommercePanel');
const { actions, rotationAction } = presentation('HudActions', {
  './CommercePanel': { commerceActions },
  './RouteActions': require('./helpers/selection-ui.cjs').load('RouteActions'),
  './TrayIcons': { TRAY_LABELS: { wood: '木材', soil: '土壤', mud: '泥土' } },
});
function fixture() {
  const state = g.createGame(100, 42173);
  state.buildings = [{ id: 'b1', kind: 'house', x: 3, z: 3, rotation: 0 }];
  state.trees = [{ id: 't1', x: 5, z: 5 }];
  state.naturalResources = [{ id: 'n1', kind: 'stone', x: 6, z: 6, amount: 3 }];
  state.groundStacks = [{ x: 7, z: 7, item: 'wood', amount: 2 }];
  const commands = [];
  return {
    ui: createUiState(),
    session: { state, mode: 'normal', reason: () => null },
    commands,
    handlers: { command: (c) => commands.push(c) },
  };
}
test('selection uses the same occlusion-aware picking, changes target once and clears on empty ground', () => {
  const { ui } = fixture();
  const ray = {};
  for (const selected of ['building', 'pile', 'tree', 'natural', null]) {
    const town = {
      pickBuilding: (r) => {
        assert.equal(r, ray);
        return selected === 'building' ? 'b1' : null;
      },
      pickStack: () => (selected === 'pile' ? { x: 7, z: 7 } : null),
      pickTree: () => (selected === 'tree' ? 't1' : null),
      pickNatural: () => (selected === 'natural' ? 'n1' : null),
    };
    pickObject(ui, town, ray);
    assert.equal(ui.selected, selected === 'building' ? 'b1' : null);
    assert.deepEqual(ui.selectedPile, selected === 'pile' ? { x: 7, z: 7 } : null);
    assert.deepEqual(
      ui.selectedResource,
      selected === 'tree' || selected === 'natural'
        ? { kind: selected, id: selected === 'tree' ? 't1' : 'n1' }
        : null,
    );
  }
});
test('objects that disappear are not left with orphan controls; global workflows are never radial', () => {
  const { ui, session } = fixture();
  ui.selectedResource = { kind: 'tree', id: 't1' };
  assert.deepEqual(objectTarget(session, ui), ui.selectedResource);
  session.state.trees = [];
  assert.equal(objectTarget(session, ui), null);
  ui.selected = 'b1';
  assert.deepEqual(objectTarget(session, ui), { kind: 'building', id: 'b1' });
  for (const property of ['cropShopOpen', 'toolShopOpen', 'plantingTree', 'resetArmed']) {
    ui[property] = true;
    assert.equal(objectTarget(session, ui), null);
    ui[property] = false;
  }
  for (const tab of ['tools', 'orders']) {
    ui.tab = tab;
    assert.equal(objectTarget(session, ui), null);
  }
  ui.tab = 'manage';
  session.mode = 'corrupt';
  assert.equal(objectTarget(session, ui), null);
});
test('tree and natural-resource buttons dispatch only the existing authorized domain commands', () => {
  const { ui, session, handlers, commands } = fixture();
  ui.selectedResource = { kind: 'tree', id: 't1' };
  let list = actions(session, ui, handlers);
  assert.equal(list[0].icon, 'axe');
  list[0].run();
  ui.selectedResource = { kind: 'natural', id: 'n1' };
  list = actions(session, ui, handlers);
  assert.equal(list[0].icon, 'digging-pickaxe');
  list[0].run();
  assert.deepEqual(commands, [
    { type: 'useTool', tool: 'axe', treeId: 't1' },
    { type: 'gatherNatural', resourceId: 'n1' },
  ]);
  session.reason = () => '仓库已满';
  list = actions(session, ui, handlers);
  assert.equal(list[0].enabled, false);
  assert.equal(list[0].reason, '仓库已满');
});
test('pile pickup, rotation and all shop/dock/order operations retain their original callbacks', () => {
  const { ui, session, handlers, commands } = fixture();
  ui.selectedPile = { x: 7, z: 7 };
  const pile = actions(session, ui, handlers);
  assert.equal(pile.length, 2);
  pile[0].run();
  pile[1].run();
  assert.deepEqual(commands, [
    { type: 'pickupStack', x: 7, z: 7 },
    { type: 'pickupProduct', item: 'wood', x: 7, z: 7 },
  ]);
  ui.selectedPile = null;
  ui.selected = 'b1';
  rotationAction(session, ui, handlers).run();
  assert.equal(commands.at(-1).type, 'rotateBuilding');
  for (const kind of ['shop', 'dock', 'orderBoard']) {
    session.state.buildings[0].kind = kind;
    assert.deepEqual(
      actions(session, ui, handlers).map((a) => a.text),
      commerceActions(session, ui, handlers).map((a) => a.text),
    );
  }
});
