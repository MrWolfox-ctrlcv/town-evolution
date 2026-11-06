/** Shared valid demo state and production input/HUD coordinators; no GPU scene. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { load, Node, event, tap } = require('./selection-ui.cjs');
const game = require('../../.domain-build/domain/game');
const { GameSession } = require('../../.domain-build/application/GameSession');
const { RadialActions } = load('RadialActions');
const { BuildingDrag } = load('BuildingDrag');
const { StackDrag } = load('StackDrag');
const { createUiState } = load('UiContracts');
const { objectTarget, pickObject } = load('ObjectContext');
const { actions, rotationAction } = load('HudActions');
const { description } = load('HudDescription');
// Call production coordinator methods without initializing an unrelated rendering scene.
function coordinator(name) {
  const moduleData = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  )(
    (id) =>
      id.startsWith('../')
        ? require(`../../.domain-build/${id.slice(3)}.js`)
        : id === './UiContracts'
          ? load('UiContracts')
          : {},
    moduleData,
    moduleData.exports,
  );
  return moduleData.exports;
}
const { TownHUD } = coordinator('TownHUD');
const { TownController } = coordinator('TownController');
const baseline = game.createDemoGame(100000);
function fixture() {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  const session = new GameSession(
    storage,
    () => 100000,
    () => structuredClone(baseline),
  );
  assert.ok(session.save());
  const ui = createUiState(),
    commands = [];
  const menu = new RadialActions(new Node('Canvas'), () => {});
  menu.open();
  const bottom = [];
  const hud = Object.assign(Object.create(TownHUD.prototype), {
    handbook: { setState() {} },
    resources: { render() {} },
    tools: { setQuantity() {} },
    bottom: { render: (d) => bottom.push(d), noticeY: 0 },
    radial: menu,
    message: { render() {} },
  });
  const handlers = {
    command: (c) => {
      commands.push(c);
      session.run(c);
      render();
    },
  };
  function render() {
    hud.render({
      state: session.state,
      inventory: session.state.inventory,
      tools: session.state.tools,
      summary: '',
      message: session.statusMessage,
      detail: description(session, ui),
      tab: ui.tab,
      target: objectTarget(session, ui),
      actions: actions(session, ui, handlers),
      rotation: rotationAction(session, ui, handlers),
    });
    menu.project(
      [
        { x: 155, y: 382 },
        { x: 235, y: 472 },
      ],
      [],
    );
  }
  const town = {
    pickBuilding: (r, exclude) => (r.buildingId === exclude ? null : (r.buildingId ?? null)),
    pickStack: (r, exclude) => (r.pile?.id === exclude ? null : (r.pile ?? null)),
    pickTree: (r) => r.treeId ?? null,
    pickNatural: (r) => r.resourceId ?? null,
    setLifted() {},
    setLiftedStack() {},
  };
  const products = { acceptsProductDrop: (p) => !!p.returning, highlightProductDrop() {} };
  const building = new BuildingDrag(new Node('World'), session, ui, town, render);
  const stack = new StackDrag(new Node('World'), session, ui, town, render, products);
  function ray(target, kind = 'building') {
    return {
      o: { x: target.x + 0.5, y: 20, z: target.z + 0.5 },
      d: { x: 0, y: -1, z: 0 },
      ...(kind === 'building'
        ? { buildingId: target.id }
        : kind === 'pile'
          ? { pile: { ...target, id: `pile:${target.x}:${target.z}` } }
          : kind === 'tree'
            ? { treeId: target.id }
            : { resourceId: target.id }),
    };
  }
  function choose(target, kind) {
    pickObject(ui, town, ray(target, kind));
    render();
  }
  function lift(drag, source, kind) {
    const r = ray(source, kind),
      id = drag.candidate(r);
    assert.ok(id);
    menu.setSuppressed(true);
    drag.move(id, { x: source.x + 0.5, y: 0, z: source.z + 0.5 }, r, {});
    return id;
  }
  function finish(drag, id, r, screen = {}) {
    drag.drop(id, r, screen);
    menu.setSuppressed(false);
    render();
  }
  return {
    town,
    products,
    session,
    storage,
    data,
    ui,
    menu,
    bottom,
    commands,
    building,
    stack,
    ray,
    choose,
    lift,
    finish,
    render,
    shown: () => menu.buttons.filter((b) => b.node.activeInHierarchy),
  };
}
function assertExclusive(ui, target) {
  assert.equal(ui.selected, target?.kind === 'building' ? target.id : null);
  assert.deepEqual(ui.selectedPile, target?.kind === 'pile' ? { x: target.x, z: target.z } : null);
  assert.deepEqual(
    ui.selectedResource,
    target && ['tree', 'natural'].includes(target.kind) ? target : null,
  );
}

module.exports = {
  fixture,
  assertExclusive,
  game,
  GameSession,
  load,
  Node,
  event,
  tap,
  TownController,
  baseline,
};
