/** CPU scene transforms, canonical mesh assets and production presentation loader.
 * No renderer, materials, animation, platform window or GPU is instantiated.
 * Unlike the old audit script, this helper never extracts another test's source.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const {
  Node: ResourceNode,
  Factory: ResourceFactory,
  ModelPicking: ResourcePicking,
} = require('./resource-picking-ui.cjs');
class SceneNode extends ResourceNode {
  static EventType = {
    TOUCH_START: 'touch-start',
    TOUCH_MOVE: 'touch-move',
    TOUCH_END: 'touch-end',
    TOUCH_CANCEL: 'touch-cancel',
  };
  constructor(name) {
    super(name);
    this.name = name;
    this.children = [];
    this.listeners = new Map();
    this.active = true;
  }
  addChild(child) {
    this.children.push(child);
    child.parent = this;
  }
  on(type, callback, owner) {
    this.listeners.set(type, (event) => callback.call(owner, event));
  }
  off(type) {
    this.listeners.delete(type);
  }
  emit(type, event) {
    this.listeners.get(type)?.(event);
  }
  getChildByName(name) {
    return this.children.find((node) => node.name === name) ?? null;
  }
  setPosition(...position) {
    if (typeof position[0] === 'object') position = [position[0].x, position[0].y, position[0].z];
    this.position = position;
    Object.defineProperties(this.position, {
      x: { value: position[0] },
      y: { value: position[1] },
      z: { value: position[2] },
    });
  }
  setWorldPosition(position) {
    this.worldPosition = position;
  }

  addComponent(Type) {
    return new Type();
  }
  getComponent() {
    return { setContentSize() {}, clear() {}, roundRect() {}, stroke() {} };
  }
  destroy() {
    if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this);
    this.destroyed = true;
  }
}
class Factory extends ResourceFactory {
  shape(parent, name, ...position) {
    const node = new SceneNode(name);
    node.setPosition(...position.slice(0, 3));
    parent.addChild(node);
    return node;
  }
  dispose() {}
}
class Column {
  constructor(parent) {
    this.root = new SceneNode();
    this.entries = [];
    parent.addChild(this.root);
  }
  add(kind, name) {
    const entry = { kind, node: new SceneNode(name), text: {} };
    this.entries.push(entry);
    this.root.addChild(entry.node);
    return entry;
  }
  show() {}
  layout() {}
  cancelGesture() {}
  regions() {
    return [
      {
        node: this.root,
        hitTest: (point) => point.x < 0,
      },
    ];
  }
}
class Feedback {
  configure() {}
  chop() {}
  stack() {}
  drop() {}
  construct() {}
  clear() {}
}
const cache = new Map();
const collaborators = {
  cc: {
    Node: SceneNode,
    UITransform: class {},
    Graphics: class {},
    Vec2: class {
      constructor(x, y) {
        Object.assign(this, { x, y });
      }
    },
    Vec3: class {
      constructor(x, y, z) {
        Object.assign(this, { x, y, z });
      }
    },
  },
  './ModelFactory': { ModelFactory: Factory },
  './ModelPicking': { ModelPicking: ResourcePicking },

  './TownFeedback': { TownFeedback: Feedback },
  './IslandView': {
    IslandView: class {
      constructor() {
        this.dropSupport = new (presentation('DropSupport').DropSupport)();
        this.coastKey = '';
      }
      sync(s) {
        this.dropSupport.setFarms(s.buildings);
        const g = require('../../.domain-build/domain/game'),
          { dropRect } = require('../../.domain-build/application/DropGeometry');
        const key = JSON.stringify([s.mapSeed, s.terrainVersion, s.landExtensions, s.looseDrops]);
        if (key !== this.coastKey) {
          this.coastKey = key;
          this.dropSupport.set(
            'coast',
            require('../../.domain-build/art/ContinuousCoast').buildContinuousCoast(
              g.worldSize(s.terrainVersion),
              s.mapSeed,
              (x, z) => g.isLandCell(x, z, s.mapSeed, s.terrainVersion, s.landExtensions),
              s.looseDrops.map(dropRect),
            ).mesh,
          );
        }
      }
      dispose() {}
    },
  },
  './Palette': { color: (value) => value },
  './Widgets': {
    uiNode: (name, parent) => {
      const node = new SceneNode(name);
      parent.addChild(node);
      return node;
    },
  },
  './TrayColumn': { TrayColumn: Column },
  './TrayIcons': {
    TrayIcons: class {
      draw() {}
      dispose() {}
    },
  },
};
function presentation(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.resolve(__dirname, `../../assets/scripts/presentation/${name}.ts`);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => {
      if (Object.hasOwn(collaborators, id)) return collaborators[id];
      if (id.startsWith('../')) return require(`../../.domain-build/${id.slice(3)}.js`);
      assert.ok(id.startsWith('./'), `Unexpected presentation import ${id}`);
      return presentation(id.slice(2));
    },
    module,
    module.exports,
  );
  cache.set(name, module.exports);
  return module.exports;
}

// Use actual ModelFactory building assembly, including independent crop cells.
// The over-water pier is decorative and outside this campaign's dock drop targets.
const compiled = ts.transpileModule(
  fs.readFileSync(
    path.resolve(__dirname, '../../assets/scripts/presentation/ModelFactory.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;
const production = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  (id) => {
    if (id === 'cc') return { Node: SceneNode };
    if (id === './AssetRenderer') return { AssetRenderer: class {} };
    if (id === './CropMotion')
      return {
        CropMotion: class {
          configure() {}
        },
      };
    if (id === './WorldMaterial') return {};
    if (id === './Palette') return { color: (value) => value };
    if (id.startsWith('../')) return require(`../../.domain-build/${id.slice(3)}`);
    throw new Error(`Unexpected building dependency ${id}`);
  },
  production,
  production.exports,
);
const meshes = new ResourceFactory();
Factory.prototype.assets = { create: (id, name) => meshes.asset(id, name) };
Factory.prototype.building = production.exports.ModelFactory.prototype.building;
Factory.prototype.pier = () => {};
module.exports = { SceneNode, presentation, collaborators };
