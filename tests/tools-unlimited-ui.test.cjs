const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
// These are isolated presentation logic tests, not Cocos renderer or browser verification.
function presentation(name, dependencies) {
  const filename = path.join(__dirname, '../assets/scripts/presentation', `${name}.ts`);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(
    (id) => {
      if (id === '../domain/game') return game;
      if (id === './InputProvenance') return require('./helpers/input-provenance.cjs');
      assert.ok(Object.hasOwn(dependencies, id), `Missing isolated dependency: ${id}`);
      return dependencies[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
test('tray displays infinity for durability and the real finite fertilizer quantity', () => {
  const labels = Object.fromEntries(game.TOOL_IDS.map((tool) => [tool, tool]));
  const { ToolTray } = presentation('ToolTray', {
    cc: {},
    './Palette': {},
    './Widgets': {},
    './TrayIcons': { TRAY_LABELS: labels },
    './TrayColumn': {},
  });
  const left = { entries: game.TOOL_IDS.map((kind) => ({ kind, text: { string: '' } })) };
  const right = { entries: [], show() {} };
  const state = game.createGame(0);
  for (const tool of game.TOOL_IDS) state.tools[tool] = 0;
  state.tools.fertilizer = 3;
  ToolTray.prototype.setQuantity.call({ left, right }, state.inventory, state.tools);
  for (const entry of left.entries)
    assert.equal(
      entry.text.string,
      entry.kind === 'fertilizer' ? 'fertilizer×3' : `${entry.kind}·∞`,
    );
});
test('tools menu removes replenishment and a stale open shop offers only close', () => {
  const { actions } = presentation('HudActions', {
    './TrayIcons': { TRAY_LABELS: {} },
    './CommercePanel': { commerceActions: () => null },
    './RouteActions': require('./helpers/selection-ui.cjs').load('RouteActions'),
  });
  const session = { mode: 'normal', state: game.createGame(0) };
  const handlers = { cancel() {} };
  const menu = actions(session, { tab: 'tools', profile: 'normal' }, handlers);
  assert.ok(menu.every((action) => !/补给|补充|10币|耐久/.test(action.text)));
  const stale = actions(session, { toolShopOpen: true }, handlers);
  assert.deepEqual(
    stale.map((action) => action.text),
    ['关闭'],
  );
  assert.equal(stale[0].run, handlers.cancel);
});
test('old zero-durability tools start gestures instead of opening a refill shop', () => {
  const starts = [];
  class Gesture {
    begin(...args) {
      starts.push(args);
    }
  }
  const { ToolRouter } = presentation('ToolRouter', {
    './FarmTools': { FarmTools: Gesture },
    './StockDrag': { StockDrag: Gesture },
    './ToolUseDrag': { ToolUseDrag: Gesture },
  });
  const state = game.createGame(0);
  for (const tool of game.TOOL_IDS) state.tools[tool] = 0;
  const ui = {};
  const session = { mode: 'normal', state, message: '' };
  const router = new ToolRouter({}, session, {}, {}, ui, () => {});
  for (const tool of game.ACTIVE_TOOLS) assert.equal(router.begin(tool, 1, { x: 0, y: 0 }), true);
  assert.equal(starts.length, game.ACTIVE_TOOLS.length);
  assert.equal(ui.toolShopOpen, undefined);
  for (const tool of ['fertilizer']) assert.equal(router.begin(tool, 1, {}), false);
});
