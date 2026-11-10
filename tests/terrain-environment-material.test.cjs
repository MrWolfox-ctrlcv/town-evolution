/** Runtime ownership tests use engine doubles, never replacement Cocos declarations. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const effectSource = fs.readFileSync('assets/resources/environment/town-terrain.effect', 'utf8');

function runtime({ effectAvailable = true, bundled = true, immediate = false } = {}) {
  const requests = [],
    textures = [],
    materials = [],
    warnings = [];
  class Material {
    constructor() {
      this.properties = new Map();
      this.inits = [];
      this.destroyed = 0;
      materials.push(this);
    }
    initialize(info) {
      assert.equal(this.inits.length, 0);
      this.inits.push(info);
    }
    setProperty(key, value) {
      assert.equal(this.destroyed, 0);
      this.properties.set(key, value);
    }
    destroy() {
      this.destroyed++;
    }
  }
  class ImageAsset {
    constructor(width = 1254, height = width) {
      this.width = width;
      this.height = height;
      this.refs = 0;
    }
    addRef() {
      this.refs++;
      return this;
    }
    decRef() {
      this.refs--;
      return this;
    }
  }
  class Texture2D {
    static PixelFormat = { RGBA8888: 1 };
    static WrapMode = { CLAMP_TO_EDGE: 2 };
    static Filter = { LINEAR: 3, NONE: 0 };
    constructor() {
      this.destroyed = 0;
      textures.push(this);
    }
    reset(info) {
      this.size = info;
    }
    uploadData(data) {
      this.data = Array.from(data);
    }
    setWrapMode(s, t) {
      this.wrap = [s, t];
    }
    setFilters(min, mag) {
      this.filters = [min, mag];
    }
    setMipFilter(filter) {
      assert.equal(this.image, undefined);
      this.mip = filter;
    }
    destroy() {
      this.destroyed++;
    }
  }
  const effect = new ImageAsset();
  const load = (source, name, done) => {
    const request = { source, name, done };
    requests.push(request);
    if (immediate) done(null, new ImageAsset());
  };
  const cc = {
    Material,
    Texture2D,
    ImageAsset,
    Color: class {
      constructor(...values) {
        this.values = values;
      }
    },
    EffectAsset: {
      get: (name) => {
        assert.equal(name, 'town-terrain');
        return effectAvailable ? effect : null;
      },
    },
    assetManager: {
      getBundle: (name) => {
        assert.equal(name, 'resources');
        return bundled
          ? {
              load: (name, type, done) => {
                assert.equal(type, ImageAsset);
                load('bundle', name, done);
              },
            }
          : null;
      },
      loadRemote: (name, options, done) => {
        assert.equal(options.ext, '.png');
        load('remote', name, done);
      },
    },
  };
  function compile(file, imports = {}) {
    const out = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('require', 'module', 'exports', 'console', code)(
      (name) => {
        assert.ok(name in imports, `Unexpected dependency: ${name}`);
        return imports[name];
      },
      out,
      out.exports,
      { warn: (...args) => warnings.push(args) },
    );
    return out.exports;
  }
  const shared = compile('assets/scripts/application/SharedResource.ts');
  const world = compile('assets/scripts/presentation/WorldMaterial.ts', { cc });
  const { TerrainMaterial } = compile('assets/scripts/presentation/TerrainMaterial.ts', {
    cc,
    '../application/SharedResource': shared,
    './WorldMaterial': world,
  });
  return { TerrainMaterial, requests, textures, materials, warnings, effect, ImageAsset };
}

test('missing effect keeps standard lighting without custom properties, loads, or reinitialization', async () => {
  const r = runtime({ effectAvailable: false });
  const terrain = new r.TerrainMaterial();
  await terrain.ready;
  assert.equal(terrain.material.inits[0].effectName, 'builtin-standard');
  assert.equal(terrain.material.inits.length, 1);
  assert.equal(r.requests.length, 0);
  assert.equal(r.textures.length, 0);
  assert.equal(terrain.material.properties.has('grassMap'), false);
  terrain.dispose();
  terrain.dispose();
  assert.equal(terrain.material.destroyed, 1);
});

test('registered effect initializes once and four GPU surfaces are shared until the final owner', async () => {
  const r = runtime();
  const a = new r.TerrainMaterial(),
    b = new r.TerrainMaterial();
  assert.equal(r.requests.length, 4);
  assert.equal(r.effect.refs, 2);
  assert.equal(a.material.inits[0].effectAsset, r.effect);
  assert.equal(a.material.properties.get('grassMap'), b.material.properties.get('grassMap'));
  const images = r.requests.map(() => new r.ImageAsset());
  r.requests.forEach((request, i) => request.done(null, images[i]));
  await Promise.all([a.ready, b.ready]);
  assert.equal(r.textures.length, 8);
  assert.ok(r.textures.slice(0, 4).every((texture) => texture.destroyed === 1));
  assert.ok(images.every((image) => image.refs === 1));
  assert.equal(a.material.properties.get('rockMap'), b.material.properties.get('rockMap'));
  for (const texture of r.textures.slice(4)) {
    assert.deepEqual(texture.wrap, [2, 2]);
    assert.deepEqual(texture.filters, [3, 3]);
    assert.equal(texture.mip, 0, 'unchanged NPOT artwork stays valid on WebGL 1');
  }
  a.dispose();
  a.dispose();
  assert.equal(r.effect.refs, 1);
  assert.ok(r.textures.slice(4).every((texture) => texture.destroyed === 0));
  b.dispose();
  assert.equal(r.effect.refs, 0);
  assert.ok(r.textures.every((texture) => texture.destroyed === 1));
  assert.ok(images.every((image) => image.refs === 0));
});

test('late and duplicate callbacks do not retain images or recreate destroyed textures', async () => {
  const r = runtime();
  const a = new r.TerrainMaterial(),
    b = new r.TerrainMaterial();
  a.dispose();
  await a.ready;
  const image = new r.ImageAsset(1024);
  r.requests[0].done(null, image);
  assert.equal(image.refs, 1);
  assert.equal(r.textures.at(-1).mip, 3, 'POT uploads opt into Cocos mip generation');
  const duplicate = new r.ImageAsset();
  r.requests[0].done(null, duplicate);
  assert.equal(duplicate.refs, 0);
  assert.equal(r.textures.length, 5);
  b.dispose();
  await b.ready;
  const late = new r.ImageAsset();
  r.requests[1].done(null, late);
  assert.equal(late.refs, 0);
  assert.equal(image.refs, 0);
  assert.equal(r.textures.length, 5);
  const c = new r.TerrainMaterial();
  assert.equal(r.requests.length, 8, 'a fresh scene can reacquire a new pool');
  r.requests[2].done(null, late);
  assert.equal(late.refs, 0, 'an old scene callback cannot populate a new pool');
  c.dispose();
  await c.ready;
});

test('partial failures preserve valid fallback maps and settle ready; preview supports sync completion', async () => {
  const r = runtime();
  const material = new r.TerrainMaterial();
  const fallback = material.material.properties.get('soilMap');
  r.requests.forEach((request, i) =>
    request.done(
      i === 1 ? new Error('missing image') : null,
      i === 1 ? undefined : new r.ImageAsset(),
    ),
  );
  await material.ready;
  assert.equal(material.material.properties.get('soilMap'), fallback);
  assert.equal(fallback.destroyed, 0);
  assert.equal(r.warnings.length, 1);
  material.dispose();
  assert.equal(fallback.destroyed, 1);
  const preview = runtime({ bundled: false, immediate: true });
  const ready = new preview.TerrainMaterial();
  await ready.ready;
  assert.deepEqual(
    preview.requests.map((request) => request.name),
    [
      'environment/grass.png',
      'environment/soil.png',
      'environment/rock.png',
      'environment/sand.png',
    ],
  );
  assert.ok(preview.requests.every((request) => request.source === 'remote'));
  assert.equal(preview.textures.length, 8);
  assert.ok(preview.textures.slice(4).every((texture) => texture.image));
  ready.dispose();
});

// Run the shader's actual scalar classifier body with equivalent JS intrinsics.
// This tests palette contracts without claiming to validate a GPU shader compile.
const classifierBody = effectSource
  .match(/vec4 terrainWeights\(vec3 c\) \{([\s\S]*?)\n  \}/)[1]
  .replace(/\bfloat /g, 'const ')
  .replace(
    'vec4 weights = vec4(grass, soil, rock, sand);',
    'const weights = [grass, soil, rock, sand];',
  )
  .replace(
    'return weights / max(1.0, dot(weights, vec4(1.0)));',
    'return weights.map(w => w / max(1, weights.reduce((a, b) => a + b, 0)));',
  );
const smoothstep = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const classify = new Function('c', 'smoothstep', 'max', 'min', classifierBody);
const weights = ([r, g, b]) => classify({ r, g, b }, smoothstep, Math.max, Math.min);

test('shader keeps V6 grass, stone, excavated soil, dry/wet beach and submerged shelf distinct', () => {
  assert.deepEqual(weights([0.5, 0.68, 0.29]), [1, 0, 0, 0]);
  assert.deepEqual(weights([0.55, 0.54, 0.5]), [0, 0, 1, 0]);
  assert.deepEqual(weights([0.43, 0.3, 0.17]), [0, 1, 0, 0]);
  for (const shade of [-0.025, 0.025]) {
    assert.deepEqual(weights([0.55, 0.54, 0.5].map((c) => c + shade)), [0, 0, 1, 0]);
    assert.deepEqual(weights([0.43, 0.3, 0.17].map((c) => c + shade)), [0, 1, 0, 0]);
  }
  for (const sand of [
    [0.9, 0.82, 0.6],
    [0.88, 0.79, 0.57],
    [0.73, 0.67, 0.49],
  ])
    assert.deepEqual(weights(sand), [0, 0, 0, 1]);
  assert.deepEqual(weights([0.43, 0.58, 0.54]), [0, 0, 0, 0]);
  assert.deepEqual(weights([1, 1, 1]), [0, 0, 0, 0]);
  for (const a of [
    [0.5, 0.68, 0.29],
    [0.55, 0.54, 0.5],
    [0.43, 0.3, 0.17],
    [0.9, 0.82, 0.6],
  ])
    for (const b of [
      [0.5, 0.68, 0.29],
      [0.55, 0.54, 0.5],
      [0.43, 0.3, 0.17],
      [0.9, 0.82, 0.6],
    ])
      for (let i = 0; i <= 20; i++) {
        const w = weights(a.map((v, c) => v + ((b[c] - v) * i) / 20));
        assert.ok(w.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
        assert.ok(w.reduce((sum, v) => sum + v, 0) <= 1 + 1e-12);
      }
});

test('terrain effect retains official standard lighting/shadow passes and changes albedo only', () => {
  assert.match(effectSource, /Copyright \(c\) 2017-2022 Xiamen Yaji Software Co\., Ltd\./);
  for (const chunk of [
    'lighting-models/includes/standard',
    'surfaces/includes/standard-fs',
    'shading-entries/main-functions/render-to-shadowmap/fs',
    'shading-entries/main-functions/render-to-scene/fs',
  ])
    assert.ok(effectSource.includes(`#include <${chunk}>`));
  assert.match(effectSource, /SRGBToLinear\(terrainAlbedo\(FSInput_vertexColor\.rgb\)\)/);
  for (const plane of ['zy', 'xz', 'xy'])
    assert.ok(effectSource.includes(`texture(sourceMap, fract(p.${plane}))`));
  assert.match(effectSource, /vec3 p = FSInput_worldPos;/);
  const uncommented = effectSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(uncommented, /#define CC_SURFACES_VERTEX_MODIFY_WORLD_POS/);
  assert.equal((effectSource.match(/phase: shadow-caster/g) ?? []).length, 1);
});
