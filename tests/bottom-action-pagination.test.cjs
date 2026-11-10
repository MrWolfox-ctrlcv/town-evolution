const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, Node, UITransform } = require('./helpers/bottom-actions-ui.cjs');
const { BottomActions } = load('BottomActions');
const { actions } = load('HudActions');
const { createUiState } = load('UiContracts');
function event() {
  return { getID: () => 1, getUILocation: () => ({ x: 0, y: 0 }), getAllTouches: () => [{}] };
}
function tap(b) {
  b.node.emit('start', event());
  b.node.emit('end', event());
}
function fixture(mode = 'farm') {
  const ui = { ...createUiState(), tab: 'tools', profile: 'v6-preview', terrainMode: mode };
  const runs = [];
  const handlers = Object.fromEntries(
    [
      'terrainMode',
      'terrainMaterial',
      'plantTree',
      'openSaves',
      'openCropShop',
      'overview',
      'switchTown',
      'exitToTitle',
    ].map((k) => [k, () => runs.push(k)]),
  );
  const list = actions({ mode: 'normal', state: { terrainVersion: 6 } }, ui, handlers);
  const panel = new BottomActions(
    new Node('Root'),
    () => {},
    () => {},
    () => {},
  );
  const data = { actions: list, rotation: null, tab: 'tools', detail: '' };
  panel.open();
  panel.render(data);
  const shown = () => panel.buttons.filter((b) => b.node.activeInHierarchy);
  const next = () => shown().find((b) => b.action.text.startsWith('更多'));
  return { panel, data, runs, shown, next };
}
test('all real v6 town-affairs actions remain reachable in farm and fill modes', () => {
  for (const mode of ['farm', 'fill']) {
    const f = fixture(mode),
      reached = new Set();
    assert.equal(f.data.actions.length, mode === 'fill' ? 10 : 9);
    const nodes = [...f.panel.buttons];
    for (let page = 0; page < 2; page++) {
      for (const b of f.shown())
        if (!b.action.text.startsWith('更多')) {
          reached.add(b.action.text);
          tap(b);
        }
      assert.ok(f.next(), 'Overflow must provide a next-page control');
      tap(f.next());
    }
    assert.deepEqual(
      [...reached],
      f.data.actions.map((a) => a.text),
    );
    assert.deepEqual(f.panel.buttons, nodes);
    assert.equal(f.runs.length, f.data.actions.length);
  }
});
test('small panels are unchanged and overflow pages use displayed-count layout', () => {
  for (const count of [0, 1, 5, 6, 7, 9, 10, 11])
    for (const [w, h] of [
      [390, 844],
      [844, 390],
    ]) {
      const f = fixture();
      f.data.actions = Array.from({ length: count }, (_, i) => ({
        text: `Action ${i}`,
        run: () => {},
      }));
      f.panel.render(f.data);
      f.panel.layout(w, h);
      assert.equal(f.shown().length, Math.min(count, 6));
      if (count <= 6) assert.equal(f.next(), undefined);
      for (let p = 0; p < (count > 6 ? Math.ceil(count / 5) : 1); p++) {
        const shown = f.shown();
        assert.equal(
          f.panel.screen.actionRows,
          Math.ceil(shown.length / f.panel.screen.actionColumns),
        );
        for (const b of shown) {
          const rect = b.node.getComponent(UITransform);
          assert.ok(Math.abs(b.node.position.x) + rect.width / 2 <= f.panel.screen.panelWidth / 2);
          assert.ok(
            Math.abs(b.node.position.y) + rect.height / 2 <= f.panel.screen.panelHeight / 2,
          );
        }
        if (f.next()) tap(f.next());
      }
    }
});
test('clock refresh keeps page and captured commands; fresh taps use updated closures', () => {
  const f = fixture('fill');
  tap(f.next());
  const first = f.shown()[0],
    text = first.action.text;
  first.node.emit('start', event());
  let latest = 0;
  f.panel.render({
    ...f.data,
    actions: f.data.actions.map((a) => ({ ...a, run: () => latest++ })),
  });
  assert.equal(f.shown()[0].action.text, text);
  first.node.emit('end', event());
  assert.equal(latest, 0);
  assert.equal(f.runs.length, 1);
  tap(first);
  assert.equal(latest, 1);
  assert.equal(f.runs.length, 1);
});
test('page changes, action identity changes and close cancel captured gestures', () => {
  const f = fixture('fill');
  let b = f.shown()[0];
  b.node.emit('start', event());
  tap(f.next());
  b.node.emit('end', event());
  assert.equal(f.runs.length, 0);
  b = f.shown()[0];
  b.node.emit('start', event());
  const updated = {
    ...f.data,
    actions: f.data.actions.map((a, i) => (i === 5 ? { ...a, text: 'Different action' } : a)),
  };
  f.panel.render(updated);
  b.node.emit('end', event());
  assert.equal(f.runs.length, 0);
  b = f.shown()[0];
  b.node.emit('start', event());
  f.panel.close();
  b.node.emit('end', event());
  assert.equal(f.runs.length, 0);
  f.panel.open();
  f.panel.render(updated);
  assert.equal(f.shown()[0].action.text, updated.actions[0].text);
});
test('context and length transitions reset pages and disabled actions still explain', () => {
  for (const patch of [
    { tab: 'manage' },
    { contextHeading: true },
    { actions: fixture().data.actions },
  ]) {
    const f = fixture('fill');
    tap(f.next());
    f.panel.render({ ...f.data, ...patch });
    assert.equal(f.panel.page, 0);
  }
  const f = fixture('fill');
  tap(f.next());
  f.panel.render({ ...f.data, actions: f.data.actions.slice(0, 2) });
  assert.equal(f.shown().length, 2);
  assert.equal(f.next(), undefined);
  const messages = [];
  const p = new BottomActions(
    new Node('Root'),
    (m) => messages.push(m),
    () => {},
    () => {},
  );
  p.open();
  p.render({
    ...f.data,
    actions: [{ text: 'Unavailable', enabled: false, reason: 'Full', run: () => assert.fail() }],
  });
  tap(p.buttons[0]);
  assert.deepEqual(messages, ['Full']);
});
