/** Production HUD layout, map capture and command routes with narrow non-GPU UI adapters. */
const { load: source } = require('./farm-picking-ui.cjs');
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
  }
}
function fixture(width = 1200, height = 800, dpr = 1, hooks = {}) {
  const screen = {
    windowSize: { width: width * dpr, height: height * dpr },
    devicePixelRatio: dpr,
  };
  const design = { width, height };
  class Node {
    static EventType = {
      TOUCH_START: 'start',
      TOUCH_MOVE: 'move',
      TOUCH_END: 'end',
      TOUCH_CANCEL: 'cancel',
      MOUSE_WHEEL: 'wheel',
    };
    constructor(name) {
      this.name = name;
      this.children = [];
      this.components = [];
      this.events = new Map();
      this.position = new Vec3();
      this.active = true;
    }
    get activeInHierarchy() {
      return this.active && (!this.parent || this.parent.activeInHierarchy);
    }
    addChild(node) {
      this.children.push(node);
      node.parent = this;
    }
    getChildByName(name) {
      return this.children.find((n) => n.name === name) ?? null;
    }
    addComponent(Type) {
      const component = new Type();
      component.node = this;
      this.components.push(component);
      return component;
    }
    getComponent(Type) {
      return this.components.find((c) => c instanceof Type) ?? null;
    }
    setPosition(x, y, z = 0) {
      this.position = typeof x === 'object' ? { ...x } : { x, y, z };
    }
    setRotationFromEuler() {}
    setScale() {}
    lookAt() {}
    on(type, fn, self) {
      this.events.set(type, [...(this.events.get(type) ?? []), (event) => fn.call(self, event)]);
    }
    off(type) {
      this.events.delete(type);
    }
    emit(type, event) {
      for (const fn of this.events.get(type) ?? []) fn(event);
    }
    destroy() {
      this.active = false;
      this.destroyed = true;
    }
  }
  class UITransform {
    setContentSize(width, height) {
      Object.assign(this, { width, height });
    }
    hitTest(point) {
      let x = design.width / 2,
        y = design.height / 2;
      for (let n = this.node; n; n = n.parent) {
        x += n.position.x;
        y += n.position.y;
      }
      const scale = screen.devicePixelRatio;
      return (
        Math.abs(point.x / scale - x) <= this.width / 2 &&
        Math.abs(point.y / scale - y) <= this.height / 2
      );
    }
  }
  class Camera {
    static ProjectionType = { ORTHO: 0 };
    static ClearFlag = { SOLID_COLOR: 0 };
    constructor() {
      this.camera = { update() {} };
    }
  }
  const cc = {
    Node,
    Vec2,
    Vec3,
    UITransform,
    Camera,
    screen,
    geometry: { Ray: class {} },
    Layers: { Enum: { DEFAULT: 1 } },
    Rect: class {
      constructor(x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    },
    ResolutionPolicy: { SHOW_ALL: 1 },
    view: {
      setDesignResolutionSize(width, height) {
        Object.assign(design, { width, height });
      },
    },
  };
  class ModelFactory {
    building() {
      return new Node('Ghost');
    }
    shape(parent, name) {
      const node = new Node(name);
      parent.addChild(node);
      return node;
    }
    asset() {
      return new Node('Asset');
    }
    dispose() {}
  }
  const dependencies = {
    cc,
    './ModelFactory': { ModelFactory },
    './PileModel': { pileModel: () => new Node('Pile') },
    './Palette': { color: (v) => v },
    './SceneLighting': { fitTownShadowDepth() {} },
    './InputProvenance': require('./input-provenance.cjs'),
    './UiContracts': source('UiContracts'),
  };
  const load = (name, extra = {}) => source(name, { ...dependencies, ...extra });
  const { TownHUD } = load('TownHUD'),
    { ResourceCounters } = load('ResourceCounters'),
    { MapCamera } = load('MapCamera'),
    { TownController } = load('TownController');
  const node = (name, parent) => {
    const n = new Node(name);
    n.addComponent(UITransform);
    parent?.addChild(n);
    return n;
  };
  const root = new Node('Root'),
    canvas = node('Canvas', root),
    top = node('Summary', canvas),
    input = node('MapInput', canvas);
  const settingsNode = node('Settings', canvas);
  const resources = Object.assign(Object.create(ResourceCounters.prototype), {
    parent: top,
    icons: [],
    values: [],
  });
  const hud = Object.assign(Object.create(TownHUD.prototype), {
    canvas,
    // This summary-only fixture retains the zero-inset desktop frame.
    controls: {
      root: canvas,
      layout: (width, height) => ({ x: 0, y: 0, width, height }),
      contains: (point) => input.getComponent(UITransform).hitTest(point),
    },
    top,
    mapInput: input,
    resources,
    lastData: null,
    settings: {
      node: settingsNode,
      cancelGesture() {},
      layout(x, y, width, options) {
        settingsNode.setPosition(x, y);
        settingsNode.getComponent(UITransform).setContentSize(width, options.height);
      },
    },
    tools: { layout() {}, covers: () => false },
    handbook: { layout() {}, covers: () => false, cancelGesture() {} },
    bottom: { layout() {}, covers: () => false, cancel() {}, noticeY: 0 },
    radial: { layout() {}, covers: () => false, cancel() {} },
    message: { layout() {} },
    cancelTools() {},
  });
  const map = new MapCamera(
    root,
    input,
    {
      covered: (p) => hud.coversMapPoint(p),
      candidate: () => null,
      tap() {},
      drag() {},
      drop() {},
      cancel() {},
      ...hooks,
    },
    1,
  );
  map.screenRay = (p) => ({ o: { x: p.x, y: 20, z: p.y }, d: { x: 0, y: -1, z: 0 } });
  const controller = Object.assign(Object.create(TownController.prototype), {
    hud,
    map,
    deferredLayout: { clear() {} },
  });
  function resize(w, h, ratio = screen.devicePixelRatio) {
    screen.devicePixelRatio = ratio;
    Object.assign(screen.windowSize, { width: w * ratio, height: h * ratio });
    controller.layout();
  }
  resize(width, height, dpr);
  function summary() {
    const { width, height } = top.getComponent(UITransform),
      ratio = screen.devicePixelRatio;
    const x = (design.width / 2 + top.position.x) * ratio,
      y = (design.height / 2 + top.position.y) * ratio;
    return {
      x,
      y,
      left: x - (width * ratio) / 2,
      right: x + (width * ratio) / 2,
      bottom: y - (height * ratio) / 2,
      top: y + (height * ratio) / 2,
    };
  }
  function touch(type, point, id = 1) {
    const event = {
      target: input,
      getAllTouches: () => [{ getID: () => id }],
      getID: () => id,
      getLocation: () => point,
      getUILocation: () => ({
        x: point.x / screen.devicePixelRatio,
        y: point.y / screen.devicePixelRatio,
      }),
      getEventCode: () => type,
    };
    if (type !== 'move') canvas.emit(type, event);
    input.emit(type, event);
  }
  return { hud, map, controller, load, root, Node, screen, top, canvas, summary, resize, touch };
}
module.exports = { fixture };
