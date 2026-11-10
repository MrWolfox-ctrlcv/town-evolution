/** Lifecycle adapters and shader source contracts, not a GPU or Creator import claim. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/scripts/presentation/TownSky.ts'), 'utf8');
const shader = fs.readFileSync(
  path.join(root, 'assets/resources/environment/town-sky.effect'),
  'utf8',
);

function fixture({ effectAvailable = true } = {}) {
  const materials = [];
  const instances = [];
  let activeScene = null;
  const globalSkybox = { editableMaterial: null };
  const director = Object.assign(new EventEmitter(), {
    getScene: () => activeScene,
    root: { pipeline: { pipelineSceneData: { skybox: globalSkybox } } },
  });
  class Material {
    constructor() {
      this.destroyCount = 0;
      materials.push(this);
    }
    initialize(options) {
      assert.equal(this.options, undefined, 'never initialize an existing pass array');
      this.options = options;
    }
    destroy() {
      this.destroyCount++;
    }
  }
  function instance(parent) {
    if (!parent) return null;
    const value = {
      parent,
      destroyCount: 0,
      destroy() {
        this.destroyCount++;
      },
    };
    instances.push(value);
    return value;
  }
  const effect = { name: 'town-sky' };
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'exports', code)((name) => {
    assert.equal(name, 'cc');
    return {
      director,
      Director: { EVENT_AFTER_SCENE_LAUNCH: 'after-scene-launch' },
      Node: { EventType: { NODE_DESTROYED: 'node-destroyed' } },
      EffectAsset: {
        get(name) {
          assert.equal(name, 'town-sky');
          return effectAvailable ? effect : null;
        },
      },
      Material,
    };
  }, exports);
  function scene(previousMaterial = null, previousEnabled = false) {
    const result = new EventEmitter();
    result.bound = false;
    let material = previousMaterial;
    const skybox = {
      enabled: previousEnabled,
      useHDR: false,
      useIBL: false,
      envLightingType: 0,
      envmap: { name: 'existing-environment-cube' },
      get skyboxMaterial() {
        return material;
      },
      set skyboxMaterial(value) {
        material = value;
        // Match SkyboxInfo: its render resource remains bound after another scene activates.
        if (result.bound) globalSkybox.editableMaterial = instance(value);
      },
    };
    result.globals = { skybox, ambient: { skyIllum: 0.65 } };
    return result;
  }
  function activate(scene) {
    activeScene = scene;
    scene.bound = true;
    globalSkybox.editableMaterial = instance(scene.globals.skybox.skyboxMaterial);
    director.emit('after-scene-launch');
  }
  return { ...exports, scene, activate, materials, instances, director, globalSkybox, effect };
}

test('sky uses one fresh material per scene and does not alter lighting or environment maps', () => {
  const f = fixture();
  const scene = f.scene();
  f.activate(scene);
  const skybox = scene.globals.skybox;
  const envmap = skybox.envmap;
  const dispose = f.configureTownSky(scene);
  assert.equal(f.configureTownSky(scene), dispose);
  assert.equal(f.materials.length, 1);
  assert.equal(skybox.skyboxMaterial, f.materials[0]);
  assert.equal(f.materials[0].options.effectAsset, f.effect);
  assert.equal(skybox.enabled, true);
  assert.equal(skybox.useHDR, false);
  assert.equal(skybox.useIBL, false);
  assert.equal(skybox.envLightingType, 0);
  assert.equal(skybox.envmap, envmap);
  assert.equal(scene.globals.ambient.skyIllum, 0.65);
  assert.equal(f.director.listenerCount('after-scene-launch'), 1);
  assert.equal(scene.listenerCount('node-destroyed'), 1);
  dispose();
});

test('explicit cleanup restores previous sky and destroys only its owned material and instance', () => {
  const f = fixture();
  const previous = { name: 'previous-sky-material' };
  const scene = f.scene(previous, true);
  f.activate(scene);
  const previousInstance = f.globalSkybox.editableMaterial;
  const dispose = f.configureTownSky(scene);
  const skyMaterial = scene.globals.skybox.skyboxMaterial;
  const skyInstance = f.globalSkybox.editableMaterial;
  dispose();
  dispose();
  assert.equal(scene.globals.skybox.skyboxMaterial, previous);
  assert.equal(scene.globals.skybox.enabled, true);
  assert.equal(skyMaterial.destroyCount, 1);
  assert.equal(skyInstance.destroyCount, 1);
  assert.equal(previousInstance.destroyCount, 0);
  assert.equal(f.globalSkybox.editableMaterial.parent, previous);
  assert.equal(f.director.listenerCount('after-scene-launch'), 0);
  assert.equal(scene.listenerCount('node-destroyed'), 0);
  f.configureTownSky(scene)();
  assert.equal(f.materials.length, 2);
  assert.equal(f.materials[1].destroyCount, 1);
});

test('configuration before activation captures and releases the later engine instance', () => {
  const f = fixture();
  const scene = f.scene();
  const dispose = f.configureTownSky(scene);
  assert.equal(f.instances.length, 0);
  f.activate(scene);
  const first = f.globalSkybox.editableMaterial;
  // Re-activation allocates another engine instance; neither may be leaked by cleanup.
  f.activate(scene);
  const second = f.globalSkybox.editableMaterial;
  scene.emit('node-destroyed');
  dispose();
  assert.equal(first.destroyCount, 1);
  assert.equal(second.destroyCount, 1);
  assert.equal(f.materials[0].destroyCount, 1);
  assert.equal(scene.globals.skybox.enabled, false);
});

test('old scene destruction never resets or destroys a newly active scene sky', () => {
  const f = fixture();
  const oldScene = f.scene();
  f.configureTownSky(oldScene);
  f.activate(oldScene);
  const oldInstance = f.globalSkybox.editableMaterial;
  const nextScene = f.scene();
  f.configureTownSky(nextScene);
  f.activate(nextScene);
  const nextMaterial = nextScene.globals.skybox.skyboxMaterial;
  const nextInstance = f.globalSkybox.editableMaterial;
  oldScene.emit('node-destroyed');
  assert.equal(f.globalSkybox.editableMaterial, nextInstance);
  assert.equal(nextScene.globals.skybox.skyboxMaterial, nextMaterial);
  assert.equal(nextScene.globals.skybox.enabled, true);
  assert.equal(nextMaterial.destroyCount, 0);
  assert.equal(nextInstance.destroyCount, 0);
  assert.equal(oldInstance.destroyCount, 1);
  assert.equal(f.materials[0].destroyCount, 1);
  nextScene.emit('node-destroyed');
});

test('cleanup preserves an external sky replacement in the same scene', () => {
  const f = fixture();
  const scene = f.scene();
  f.activate(scene);
  const dispose = f.configureTownSky(scene);
  const ownInstance = f.globalSkybox.editableMaterial;
  const replacement = { name: 'new-owner-material' };
  scene.globals.skybox.skyboxMaterial = replacement;
  const replacementInstance = f.globalSkybox.editableMaterial;
  dispose();
  assert.equal(scene.globals.skybox.skyboxMaterial, replacement);
  assert.equal(f.globalSkybox.editableMaterial, replacementInstance);
  assert.equal(replacementInstance.destroyCount, 0);
  assert.equal(ownInstance.destroyCount, 1);
});

test('missing effect leaves the existing sky untouched with no listeners or partial materials', () => {
  const f = fixture({ effectAvailable: false });
  const previous = { name: 'safe-fallback' };
  const scene = f.scene(previous, false);
  f.configureTownSky(scene)();
  assert.equal(scene.globals.skybox.skyboxMaterial, previous);
  assert.equal(scene.globals.skybox.enabled, false);
  assert.equal(f.materials.length, 0);
  assert.equal(f.director.listenerCount('after-scene-launch'), 0);
});

test('effect keeps official orthographic skybox projection, far depth, and real cube binding', () => {
  assert.match(shader, /mat4\(mat3\(cc_matView\)\)/);
  assert.match(shader, /cc_matProj\[3\]\.w > 0\.0/);
  assert.match(shader, /matProj\[0\]\.x = 5\.2/);
  assert.match(shader, /matProj\[1\]\.y = 2\.6/);
  assert.match(shader, /pos\.z = 0\.99999 \* pos\.w/);
  assert.match(shader, /depthWrite: false/);
  assert.match(shader, /priority: max - 10/);
  assert.match(shader, /uniform samplerCube environmentMap/);
  assert.match(shader, /environmentBlend: \{ value: 0\.0/);
  assert.match(shader, /float cell = mod\(floor\(u\), repeatCount\)/);
  assert.match(shader, /float drift = fract\(cc_time\.x \* skyParams\.x\)/);
  assert.doesNotMatch(shader, /gl_FragCoord|cc_ambientSky\.w|texture2D/);
  assert.doesNotMatch(source, /new Camera|MeshRenderer|skybox\.(?:useHDR|useIBL|envmap)\s*=/);
  assert.match(shader, /Permission is hereby granted/);
});
