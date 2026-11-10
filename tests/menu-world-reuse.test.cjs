/** Executes production menu lifecycle with narrow CPU collaborators, not rendered acceptance. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(name, deps) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    },
  ).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) => deps[id] ?? {},
    module,
    module.exports,
  );
  return module.exports[name];
}
test('settings and saves with a live session never construct a replacement demo world', () => {
  let created = 0,
    disposed = 0,
    rendered = 0;
  const StartScreen = load('StartScreen', {
    cc: {
      screen: { devicePixelRatio: 1, windowSize: { width: 390, height: 844 } },
      view: { setDesignResolutionSize() {} },
      ResolutionPolicy: { SHOW_ALL: 0 },
    },
    '../application/StartMenu': { startMenu: () => ({ actions: [] }) },
    '../application/StartLayout': { startLayout: () => ({}) },
    './StartArtwork': {
      StartArtwork: class {
        constructor() {
          created++;
        }
        layout() {}
        dispose() {
          disposed++;
        }
      },
    },
  });
  const menu = Object.assign(Object.create(StartScreen.prototype), {
    flow: { page: 'settings', session: { state: {} } },
    currentPage: 'settings',
    canvas: { getComponent: () => ({ setContentSize() {} }) },
    controls: { layout: () => ({ width: 390, height: 844 }) },
    root: {},
    content: {},
    buttons: [],
    imageMenu: {
      render() {
        rendered++;
      },
    },
  });
  for (const page of ['settings', 'saves', 'slot', 'confirm', 'settings']) {
    menu.flow.page = page;
    menu.render();
  }
  assert.equal(created, 0);
  assert.equal(rendered, 5);
  menu.flow.session = null;
  menu.flow.inspect = () => ({ state: {} });
  menu.render();
  menu.render();
  assert.equal(created, 1, 'sessionless menus retain a single real demo background');
  menu.flow.session = { state: {} };
  menu.render();
  assert.equal(disposed, 1);
  assert.equal(menu.artwork, null);
});
test('overlay keeps the existing world but disables gameplay HUD; returning reuses its controller', () => {
  const Bootstrap = load('TownBootstrap', {
    cc: { Component: class {}, _decorator: { ccclass: () => (Type) => Type } },
  });
  const session = {},
    modes = [];
  const controller = { setMenuOverlay: (open) => modes.push(open), layout() {}, resume() {} };
  const stage = { active: true };
  const boot = Object.assign(Object.create(Bootstrap.prototype), {
    controller,
    controllerSession: session,
    stage,
    flow: { session, page: 'settings', consumeTownActions: () => false },
    menu: { root: {}, render() {}, hide() {} },
  });
  for (const page of ['settings', 'saves', 'confirm', 'game']) {
    boot.flow.page = page;
    boot.render();
    assert.equal(boot.stage, stage);
    assert.equal(stage.active, true);
    assert.equal(boot.controller, controller);
  }
  assert.deepEqual(modes, [true, true, true, false]);
});
