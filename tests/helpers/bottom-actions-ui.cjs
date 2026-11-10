/** Production HUD action construction and bottom-panel/button listeners.
 * Scene nodes, layout hit-testing, artwork and tween timing are narrow doubles.
 * Tests record callbacks; this is not a renderer, browser or device test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
class Node {
  static EventType = {
    TOUCH_START: 'start',
    TOUCH_MOVE: 'move',
    TOUCH_END: 'end',
    TOUCH_CANCEL: 'cancel',
  };
  constructor(name) {
    Object.assign(this, {
      name,
      children: [],
      components: [],
      events: new Map(),
      active: true,
      position: { x: 0, y: 0, z: 0 },
    });
  }
  addChild(node) {
    node.parent = this;
    this.children.push(node);
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
  getChildByName(name) {
    return this.children.find((n) => n.name === name) ?? null;
  }
  get activeInHierarchy() {
    return this.active && (!this.parent || this.parent.activeInHierarchy);
  }
  get worldPosition() {
    const p = this.parent?.worldPosition ?? { x: 0, y: 0 };
    return { x: p.x + this.position.x, y: p.y + this.position.y };
  }
  setPosition(x, y, z = 0) {
    this.position = typeof x === 'object' ? x : { x, y, z };
  }
  setScale() {}
  on(type, fn, owner, capture = false) {
    this.events.set(type, [...(this.events.get(type) ?? []), { fn, owner, capture }]);
  }
  emit(type, e, capture = false) {
    for (const l of this.events.get(type) ?? []) if (l.capture === capture) l.fn.call(l.owner, e);
  }
}
class UITransform {
  setContentSize(width, height) {
    Object.assign(this, { width, height });
  }
  hitTest(p) {
    const c = this.node.worldPosition;
    return Math.abs(p.x - c.x) <= this.width / 2 && Math.abs(p.y - c.y) <= this.height / 2;
  }
}
class Graphics {
  clear() {}
  roundRect() {}
  fill() {}
  ellipse() {}
  stroke() {}
}
class Label {
  static Overflow = { SHRINK: 1 };
  static HorizontalAlign = { LEFT: 0, CENTER: 1 };
  static VerticalAlign = { CENTER: 1 };
}
class Vec {
  constructor(x, y, z = 0) {
    Object.assign(this, { x, y, z });
  }
}
class Ornament {
  constructor() {
    this.data = null;
  }
  layout() {}
  render(data) {
    this.data = data;
  }
  setState() {}
  cancel() {}
  cancelGesture() {}
  close() {}
  open() {}
  covers() {
    return false;
  }
  regions() {
    return [];
  }
}
class IdleDrag {
  begin() {
    assert.fail('Empty stock must never start a drag');
  }
  cancel() {}
}
class Artwork {
  bind() {}
  dispose() {}
}
const screen = { windowSize: { width: 390, height: 844 }, devicePixelRatio: 1 };
const dependencies = {
  cc: {
    Node,
    UITransform,
    Graphics,
    Label,
    LabelOutline: class {},
    UIOpacity: class {},
    Canvas: class {},
    Camera: class {
      static ProjectionType = { ORTHO: 1 };
      static ClearFlag = { DEPTH_ONLY: 1 };
    },
    Layers: { Enum: { UI_2D: 1 } },
    Vec2: Vec,
    Vec3: Vec,
    screen,
    ResolutionPolicy: {},
    view: { resizeWithBrowserSize() {}, setDesignResolutionSize() {} },
    Tween: { stopAllByTarget() {} },
    tween(target) {
      return {
        to(_duration, values) {
          this.values = values;
          return this;
        },
        start() {
          Object.assign(target, this.values);
        },
      };
    },
  },
  './Palette': { PALETTE: {}, color: (v) => v },
  './ActionArtwork': { ActionArtwork: Artwork, actionIcon: (text) => text },
  './TrayIcons': {
    TRAY_LABELS: { vegetable: '胡萝卜', wheat: '小麦', lettuce: '生菜' },
    TrayIcons: class {
      draw() {}
    },
  },
  './FarmTools': { FarmTools: IdleDrag },
  './StockDrag': { StockDrag: IdleDrag },
  './ToolUseDrag': { ToolUseDrag: IdleDrag },
  './V6TerrainTool': { V6TerrainTool: IdleDrag },
  './TownView': {},
  './MapCamera': {},
  './ObjectDrag': {},
  './CollectionBinding': {},
  ...Object.fromEntries(
    ['RadialActions', 'StatusToast', 'ResourceCounters', 'CollectionFlights', 'RecipeHandbook'].map(
      (name) => [`./${name}`, { [name]: Ornament }],
    ),
  ),
};
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const { outputText } = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, `../../assets/scripts/presentation/${name}.ts`), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  );
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith('../')) return require(`../../.domain-build/${id.slice(3)}.js`);
      return load(id.slice(2));
    },
    module,
    module.exports,
  );
  cache.set(name, module.exports);
  return module.exports;
}
module.exports = { load, Node, UITransform };
