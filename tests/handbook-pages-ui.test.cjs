/** Real HandbookPages, HandbookDiagram and ActionButton touch chain.
 * Cocos nodes/drawing and HandbookArt are narrow recording doubles, not GPU rendering. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
const NOW = 60000;
class Node {
  static EventType = {
    TOUCH_START: 'start',
    TOUCH_MOVE: 'move',
    TOUCH_END: 'end',
    TOUCH_CANCEL: 'cancel',
  };
  constructor(name) {
    this.name = name;
    this.children = [];
    this.components = [];
    this.events = new Map();
    this.active = true;
  }
  addChild(n) {
    n.parent = this;
    this.children.push(n);
  }
  addComponent(Type) {
    const c = new Type();
    c.node = this;
    this.components.push(c);
    return c;
  }
  getComponent(Type) {
    return this.components.find((c) => c instanceof Type) ?? null;
  }
  getComponentInChildren(Type) {
    return (
      this.getComponent(Type) ??
      this.children.map((c) => c.getComponentInChildren(Type)).find(Boolean) ??
      null
    );
  }
  get activeInHierarchy() {
    return this.active && (!this.parent || this.parent.activeInHierarchy);
  }
  setPosition() {}
  setScale() {}
  removeFromParent() {
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  destroy() {
    this.destroyed = true;
  }
  on(type, callback) {
    this.events.set(type, [...(this.events.get(type) ?? []), callback]);
  }
  emit(type, event) {
    for (const callback of this.events.get(type) ?? []) callback(event);
  }
}
class UITransform {
  setContentSize() {}
}
class Graphics {
  clear() {}
  roundRect() {}
  fill() {}
  stroke() {}
  moveTo() {}
  lineTo() {}
}
class Label {
  static Overflow = { SHRINK: 1 };
  static HorizontalAlign = { LEFT: 0, CENTER: 1 };
  static VerticalAlign = { CENTER: 1 };
}
class RecordingArt {
  tab() {}
  navigationButton() {}
  clear() {}
  icon(parent, kind) {
    const node = new Node('RecordedIcon');
    node.icon = kind;
    parent.addChild(node);
  }
  caption(parent, text) {
    const node = new Node('RecordedCaption');
    node.caption = text;
    parent.addChild(node);
  }
}
const dependencies = {
  cc: {
    Node,
    UITransform,
    Graphics,
    Label,
    LabelOutline: class {},
    Layers: { Enum: { UI_2D: 1 } },
  },
  './Palette': { PALETTE: {}, color: (v) => v },
  './ActionArtwork': {},
  './HandbookArt': { HandbookArt: RecordingArt },
};
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const { outputText } = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    },
  );
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith('../')) return require(`../.domain-build/${id.slice(3)}.js`);
      assert.ok(id.startsWith('./'), id);
      return load(id.slice(2));
    },
    module,
    module.exports,
  );
  cache.set(name, module.exports);
  return module.exports;
}
const { HandbookPages } = load('HandbookPages');
const { uiNode, ActionButton } = load('Widgets');
const ids = game.ACTIVE_RECIPE_DEFINITIONS.map((recipe) => recipe.id);
const expected = {
  'gather-soil': [
    ['soilMound', 1],
    ['diggingTool', 1],
    ['soil', 9],
  ],
  'gather-stone': [
    ['stoneDeposit', 1],
    ['diggingTool', 1],
    ['stone', 1],
  ],
  'water-soil': [
    ['soil', 9],
    ['wateringCan', 1],
    ['mud', 1],
  ],
  'expand-land': [
    ['mud', 9],
    ['reclaimedLand', 1],
  ],
  'build-residence': [
    ['house', 1],
    ['mud', 1],
    ['hammer', 1],
    ['residence', 1],
  ],
};
const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const captions = (node) =>
  descendants(node)
    .filter((n) => n.caption !== undefined)
    .map((n) => n.caption);
const icons = (node) =>
  descendants(node)
    .filter((n) => n.icon !== undefined)
    .map((n) => n.icon);
function fixture(state) {
  const root = new Node('Canvas');
  const directory = uiNode('Directory', root),
    paper = uiNode('Paper', root),
    content = uiNode('Content', paper);
  const buttons = [];
  let opened = 0;
  const pages = new HandbookPages(
    directory,
    paper,
    content,
    new RecordingArt(),
    buttons,
    () => opened++,
  );
  pages.setState(state);
  function tap(name) {
    const button = buttons.find((b) => b.node.name === name && b.node.activeInHierarchy);
    assert.ok(button instanceof ActionButton, `real active button ${name}`);
    const event = {
      getID: () => 1,
      getAllTouches: () => [{}],
      getUILocation: () => ({ x: 0, y: 0 }),
    };
    button.node.emit('start', event);
    button.node.emit('end', event);
    button.node.emit('end', event); // Duplicate release must not advance twice.
  }
  const rows = () =>
    buttons
      .filter((b) => b.node.name.startsWith('RecipeCategory-') && b.node.activeInHierarchy)
      .map((b) => b.node);
  const texts = (node) =>
    descendants(node).flatMap((n) =>
      n.components.filter((c) => c instanceof Label).map((c) => c.string),
    );
  function choose(id) {
    for (
      let page = 0;
      page < Math.ceil(ids.length / 4) && !rows().some((n) => n.name === `RecipeCategory-${id}`);
      page++
    )
      tap('RecipeDirectoryNext');
    tap(`RecipeCategory-${id}`);
    assert.ok(texts(paper).includes(`${ids.indexOf(id) + 1} / ${ids.length}`));
  }
  return {
    pages,
    root,
    directory,
    paper,
    tap,
    rows,
    texts,
    choose,
    opened: () => opened,
    diagram: descendants(content).find((n) => n.name === 'RecipeDiagram'),
  };
}
function assertIllustration(node, parts, detail = false, count = 1) {
  assert.deepEqual(
    icons(node),
    parts.map(([kind]) => kind),
  );
  const slots = descendants(node).filter((n) => n.name.startsWith('RecipeItem-'));
  assert.equal(slots.length, parts.length);
  parts.forEach(([kind, amount], i) => {
    assert.equal(slots[i].name, `RecipeItem-${kind}`);
    assert.deepEqual(captions(slots[i]), amount > 1 ? [`×${amount}`] : []);
  });
  assert.equal(
    captions(node).some((text) => text.includes('?')),
    false,
  );
  if (detail) assert.ok(captions(node).includes(`✓ ×${count}`));
  else assert.equal(captions(node).filter((text) => text === '=').length, 1);
}
function commandFor(state, id) {
  if (id === 'gather-soil' || id === 'gather-stone')
    return {
      type: 'gatherNatural',
      resourceId: state.naturalResources.find(
        (n) => n.kind === (id === 'gather-soil' ? 'soil' : 'stone'),
      ).id,
    };
  if (id === 'water-soil') {
    const sources = state.groundStacks
      .filter((p) => p.item === 'soil')
      .map(({ x, z }) => ({ x, z }));
    return { type: 'useTool', tool: 'wateringCan', ...sources[0], sources };
  }
  if (id === 'build-residence')
    return [
      {
        type: 'attachMaterial',
        buildingId: state.buildings.find((b) => b.kind === 'house').id,
        item: 'mud',
        quantity: 1,
        source: state.groundStacks.find((p) => p.item === 'mud'),
      },
      {
        type: 'useTool',
        tool: 'hammer',
        buildingId: state.buildings.find((b) => b.kind === 'house').id,
      },
    ];
  const mud = state.groundStacks.find((p) => p.item === 'mud' && p.amount === 9);
  for (let z = 1; z < 39; z++)
    for (let x = 1; x < 39; x++) {
      const command = { type: 'expandLand', fromX: mud.x, fromZ: mud.z, x, z };
      if (game.dispatch(state, command, NOW).ok) return command;
    }
  throw new Error('No valid reclaimable shore');
}
test('real handbook buttons show all active recipes in four-entry pages, wrap both ways and select every matching detail', () => {
  const state = game.createDemoGame(NOW),
    before = game.exportSave(state),
    f = fixture(state);
  let selected = 0;
  for (let page = 0; page < Math.ceil(ids.length / 4); page++) {
    const slice = ids.slice(page * 4, page * 4 + 4);
    assert.deepEqual(
      f.rows().map((n) => n.name),
      slice.map((id) => `RecipeCategory-${id}`),
    );
    assert.ok(f.texts(f.directory).includes(`${page + 1} / ${Math.ceil(ids.length / 4)}`));
    for (const id of slice) {
      f.choose(id);
      selected++;
      assert.equal(f.opened(), selected);
    }
    f.tap('RecipeDirectoryNext');
  }
  assert.ok(f.texts(f.directory).includes(`1 / ${Math.ceil(ids.length / 4)}`));
  for (let page = Math.ceil(ids.length / 4); page >= 1; page--) {
    f.tap('RecipeDirectoryPrevious');
    assert.ok(f.texts(f.directory).includes(`${page} / ${Math.ceil(ids.length / 4)}`));
  }
  f.choose(ids[0]);
  for (let i = 1; i <= ids.length * 2; i++) {
    f.tap('RecipePrevious');
    assert.ok(
      f
        .texts(f.paper)
        .includes(`${((ids.length - (i % ids.length)) % ids.length) + 1} / ${ids.length}`),
    );
  }
  for (let i = 1; i <= ids.length * 2; i++) {
    f.tap('RecipeNext');
    assert.ok(f.texts(f.paper).includes(`${(i % ids.length) + 1} / ${ids.length}`));
  }
  for (let i = 0; i < 3; i++) {
    const reopened = fixture(state);
    reopened.choose(ids.at(-1));
    reopened.tap('RecipeNext');
  }
  assert.equal(game.exportSave(state), before);
});
for (const [id, parts] of Object.entries(expected))
  test(`${id}: hidden rows/details reveal exact icons and quantities only after dispatch and save reload`, () => {
    const state = game.createDemoGame(NOW);
    state.inventory = emptyStock();
    const f = fixture(state),
      before = game.exportSave(state);
    f.choose(id);
    const row = () => f.rows().find((n) => n.name === `RecipeCategory-${id}`);
    assert.deepEqual(icons(row()), []);
    assert.deepEqual(captions(row()), ['?   +   ?   =   ?']);
    assert.deepEqual(icons(f.diagram), []);
    assert.deepEqual(captions(f.diagram), ['?', '?  +  ?  =  ?']);
    assert.ok(descendants(f.diagram).some((n) => n.name === 'RecipeUnknown'));
    assert.ok(f.texts(f.directory).includes(`✓  0 / ${ids.length}`));
    assert.equal(game.exportSave(state), before);
    let result = { ok: true, state };
    for (const command of [commandFor(state, id)].flat()) {
      result = game.dispatch(result.state, command, NOW);
      assert.equal(result.ok, true, result.error);
      if (command.type === 'attachMaterial')
        assert.equal(result.state.fusion.discoveries[id], undefined);
    }
    assert.equal(result.ok, true, result.error);
    assert.equal(result.state.fusion.discoveries[id].count, 1);
    f.pages.setState(result.state);
    assertIllustration(row(), parts);
    assertIllustration(f.diagram, parts, true);
    assert.ok(f.texts(f.directory).includes(`✓  1 / ${ids.length}`));
    const save = game.exportSave(result.state),
      restored = game.importSave(save, NOW);
    assert.deepEqual(restored, result.state);
    for (let i = 0; i < 3; i++) {
      const reopened = fixture(restored);
      reopened.choose(id);
      assertIllustration(
        reopened.rows().find((n) => n.name === `RecipeCategory-${id}`),
        parts,
      );
      assertIllustration(reopened.diagram, parts, true);
      reopened.tap('RecipeNext');
      reopened.tap('RecipePrevious');
      assertIllustration(reopened.diagram, parts, true);
    }
    assert.equal(game.exportSave(restored), save);
    assert.equal(game.exportSave(result.state), save);
    assert.equal(game.exportSave(state), before);
  });

test('fertilizer discovery shows a five-input alternative pool with one total count, not two mandatory carrots', () => {
  const state = game.createDemoGame(NOW);
  const barrel = state.buildings.find((b) => b.kind === 'compostBarrel');
  const f = fixture(state);
  f.choose('make-fertilizer');
  assert.deepEqual(icons(f.diagram), []);
  let result = game.dispatch(
    state,
    {
      type: 'depositCompost',
      buildingId: barrel.id,
      quantity: 1,
      source: { type: 'inventory', item: 'treeSeed', amount: state.inventory.treeSeed },
    },
    NOW,
  );
  assert.equal(result.ok, true, result.error);
  const job = result.state.buildings.find((b) => b.id === barrel.id).compost.job;
  result = game.dispatch(
    result.state,
    { type: 'collectCompost', buildingId: barrel.id, jobId: job.id },
    job.readyAt,
  );
  assert.equal(result.ok, true, result.error);
  const saved = game.exportSave(result.state);
  f.pages.setState(game.importSave(saved, job.readyAt));
  assert.deepEqual(icons(f.diagram), [...game.COMPOST_ITEMS, 'fertilizer']);
  assert.equal(
    captions(f.diagram).filter((t) => t === `×${game.COMPOST_BALANCE.inputAmount}`).length,
    1,
  );
  assert.equal(captions(f.diagram).filter((t) => t === '/').length, 4);
  assert.ok(!captions(f.diagram).some((t) => /胡萝卜|作物|树种|必须/.test(t)));
  assert.equal(game.exportSave(result.state), saved);
});
