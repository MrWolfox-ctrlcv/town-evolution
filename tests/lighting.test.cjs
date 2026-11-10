const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { part } = require('../.domain-build/art/AssetTypes');
const { sceneGroundArt } = require('../.domain-build/art/SceneGroundArt');
const { naturalQuad, emptyNaturalMesh } = require('../.domain-build/art/NaturalMesh');
const source = (name) => fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8');

test('rotating geometry changes normals without baking a different sun into its albedo', () => {
  for (const shape of ['box', 'crown', 'kernel']) {
    const recipe = {
      id: `albedo-${shape}`,
      footprint: [1, 1],
      parts: [part('surface', shape, [0, 1, 0], [1, 1, 1], '#A08040')],
    };
    const first = compileAsset(recipe);
    const turned = compileAsset({
      ...recipe,
      parts: [{ ...recipe.parts[0], rotation: [0, 90, 0] }],
    });
    assert.deepEqual(first.colors, turned.colors);
    assert.notDeepEqual(first.normals, turned.normals);
    for (let i = 0; i < first.colors.length; i += 4)
      assert.deepEqual(first.colors.slice(i, i + 4), [160 / 255, 128 / 255, 64 / 255, 1]);
  }
});

test('natural faces preserve material tone without normal-dependent baked lighting', () => {
  const a = emptyNaturalMesh(),
    b = emptyNaturalMesh();
  naturalQuad(
    a,
    [
      [0, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 0, 0],
    ],
    '#A08040',
    0.92,
  );
  naturalQuad(
    b,
    [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
    '#A08040',
    0.92,
  );
  assert.deepEqual(a.colors, b.colors);
  assert.notDeepEqual(a.normals, b.normals);
});

test('trees, buildings and props generate no fake ground shadow discs', () => {
  for (const extra of [{ tree: true }, { tree: false }, { tree: false, prop: true }]) {
    const actor = { x: 0, z: 0, width: 1, depth: 1, rotation: 0, ...extra };
    const mesh = sceneGroundArt(1, 17, [actor], () => true);
    assert.equal(mesh.indices.length, 0);
    assert.equal(mesh.positions.length, 0);
  }
});

test('one camera-fitted shadow map has explicit caster/receiver and material setup', () => {
  const light = source('SceneLighting');
  assert.match(light, /getChildByName\('TownSun'\)/);
  assert.equal((light.match(/addComponent\(DirectionalLight\)/g) || []).length, 1);
  assert.match(light, /ShadowType\.ShadowMap/);
  assert.match(light, /High_1024x1024/);
  assert.match(light, /shadowFixedArea = false/);
  assert.match(light, /csmLevel = 1/);
  assert.match(light, /shadowPcf = renderer\.scene\.PCFType\.SOFT/);
  assert.match(light, /globals\.shadows\.enabled = true/);
  assert.match(source('WorldMaterial'), /effectName: 'builtin-standard'/);
  assert.match(
    source('WorldMaterial'),
    /renderer\.receiveShadow = MeshRenderer\.ShadowReceivingMode\.ON/,
  );
  assert.match(source('AssetRenderer'), /worldShadows\(renderer\)/);
  assert.match(source('AssetRenderer'), /mesh = worldMesh\(data\)/);
  assert.match(source('ModelFactory'), /worldShadows\(renderer\)/);
  assert.match(source('IslandView'), /if \(!water\) worldShadows/);
  assert.match(source('IslandView'), /return replaceIslandMesh\(/);
  assert.match(source('IslandMeshUpload'), /splitMesh16\(data\)\.map/);
  assert.match(source('IslandMeshUpload'), /const mesh = worldMesh\(chunk\)/);
  assert.match(source('TownBootstrap'), /configureTownLighting\(this\.node\.scene!\)/);
  assert.match(
    fs.readFileSync('scripts/preview/effect-compiler.cjs', 'utf8'),
    /builtin-standard\.effect/,
  );
  const { unpack } = require('../scripts/preview/effect-codec.cjs');
  const cached = unpack(require('../scripts/preview/generated/effects.cache.json').packed);
  const standard = cached.effects.find((effect) => effect.name === 'builtin-standard');
  assert.ok(standard, 'The actual runtime cache retains the standard lighting effect');
  assert.ok(standard.shaders.some((shader) => shader.name.includes('shadow-caster')));
  assert.ok(
    standard.shaders.some((shader) =>
      shader.defines.some((define) => define.name === 'CC_RECEIVE_SHADOW'),
    ),
  );
});

test('every static world mesh carries its own explicit local bounds', () => {
  const ts = require('typescript');
  const code = ts.transpileModule(source('WorldMesh'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const inputs = [];
  new Function('require', 'module', 'exports', code)(
    (id) => {
      assert.equal(id, 'cc');
      return {
        utils: {
          createMesh: (input) => {
            inputs.push(input);
            return input;
          },
        },
      };
    },
    module,
    module.exports,
  );
  const data = compileAsset({
    id: 'bounded',
    footprint: [1, 1],
    parts: [part('box', 'box', [4, 3, -2], [2, 4, 6], '#FFFFFF')],
  });
  const mesh = module.exports.worldMesh(data);
  assert.deepEqual(mesh.minPos, { x: 3, y: 1, z: -5 });
  assert.deepEqual(mesh.maxPos, { x: 5, y: 5, z: 1 });
  assert.equal(mesh.positions, data.positions);
  assert.throws(
    () => module.exports.worldMesh({ ...data, min: [Infinity, 0, 0] }),
    /finite local bounds/,
  );
  assert.throws(() => module.exports.worldMesh({ ...data, max: [0, 0, 0] }), /finite local bounds/);
  assert.equal(inputs.length, 1, 'invalid bounds cannot become unbounded shadow casters');
});

test('exports preserve lit albedo and the existing shared wood image', () => {
  for (const name of ['house', 'tree', 'crate', 'natural-block-stone']) {
    const asset = JSON.parse(fs.readFileSync(`art/exports/${name}.gltf`, 'utf8'));
    assert.ok(!asset.extensionsUsed?.includes('KHR_materials_unlit'));
    for (const material of asset.materials) {
      assert.ok(!material.extensions?.KHR_materials_unlit);
      assert.equal(material.pbrMetallicRoughness.metallicFactor, 0);
      assert.equal(material.pbrMetallicRoughness.roughnessFactor, 1);
    }
  }
});

test('shadow depth tracks only the visible world camera and has no large-island cutoff', () => {
  // Execute the production adapter with explicit boundary doubles, not fake engine typings.
  const ts = require('typescript');
  const output = ts.transpileModule(source('SceneLighting'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const cc = { Layers: { Enum: { DEFAULT: 1 << 30 } }, DirectionalLight: class {} };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    (id) => {
      if (id === './TownSky') return { configureTownSky() {} };
      assert.equal(id, 'cc');
      return cc;
    },
    module,
    module.exports,
  );
  const { fitTownShadowDepth } = module.exports;
  let distance = 100,
    writes = 0;
  const sun = {
    get shadowDistance() {
      return distance;
    },
    set shadowDistance(value) {
      writes++;
      distance = value;
    },
  };
  const camera = {
    enabledInHierarchy: true,
    visibility: cc.Layers.Enum.DEFAULT,
    near: 0.1,
    far: 365,
    node: {
      activeInHierarchy: true,
      scene: {
        getChildByName(name) {
          assert.equal(name, 'TownSun');
          return {
            getComponent(Type) {
              assert.equal(Type, cc.DirectionalLight);
              return sun;
            },
          };
        },
      },
    },
  };
  for (const far of [100, 365, 870, 100]) {
    camera.far = far;
    fitTownShadowDepth(camera);
    assert.equal(distance, far);
  }
  assert.equal(writes, 3);
  fitTownShadowDepth(camera);
  assert.equal(writes, 3, 'unchanged poses do not repeatedly update the light');
  for (const hidden of [
    { enabledInHierarchy: false },
    { node: { ...camera.node, activeInHierarchy: false } },
    { visibility: 1 << 18 },
    { visibility: 0 },
    { far: NaN },
    { far: Infinity },
    { far: 0.01 },
  ]) {
    fitTownShadowDepth({ ...camera, far: 870, ...hidden });
    assert.equal(distance, 100);
    assert.equal(writes, 3);
  }
  assert.doesNotThrow(() =>
    fitTownShadowDepth({ ...camera, node: { ...camera.node, scene: null } }),
  );
});
