/** Standalone real-engine preview; does not replace Creator scene import validation. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const engine = path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine');
const out = path.resolve(process.env.PREVIEW_OUT || 'build/preview');
const dependency = (name) => require(path.join(engine, 'node_modules', name));
const cli = path.resolve(process.env.COCOS_CLI || 'temp/cocos-cli');
const revision = '411f98df047c25902f93440d4b22925c2fb65461';

async function main() {
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: engine,
    encoding: 'utf8',
  }).trim();
  if (actual !== revision) throw new Error(`Expected Cocos 3.8.8 ${revision}; got ${actual}`);
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
    compress: false,
    sourceMap: false,
    flags: { DEBUG: true },
  });
  if (result.hasCriticalWarns) throw new Error('Engine emitted critical warnings');
  require('./verify-engine.cjs')(path.join(out, 'engine/cc.js'), engine);
  const intermediate = path.join(out, 'app-esm.js');
  await dependency('esbuild').build({
    entryPoints: [path.join(__dirname, 'bootstrap.ts')],
    outfile: intermediate,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    external: ['cc'],
    plugins: [require('./effects.cjs')(engine, cli)],
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
  fs.copyFileSync(
    path.join(engine, 'node_modules/systemjs/dist/system.js'),
    path.join(out, 'system.js'),
  );
  fs.copyFileSync(path.join(cli, 'LICENSE'), path.join(out, 'COCOS-CLI-LICENSE.txt'));
  fs.copyFileSync(path.join(engine, 'LICENSE.md'), path.join(out, 'COCOS-LICENSE.md'));
  fs.cpSync(path.join(engine, 'licenses'), path.join(out, 'third-party-licenses'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(out, 'provenance.json'),
    JSON.stringify({ engine: revision, standalonePreview: true }, null, 2),
  );
  console.log(`Actual Cocos preview compiled: ${out}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
