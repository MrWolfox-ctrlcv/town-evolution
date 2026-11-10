/** Production camera constructors with narrow scene adapters, not a renderer test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(name, dependencies) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  new Function('require', 'exports', code)((id) => {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return exports;
}

function fixture(enabled) {
  const cameras = [];
  const effects = [];
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
      Object.assign(this, { x, y, z });
    }
  }
  class Camera {
    static ProjectionType = { ORTHO: 0 };
    // Official 3.8.8 flags: COLOR=1, DEPTH_STENCIL=6, SKYBOX=32|6.
    static ClearFlag = { SOLID_COLOR: 7, SKYBOX: 38 };
  }
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
      this.active = true;
    }
    get scene() {
      return this.parent?.scene ?? this.ownerScene;
    }
    addChild(node) {
      node.parent = this;
      this.children.push(node);
    }
    addComponent(Type) {
      assert.equal(Type, Camera, 'do not replace the actual camera type');
      const camera = new Type();
      camera.node = this;
      cameras.push(camera);
      return camera;
    }
    getComponentsInChildren() {
      return [];
    }
    setPosition(x, y, z) {
      this.position = { x, y, z };
    }
    lookAt(focus) {
      this.focus = focus;
    }
    on() {}
    off() {}
    destroy() {
      this.active = false;
    }
  }
  const scene = { globals: { skybox: { enabled, skyboxMaterial: null } } };
  const parent = new Node('Town');
  parent.ownerScene = scene;
  const input = new Node('MapInput');
  parent.addChild(input);
  const cc = {
    Node,
    Camera,
    Vec3,
    Layers: { Enum: { DEFAULT: 1 } },
    EffectAsset: {
      get(name) {
        effects.push(name);
        return null;
      },
    },
  };
  const dependencies = {
    cc,
    './Palette': { color: (value) => value },
    '../domain/world': { worldSize: () => 40 },
    '../application/CameraFraming': {
      homeZoom: () => 0.3,
      fittedOrthoHeight: () => 10,
      cameraDepth: () => ({ x: 15, y: 20, z: 18, near: 0.1, far: 150 }),
    },
    './SceneLighting': { fitTownShadowDepth() {} },
    './CameraVisibility': {},
    './TouchPicking': {},
    './InputProvenance': {},
    '../application/MapGesture': {
      MapGesture: class {
        clear() {}
      },
    },
    '../application/TitleIsland': {
      TITLE_ISLAND_TIME: 0,
      titleIsland: () => ({ terrainVersion: 3 }),
    },
    './TownView': {
      TownView: class {
        sync() {}
        dispose() {}
      },
    },
    './CropMotion': { CropMotion: class {} },
  };
  return { scene, parent, input, cc, dependencies, cameras, effects };
}

for (const name of ['MapCamera', 'StartArtwork']) {
  for (const enabled of [false, true]) {
    test(`${name} ${enabled ? 'uses the configured skybox' : 'clears its original color when the sky effect is missing'}`, () => {
      const f = fixture(enabled);
      if (!enabled) {
        // Exercise the actual missing-effect path, not only a disconnected flag fixture.
        load('TownSky', { cc: f.cc }).configureTownSky(f.scene)();
        assert.deepEqual(f.effects, ['town-sky']);
        assert.equal(f.scene.globals.skybox.enabled, false);
      }
      const Type = load(name, f.dependencies)[name];
      const view = new Type(f.parent, f.input, {});
      const camera = f.cameras.find(
        (entry) => entry.node.name === (name === 'MapCamera' ? 'WorldCamera' : 'TitleIslandCamera'),
      );
      assert.ok(camera, 'the original world/title camera must remain present');
      assert.equal(camera.projection, f.cc.Camera.ProjectionType.ORTHO);
      assert.equal(camera.clearColor, '#77B8B6');
      assert.equal(camera.clearFlags, enabled ? 38 : 7);
      assert.equal(camera.clearFlags & 1, enabled ? 0 : 1, 'fallback must set the COLOR bit');
      assert.equal(camera.clearFlags & 6, 6, 'depth and stencil must still be cleared');
      assert.equal(camera.visibility, f.cc.Layers.Enum.DEFAULT);
      assert.equal(camera.near, 0.1);
      if (name === 'MapCamera') {
        const background = f.cameras.find((entry) => entry.node.name === 'BackgroundCamera');
        assert.equal(f.cameras.length, 2);
        assert.equal(background.clearFlags, 7);
        assert.equal(background.clearColor, '#77B8B6');
        assert.equal(background.visibility, 0);
      } else {
        assert.equal(f.cameras.length, 1, 'fallback must not add a replacement overlay camera');
        assert.equal(camera.priority, -1);
      }
      view.dispose();
    });
  }
}
