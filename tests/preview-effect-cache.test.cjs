/** Codec/cache contract tests use synthetic fixtures, never claim GPU/browser coverage. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { pack, unpack } = require('../scripts/preview/effect-codec.cjs');
const { validateEffects } = require('../scripts/preview/effect-validation.cjs');
const { verifyRecord } = require('../scripts/preview/effect-cache.cjs');
test('lossless codec preserves Set, undefined, aliases, descriptors and shader bytes', () => {
  const shared = { value: undefined, code: '\r\nline\nline\n雪\n' };
  const value = { shared, alias: shared, record: new Set(['abc', 'def']), number: -0 };
  value.self = value;
  Object.defineProperty(value, 'hidden', { value: undefined });
  const restored = unpack(JSON.parse(JSON.stringify(pack(value))));
  assert.deepStrictEqual(restored, value);
  assert.equal(restored.shared, restored.alias);
  assert.equal(restored.self, restored);
  assert.deepEqual(
    Object.getOwnPropertyDescriptors(restored),
    Object.getOwnPropertyDescriptors(value),
  );
});
test('codec refuses unsupported prototypes and malformed cache references', () => {
  assert.throws(() => pack(new Date()), /prototype/);
  const encoded = pack({ text: 'repeat\nrepeat\n' });
  encoded.root = ['r', 999999];
  assert.throws(() => unpack(encoded), /reference/);
});
test('missing, stale and corrupt records fail closed without recompiling or rehashing old data', () => {
  assert.throws(() => verifyRecord(null, {}), /cache/);
  assert.throws(
    () => verifyRecord({ schema: 1, inputs: {}, packed: {} }, { changed: true }),
    /stale|cache/,
  );
});
function fixture(failure) {
  let next = 0;
  const calls = [],
    alive = new Set();
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    getSupportedExtensions: () => ['EXT_fixture'],
    getExtension: (name) => {
      calls.push(['extension', name]);
      return {};
    },
    isContextLost: () => failure === 'lost',
    createShader: (type) => {
      const s = { id: ++next, type };
      alive.add(s);
      return s;
    },
    shaderSource: (s, source) => {
      s.source = source;
      calls.push(['source', source]);
    },
    compileShader: (s) => calls.push(['compile', s.type]),
    getShaderParameter: (s) => !(failure === 'compile' && s.type === 35632),
    getShaderInfoLog: () => 'fixture compile failure',
    deleteShader: (s) => {
      alive.delete(s);
    },
    createProgram: () => {
      const p = { id: ++next };
      alive.add(p);
      return p;
    },
    attachShader: () => {},
    linkProgram: () => calls.push(['link']),
    getProgramParameter: () => failure !== 'link',
    getProgramInfoLog: () => 'fixture link failure',
    deleteProgram: (p) => {
      alive.delete(p);
    },
  };
  return { gl, calls, alive };
}
const validation = {
  width: 300,
  height: 150,
  attributes: { preserveDrawingBuffer: true },
  pairs: [{ effect: 'fixture', vert: '#version 100\nvertex\n', frag: '#version 100\nfragment\n' }],
};
test('runtime validator submits exact official pairs, enables extensions and deletes resources', () => {
  const f = fixture();
  validateEffects(validation, () => f.gl);
  assert.deepEqual(f.calls, [
    ['extension', 'EXT_fixture'],
    ['source', validation.pairs[0].vert],
    ['compile', 35633],
    ['source', validation.pairs[0].frag],
    ['compile', 35632],
    ['link'],
    ['extension', 'WEBGL_lose_context'],
  ]);
  assert.equal(f.alive.size, 0);
});
for (const failure of ['compile', 'link', 'lost'])
  test(`runtime ${failure} failure stops startup and cleans resources`, () => {
    const f = fixture(failure);
    assert.throws(() => validateEffects(validation, () => f.gl), /shader|link|context/i);
    assert.equal(f.alive.size, 0);
  });
test('runtime refuses missing WebGL rather than silently skipping validation', () => {
  assert.throws(() => validateEffects(validation, () => null), /WebGL/);
});

test('checked-in actual compiler cache preserves non-JSON Set and undefined fields', () => {
  const record = require('../scripts/preview/generated/effects.cache.json');
  const data = verifyRecord(record, record.inputs);
  assert.equal(data.effects.length, 9);
  assert.equal(data.validation.pairs.length, 16);
  let sets = 0,
    undefineds = 0;
  const seen = new Set();
  function audit(value) {
    if (value === undefined) undefineds++;
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (value instanceof Set) sets++;
    for (const key of Reflect.ownKeys(value)) audit(value[key]);
  }
  audit(data.effects);
  assert.equal(sets, 16);
  assert.ok(undefineds > 0);
  assert.deepEqual(pack(data), record.packed);
});
test('cache verification rejects payload corruption and each input category independently', () => {
  const record = require('../scripts/preview/generated/effects.cache.json');
  assert.throws(
    () => verifyRecord({ ...record, payloadSha256: '0'.repeat(64) }, record.inputs),
    /Corrupt/,
  );
  for (const key of Object.keys(record.inputs)) {
    const inputs = { ...record.inputs, [key]: { changed: true } };
    assert.throws(() => verifyRecord(record, inputs), new RegExp(`Stale effect cache ${key}`));
  }
});
test('missing cache is rejected, never silently regenerated', () => {
  const { readCache } = require('../scripts/preview/effect-cache.cjs');
  assert.throws(() => readCache({}, '/nonexistent/effects.cache.json'), /Missing or unreadable/);
});
test('successful-returning GL shim is rejected by regeneration negative control', () => {
  const { recorder } = require('../scripts/preview/effect-recording.cjs');
  const f = fixture();
  const capture = recorder(() => f.gl);
  assert.throws(
    () => capture.factory(300, 150, { preserveDrawingBuffer: true }),
    /negative control unexpectedly passed/,
  );
  assert.equal(f.alive.size, 0);
});

test('dirty source bytes and new files invalidate same-HEAD engine/CLI fingerprints', () => {
  const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os');
  const { execFileSync } = require('node:child_process');
  const { sourceTree } = require('../scripts/preview/effect-cache.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-input-test-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  try {
    git('init');
    fs.writeFileSync(path.join(root, 'shader.ts'), 'original');
    git('add', 'shader.ts');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'fixture',
    );
    const revision = git('rev-parse', 'HEAD'),
      before = sourceTree(root, revision);
    fs.writeFileSync(path.join(root, 'shader.ts'), 'changed');
    assert.notDeepEqual(sourceTree(root, revision), before);
    assert.equal(git('rev-parse', 'HEAD'), revision);
    fs.writeFileSync(path.join(root, 'shader.ts'), 'original');
    fs.writeFileSync(path.join(root, 'new.chunk'), 'new input');
    assert.notDeepEqual(sourceTree(root, revision), before);
    assert.throws(() => sourceTree(root, 'incorrect revision'), /Unexpected/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('actual dependency source and optional native binary changes invalidate tool fingerprints', () => {
  const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os');
  const { dependencyInputs } = require('../scripts/preview/effect-cache.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-tool-test-'));
  try {
    const pkg = path.join(root, 'node_modules/fixture-tool'),
      optional = path.join(root, 'node_modules/fixture-native');
    fs.mkdirSync(pkg, { recursive: true });
    fs.mkdirSync(optional, { recursive: true });
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name: 'fixture-tool',
        version: '1',
        optionalDependencies: { 'fixture-native': '1' },
      }),
    );
    fs.writeFileSync(path.join(pkg, 'index.js'), 'original');
    fs.writeFileSync(
      path.join(optional, 'package.json'),
      JSON.stringify({ name: 'fixture-native', version: '1' }),
    );
    fs.writeFileSync(path.join(optional, 'binary'), 'original native');
    const before = dependencyInputs(root, ['fixture-tool']);
    fs.writeFileSync(path.join(pkg, 'index.js'), 'modified');
    assert.notDeepEqual(dependencyInputs(root, ['fixture-tool']), before);
    fs.writeFileSync(path.join(pkg, 'index.js'), 'original');
    fs.writeFileSync(path.join(optional, 'binary'), 'modified native');
    assert.notDeepEqual(dependencyInputs(root, ['fixture-tool']), before);
    const moved = path.join(root, 'node_modules/fixture-native-real');
    fs.renameSync(optional, moved);
    fs.symlinkSync(moved, optional, 'junction');
    assert.throws(() => dependencyInputs(root, ['fixture-tool']), /Unsupported symlink/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('codec rejects non-extensible and subclassed objects instead of losing semantics', () => {
  assert.throws(() => pack(Object.preventExtensions({})), /non-extensible/);
  class CustomArray extends Array {}
  assert.throws(() => pack(new CustomArray()), /prototype/);
});
test('runtime null shader/program creation fails closed and cleans prior resources', () => {
  for (const failure of ['createShader', 'createProgram']) {
    const f = fixture();
    f.gl[failure] = () => null;
    assert.throws(() => validateEffects(validation, () => f.gl), /Unable to create/);
    assert.equal(f.alive.size, 0);
  }
});
test('successful-returning linker shim fails the generation link negative control', () => {
  const { recorder } = require('../scripts/preview/effect-recording.cjs');
  const f = fixture();
  f.gl.getShaderParameter = (shader) => !shader.source.includes('deliberately invalid');
  const capture = recorder(() => f.gl);
  assert.throws(
    () => capture.factory(300, 150, { preserveDrawingBuffer: true }),
    /link negative control unexpectedly passed/,
  );
  assert.equal(f.alive.size, 0);
});
test('build onEnd rechecks the captured cache against fresh inputs', () => {
  const fs = require('node:fs'),
    vm = require('node:vm');
  let calls = 0,
    onEnd;
  const accepted = { packed: {} };
  const cache = {
    collectInputs: () => ({ revision: ++calls }),
    readCache: () => ({ record: accepted }),
    verifyRecord: (record, input) => {
      assert.equal(record, accepted);
      assert.equal(input.revision, 2);
      throw new Error('Stale effect cache');
    },
  };
  const fixtureRequire = (id) => (id === './effect-cache.cjs' ? cache : require(id));
  fixtureRequire.resolve = () => '/fixture/pako.js';
  const output = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/preview/effects.cjs'), 'utf8'), {
    module: output,
    require: fixtureRequire,
    __dirname: '/fixture',
  });
  output.exports('/engine', '/cli').setup({
    onEnd: (callback) => {
      onEnd = callback;
    },
    onResolve: () => {},
    onLoad: () => {},
  });
  assert.throws(() => onEnd({ errors: [] }), /Stale effect cache/);
});
