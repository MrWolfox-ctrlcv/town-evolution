/** Explicit, expensive regeneration. Requires a real GL compiler; never runs in normal build. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { CACHE_FILE, collectInputs, dependencyInputs, sha256 } = require('./effect-cache.cjs');
const { pack, unpack } = require('./effect-codec.cjs');
const { recorder } = require('./effect-recording.cjs');
async function generate() {
  const engine = path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine');
  const cli = path.resolve(process.env.COCOS_CLI || 'temp/cocos-cli');
  const dependency = (name) => require(path.join(engine, 'node_modules', name));
  const createGL = process.argv.includes('--mesa')
    ? require('./effect-gl-mesa.cjs')
    : dependency('gl');
  const inputs = collectInputs(engine, cli);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-effect-cache-'));
  const record = recorder(createGL);
  let dom;
  try {
    // Rebuild gfx from these current sources, never apply a new source hash to an old cc.js.
    execFileSync(process.execPath, ['scripts/build-debug-infos.js'], {
      cwd: engine,
      stdio: 'inherit',
    });
    const result = await dependency('@cocos/ccbuild').buildEngine({
      engine,
      moduleFormat: 'system',
      mode: 'BUILD',
      platform: 'HTML5',
      out: path.join(temporary, 'engine'),
      features: [
        'base',
        'gfx-webgl',
        'gfx-webgl2',
        '3d',
        '2d',
        'ui',
        'graphics',
        'tween',
        'primitive',
        'legacy-pipeline',
      ],
      compress: true,
      sourceMap: false,
      flags: { DEBUG: false },
    });
    if (result.hasCriticalWarns) throw new Error('Engine emitted critical warnings');
    const { JSDOM, VirtualConsole } = require(
      require.resolve('jsdom', {
        paths: [path.join(engine, 'node_modules/jest-environment-jsdom')],
      }),
    );
    dom = new JSDOM('<!doctype html><canvas id="GameCanvas"></canvas>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
      virtualConsole: new VirtualConsole(),
    });
    for (const key of [
      'window',
      'document',
      'navigator',
      'HTMLElement',
      'HTMLCanvasElement',
      'HTMLImageElement',
      'Image',
      'XMLHttpRequest',
      'localStorage',
      'screen',
      'location',
    ])
      Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
    const { System } = dependency('systemjs/dist/system-node.cjs');
    const cc = await System.import(pathToFileURL(path.join(temporary, 'engine/cc.js')).href);
    const bundle = await dependency('esbuild').build({
      stdin: {
        contents: "export { effects } from 'cocos-preview-effects';",
        resolveDir: path.resolve(__dirname, '../..'),
      },
      bundle: true,
      write: false,
      minify: true,
      platform: 'node',
      format: 'cjs',
      target: 'es2022',
      tsconfigRaw: { compilerOptions: {} },
      external: ['cc', 'effect-recording-gl'],
      define: { 'console.error': '__effectCompilerError' },
      banner: {
        js: 'const __effectCompilerError = (...args) => { throw new Error(args.join(" ")); };',
      },
      plugins: [
        {
          name: 'real-gl-recorder',
          setup(build) {
            build.onResolve({ filter: /^gl$/ }, () => ({
              path: 'effect-recording-gl',
              external: true,
            }));
          },
        },
        require('./effect-compiler.cjs')(engine, cli, true),
      ],
    });
    const output = { exports: {} };
    const compilerStart = performance.now();
    new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
      (id) =>
        id === 'cc'
          ? cc
          : id === 'effect-recording-gl'
            ? Object.assign(record.factory, { beginEffect: record.beginEffect })
            : require(id),
      output,
      output.exports,
    );
    const compilerMs = performance.now() - compilerStart;
    const data = { effects: output.exports.effects, validation: record.validation };
    if (data.effects.length !== 9 || data.validation.pairs.length !== 16)
      throw new Error('Unexpected compiled effect/shader pair count');
    const packed = pack(data);
    const decoded = unpack(JSON.parse(JSON.stringify(packed)));
    assert.deepStrictEqual(
      decoded,
      data,
      'Lossless effect cache must preserve every field, Set, undefined and shader byte',
    );
    // Canonical re-encoding also proves references/property descriptors/order survive.
    assert.deepStrictEqual(pack(decoded), packed);
    assert.deepStrictEqual(
      collectInputs(engine, cli),
      inputs,
      'Inputs changed during effect generation',
    );
    const cache = {
      schema: 1,
      inputs,
      payloadSha256: sha256(JSON.stringify(packed)),
      provenance: {
        generatedAtUtc: new Date().toISOString(),
        compilerMs,
        engineBundleSha256: sha256(fs.readFileSync(path.join(temporary, 'engine/cc.js'))),
        gl: createGL.stats?.info
          ? { ...createGL.stats.info, extensions: undefined }
          : { provider: 'headless-gl' },
        glInputs: createGL.provenance ? createGL.provenance() : dependencyInputs(engine, ['gl']),
        validationPairs: data.validation.pairs.length,
        losslessDeepEquality: true,
      },
      packed,
    };
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const next = `${CACHE_FILE}.${process.pid}.${require('node:crypto').randomUUID()}.next`;
    try {
      fs.writeFileSync(next, JSON.stringify(cache), { flag: 'wx' });
      fs.renameSync(next, CACHE_FILE);
    } finally {
      fs.rmSync(next, { force: true });
    }
    console.log(
      JSON.stringify(
        { file: CACHE_FILE, bytes: fs.statSync(CACHE_FILE).size, ...cache.provenance },
        null,
        2,
      ),
    );
  } finally {
    record.close();
    createGL.close?.();
    dom?.window.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (require.main === module)
  generate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
module.exports = { generate };
