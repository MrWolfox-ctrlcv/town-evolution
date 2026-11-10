/** Actual controller ground hook, map gesture and stock drag; unrelated UI,
 * tool/object drags, navigation and collection binding are narrow doubles. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { GameSession } = require('../../.domain-build/application/GameSession');
function fixture(state, picker, ray) {
  let ready = true;
  const shapes = [],
    commands = [],
    bytes = new Map();
  let writes = 0;
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
      this.set(x, y, z);
    }
    set(x, y, z) {
      Object.assign(this, { x, y, z });
      return this;
    }
  }
  class Node {
    static EventType = {
      TOUCH_START: 'start',
      TOUCH_MOVE: 'move',
      TOUCH_END: 'end',
      TOUCH_CANCEL: 'cancel',
      MOUSE_WHEEL: 'wheel',
    };
    children = [];
    position = new Vec3();
    constructor(name) {
      this.name = name;
    }
    addChild(node) {
      node.parent = this;
      this.children.push(node);
    }
    addComponent(Type) {
      const result = new Type();
      result.node = this;
      return result;
    }
    setPosition(x, y, z) {
      this.position.set(x, y, z);
    }
    on() {}
    off() {}
    lookAt() {}
    destroy() {
      this.destroyed = true;
    }
  }
  class Camera {
    static ProjectionType = { ORTHO: 1 };
    static ClearFlag = { SOLID_COLOR: 1, SKYBOX: 2 };
    camera = { update() {} };
    screenPointToRay(_x, _y, result) {
      Object.assign(result, structuredClone(ray));
    }
  }
  const cc = {
    Node,
    Vec3,
    Camera,
    Rect: class {},
    Layers: { Enum: { DEFAULT: 1 } },
    geometry: { Ray: class {} },
    screen: { windowSize: { width: 800, height: 600 }, devicePixelRatio: 1 },
    input: { getAllTouches: () => [] },
  };
  const parent = new Node('Root');
  const town = {
    pickTerrain: (r) => (ready ? picker.pick(r) : null),
    pickBuilding: () => null,
    pickDrop: () => null,
    pickTree: () => null,
    pickStack: () => null,
    pickNatural: () => null,
  };
  const storage = {
    getItem: (key) => bytes.get(key) ?? null,
    setItem: (key, value) => {
      bytes.set(key, value);
      writes++;
    },
    removeItem: (key) => {
      bytes.delete(key);
      writes++;
    },
  };
  const session = new GameSession(
    storage,
    () => state.lastSeenAt + 1,
    () => structuredClone(state),
  );
  const run = session.run.bind(session);
  session.run = (command) => {
    commands.push(command);
    return run(command);
  };
  class Idle {
    active = false;
    clear() {}
    candidate() {
      return null;
    }
  }
  const dependencies = {
    cc,
    './Palette': { color: (value) => value },
    './SceneLighting': { fitTownShadowDepth() {} },
    './CameraVisibility': { cameraContainsPoint: (_camera, point) => !point.covered },
    './TownView': {
      TownView: class {
        constructor() {
          return town;
        }
      },
    },
    './TownHUD': {
      TownHUD: class {
        constructor() {
          this.mapInput = new Node('MapInput');
          parent.addChild(this.mapInput);
        }
        setToolHandlers() {}
        openDetails() {}
        coversMapPoint(point) {
          return Boolean(point.covered);
        }
      },
    },
    './ObjectDrag': { ObjectDrag: Idle },
    './ToolRouter': { ToolRouter: Idle },
    './V6TownNavigation': { V6TownNavigation: Idle },
    './CollectionBinding': { bindCollections() {} },
    './TownUiActions': { townUiActions: () => ({}) },
    './ModelFactory': {
      ModelFactory: class {
        shape(parent, name, x, y, z) {
          const node = new Node(name);
          node.setPosition(x, y, z);
          parent.addChild(node);
          shapes.push(node);
          return node;
        }
        dispose() {}
      },
    },
  };
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} };
    const code = ts.transpileModule(
      fs.readFileSync(path.join(__dirname, `../../assets/scripts/presentation/${name}.ts`), 'utf8'),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      },
    ).outputText;
    new Function('require', 'module', 'exports', code)(
      (id) => {
        if (id in dependencies) return dependencies[id];
        if (id.startsWith('../'))
          return require(path.join(__dirname, '../../.domain-build', id.slice(3)));
        return load(id.slice(2));
      },
      module,
      module.exports,
    );
    cache.set(name, module.exports);
    return module.exports;
  }
  const { TownController } = load('TownController');
  // Rendering and layout are not part of this CPU command-routing test.
  TownController.prototype.layout = TownController.prototype.refresh = () => {};
  const controller = new TownController(
    parent,
    session,
    state.terrainVersion === 6 ? 'v6-preview' : 'normal',
  );
  const { StockDrag } = load('StockDrag');
  const stock = new StockDrag(parent, session, controller.map, town, () => {});
  const point = { x: 100, y: 100 };
  return {
    session,
    controller,
    stock,
    point,
    commands,
    shapes,
    bytes,
    get writes() {
      return writes;
    },
    ground: () => controller.map.ground(point),
    ready: (value) => {
      ready = value;
    },
    tapTree: () => {
      controller.ui.plantingTree = true;
      controller.map.gesture.begin(1, point, point);
      controller.map.gesture.end(1, point, point);
    },
    plant: () => {
      stock.begin('sapling', 1);
      stock.move(1, point);
      stock.end(1, point);
    },
    dispose: () => {
      stock.dispose();
      controller.map.dispose();
    },
  };
}
module.exports = fixture;
