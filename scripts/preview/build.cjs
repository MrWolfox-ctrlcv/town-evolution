/** Standalone real-engine preview; does not replace Creator scene import validation. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sourceIdentity, createProvenance, writeProvenance } = require('./provenance.cjs');
const root = path.resolve(__dirname, '../..');
const engine = path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine');
const buildMode = process.env.PREVIEW_MODE || 'debug';
if (!['debug', 'release'].includes(buildMode))
  throw new Error('PREVIEW_MODE must be debug or release');
const release = buildMode === 'release';
const out = path.resolve(
  process.env.PREVIEW_OUT || (release ? 'build/preview-release' : 'build/preview'),
);
const dependency = (name) => require(path.join(engine, 'node_modules', name));
const cli = path.resolve(process.env.COCOS_CLI || 'temp/cocos-cli');
const revision = '411f98df047c25902f93440d4b22925c2fb65461';

async function main() {
  if (fs.realpathSync(process.cwd()) !== fs.realpathSync(root))
    throw new Error('Run preview:build from the project root to avoid mixing source trees');
  if (fs.existsSync(out) && fs.readdirSync(out).length)
    throw new Error('PREVIEW_OUT must be empty; choose a fresh build directory');
  const source = sourceIdentity(root);
  require('../title-snapshot.cjs').verifySnapshot();
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: engine,
    encoding: 'utf8',
  }).trim();
  if (actual !== revision) throw new Error(`Expected Cocos 3.8.8 ${revision}; got ${actual}`);
  const effectPlugin = require('./effects.cjs')(engine, cli);
  fs.mkdirSync(out, { recursive: true });
  execFileSync(process.execPath, ['scripts/build-debug-infos.js'], {
    cwd: engine,
    stdio: 'inherit',
  });
  const result = await dependency('@cocos/ccbuild').buildEngine({
    engine,
    moduleFormat: 'system',
    mode: 'BUILD',
    platform: 'HTML5',
    out: path.join(out, 'engine'),
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
    compress: release,
    sourceMap: false,
    flags: { DEBUG: !release },
  });
  if (result.hasCriticalWarns) throw new Error('Engine emitted critical warnings');
  require('./verify-engine.cjs')(path.join(out, 'engine/cc.js'), engine);
  await dependency('esbuild').build({
    entryPoints: [path.join(__dirname, 'terrain6-worker.ts')],
    outfile: path.join(out, 'terrain6-worker.js'),
    bundle: true,
    minify: release,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } },
  });
  const intermediate = path.join(out, 'app-esm.js');
  await dependency('esbuild').build({
    entryPoints: [path.join(__dirname, 'bootstrap.ts')],
    outfile: intermediate,
    bundle: true,
    minify: release,
    format: 'esm',
    target: 'es2022',
    external: ['cc'],
    plugins: [effectPlugin],
    tsconfigRaw: {
      compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false },
    },
  });
  const bundle = await dependency('rollup').rollup({ input: intermediate, external: ['cc'] });
  await bundle.write({ file: path.join(out, 'app.js'), format: 'system' });
  await bundle.close();
  fs.rmSync(intermediate);
  fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(out, 'index.html'));
  const icons = path.resolve('assets/resources/crop-icons');
  fs.mkdirSync(path.join(out, 'crop-icons'), { recursive: true });
  for (const file of fs.readdirSync(icons).filter((file) => file.endsWith('.png')))
    fs.copyFileSync(path.join(icons, file), path.join(out, 'crop-icons', file));
  fs.mkdirSync(path.join(out, 'ui'), { recursive: true });
  fs.copyFileSync(
    path.resolve('assets/resources/ui/settings.png'),
    path.join(out, 'ui/settings.png'),
  );
  fs.mkdirSync(path.join(out, 'handbook'), { recursive: true });
  fs.mkdirSync(path.join(out, 'buildings'), { recursive: true });
  fs.copyFileSync(
    path.resolve('assets/resources/buildings/warm-wood.png'),
    path.join(out, 'buildings/warm-wood.png'),
  );
  const environment = path.resolve('assets/resources/environment');
  fs.mkdirSync(path.join(out, 'environment'), { recursive: true });
  for (const file of fs.readdirSync(environment).filter((file) => /\.(png|jpg|webp)$/.test(file)))
    fs.copyFileSync(path.join(environment, file), path.join(out, 'environment', file));
  const handbook = path.resolve('assets/resources/handbook');
  for (const file of fs.readdirSync(handbook).filter((file) => file.endsWith('.png')))
    fs.copyFileSync(path.join(handbook, file), path.join(out, 'handbook', file));
  fs.copyFileSync(
    path.join(engine, 'node_modules/systemjs/dist/system.js'),
    path.join(out, 'system.js'),
  );
  fs.copyFileSync(
    require.resolve('pako/LICENSE', { paths: [engine] }),
    path.join(out, 'PAKO-LICENSE.txt'),
  );
  fs.copyFileSync(path.join(cli, 'LICENSE'), path.join(out, 'COCOS-CLI-LICENSE.txt'));
  fs.copyFileSync(path.join(engine, 'LICENSE.md'), path.join(out, 'COCOS-LICENSE.md'));
  // Avoid Node's recursive copy native crash on Windows paths containing Unicode.
  const notices = path.join(out, 'third-party-licenses');
  fs.mkdirSync(notices, { recursive: true });
  for (const entry of fs.readdirSync(path.join(engine, 'licenses'), { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`Unexpected license entry: ${entry.name}`);
    fs.copyFileSync(path.join(engine, 'licenses', entry.name), path.join(notices, entry.name));
  }
  writeProvenance(
    out,
    createProvenance(root, out, source, {
      buildMode,
      debug: !release,
      compressed: release,
      engine: revision,
      compiler: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: cli, encoding: 'utf8' }).trim(),
      builtAtUtc: new Date().toISOString(),
      standalonePreview: true,
    }),
  );
  console.log(`Actual Cocos preview compiled: ${out}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
