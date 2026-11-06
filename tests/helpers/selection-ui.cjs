/** Narrow Cocos collaborators; executes production radial controls, HUD routing and drags. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ts = require('typescript');
class Node {
  static EventType = {
    TOUCH_START: 'start',
    TOUCH_MOVE: 'move',
    TOUCH_END: 'end',
    TOUCH_CANCEL: 'cancel',
  };
  active = true;
  children = [];
  components = [];
  events = new Map();
  position = { x: 0, y: 0 };
  worldMatrix = { x: 0, y: 0, z: 0, angle: 0, scale: 1 };
  constructor(name = '') {
    this.name = name;
  }
  get activeInHierarchy() {
    return this.active && (!this.parent || this.parent.activeInHierarchy);
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
  getComponentsInChildren(Type) {
    return [
      ...this.components.filter((c) => c instanceof Type),
      ...this.children.flatMap((n) => n.getComponentsInChildren(Type)),
    ];
  }
  setPosition(x, y) {
    this.position = { x, y };
  }
  on(type, listener) {
    this.events.set(type, [...(this.events.get(type) ?? []), listener]);
  }
  emit(type, event) {
    for (const listener of this.events.get(type) ?? []) listener(event);
  }
  destroy() {
    this.destroyed = true;
    this.active = false;
  }
}
class UITransform {
  setContentSize(width, height) {
    Object.assign(this, { width, height });
  }
  hitTest(p) {
    const n = this.node.position;
    return Math.abs(p.x - n.x) <= this.width / 2 && Math.abs(p.y - n.y) <= this.height / 2;
  }
}
class Label {
  static Overflow = { SHRINK: 1 };
  static HorizontalAlign = { LEFT: 0, CENTER: 1 };
  static VerticalAlign = { CENTER: 1 };
}
class LabelOutline {}
class Graphics {
  clear() {}
  roundRect() {}
  fill() {}
  ellipse() {}
  stroke() {}
}
class Vec2 {
  constructor(x, y) {
    Object.assign(this, { x, y });
  }
}
class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.set(x, y, z);
  }
  set(x, y, z) {
    Object.assign(this, { x, y, z });
    return this;
  }
  static transformMat4(out, p, m) {
    const { x, y, z } = p,
      c = Math.cos(m.angle),
      s = Math.sin(m.angle);
    return out.set(
      m.x + (x * c - z * s) * m.scale,
      m.y + y * m.scale,
      m.z + (x * s + z * c) * m.scale,
    );
  }
}
class MeshRenderer {
  enabled = true;
}
class ActionArtwork {
  bind() {}
  dispose() {}
}
const cc = {
  Node,
  UITransform,
  Label,
  LabelOutline,
  Graphics,
  Vec2,
  Vec3,
  MeshRenderer,
  Mesh: class {},
  gfx: { AttributeName: { ATTR_POSITION: 'positions' } },
  Layers: { Enum: { UI_2D: 1 } },
  view: { getViewportRect: () => ({ x: 0, y: 0 }), getScaleX: () => 1, getScaleY: () => 1 },
};
const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, `assets/scripts/presentation/${name}.ts`), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === 'cc') return cc;
      if (id === './ModelFactory')
        return {
          ModelFactory: class {
            building() {
              return new Node('Ghost');
            }
            shape(parent, name) {
              const node = new Node(name);
              parent.addChild(node);
              return node;
            }
            dispose() {}
          },
        };
      if (id === './PileModel') return { pileModel: () => new Node('Pile') };
      if (id === './ActionArtwork') return { ActionArtwork, actionIcon: () => 'manage' };
      if (id === './Palette') return { PALETTE: {}, color: (c) => c };
      if (id.startsWith('../')) return require(path.join(root, `.domain-build/${id.slice(3)}.js`));
      return load(id.slice(2));
    },
    module,
    module.exports,
  );
  cache[name] = module.exports;
  return module.exports;
}
function event(id = 1, x = 0, y = 0, touches = 1) {
  return {
    getID: () => id,
    getUILocation: () => ({ x, y }),
    getAllTouches: () => Array(touches).fill({}),
  };
}
function tap(button) {
  button.node.emit('start', event());
  button.node.emit('end', event());
}

module.exports = { load, Node, event, tap };
