/** Bundle the official Cocos effect compiler against the pinned engine's mappings. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
module.exports = function effectCompilerPlugin(engine, cli, recording = false) {
  const revision = '723a5b6eb76cd9a1e740566bbbb62ae32ae081ef';
  if (
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: cli, encoding: 'utf8' }).trim() !== revision
  ) {
    throw new Error('Unexpected official Cocos CLI shader compiler revision');
  }
  const compiler = path.join(cli, 'src/core/assets/effect-compiler/shdc-lib.js');
  const root = path.join(engine, 'editor/assets');
  const chunks = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.chunk'))
        chunks[
          path.relative(path.join(root, 'chunks'), file).replaceAll(path.sep, '/').slice(0, -6)
        ] = fs.readFileSync(file, 'utf8');
    }
  }
  walk(path.join(root, 'chunks'));
  const files = [
    'builtin-unlit.effect',
    'builtin-standard.effect',
    'pipeline/skybox.effect',
    'for2d/builtin-sprite.effect',
    'internal/builtin-graphics.effect',
    'internal/builtin-clear-stencil.effect',
  ];
  const sources = files.map((file) => [
    file === 'pipeline/skybox.effect' ? 'pipeline/skybox' : path.basename(file, '.effect'),
    fs.readFileSync(path.join(root, 'effects', file), 'utf8'),
  ]);
  for (const name of ['town-terrain', 'town-stylized-water', 'town-sky']) {
    const file = path.resolve(__dirname, '../../assets/resources/environment', `${name}.effect`);
    sources.push([name, fs.readFileSync(file, 'utf8')]);
  }
  let mappings = fs.readFileSync(path.join(engine, 'editor/exports/offline-mappings.ts'), 'utf8');
  mappings = mappings.replace(
    /import \{([\s\S]*?)\} from '..\/..\/cocos\/gfx';/,
    "import { gfx } from 'cc'; const {$1} = gfx;",
  );
  const definitions = fs.readFileSync(path.join(engine, 'cocos/rendering/define.ts'), 'utf8');
  const enums = ['RenderPassStage', 'RenderPriority', 'SetIndex']
    .map((name) => {
      const match = definitions.match(new RegExp(`export enum ${name} \\{[^}]+\\}`));
      if (!match) throw new Error(`Missing official enum ${name}`);
      return match[0].replace('export enum', 'enum');
    })
    .join('\n');
  mappings = mappings.replace(
    /import \{ RenderPassStage, RenderPriority, SetIndex \} from [^;]+;/,
    enums,
  );
  mappings = mappings.replace(
    "'../../cocos/core'",
    JSON.stringify(path.join(engine, 'cocos/core/algorithm/murmurhash2_gc.ts')),
  );
  return {
    name: 'official-cocos-effects',
    setup(build) {
      build.onResolve({ filter: /^cocos-preview-effects$/ }, () => ({
        path: 'entry',
        namespace: 'effects',
      }));
      build.onResolve({ filter: /^\.\/offline-mappings$/ }, (args) =>
        args.importer === compiler ? { path: 'mappings', namespace: 'effects' } : undefined,
      );
      build.onResolve({ filter: /^gl$/ }, () => ({ path: 'gl', namespace: 'effects' }));
      build.onResolve(
        { filter: /^(glsl-tokenizer\/string|glsl-parser\/direct|js-yaml)$/ },
        (args) => ({ path: require.resolve(args.path, { paths: [engine] }) }),
      );
      build.onLoad({ filter: /.*/, namespace: 'effects' }, (args) => {
        if (args.path === 'mappings')
          return { contents: mappings, loader: 'ts', resolveDir: engine };
        if (args.path === 'gl')
          return {
            contents: `module.exports = (width, height, options) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const gl = canvas.getContext('webgl', options); if (!gl) throw new Error('Real WebGL required for official shader validation'); return gl; };`,
            loader: 'js',
          };
        return {
          contents: `import { buildEffect, options } from ${JSON.stringify(compiler)};
const chunks = ${JSON.stringify(chunks)};
options.throwOnError = true;
options.chunkSearchFn = names => { for (const name of names) if (chunks[name] !== undefined) return { name, content: chunks[name] }; return {}; };
${recording ? `import { beginEffect } from 'effect-recording-gl';` : ''}
export const effects = ${JSON.stringify(sources)}.map(([name, source]) => { ${recording ? 'beginEffect(name);' : ''} return buildEffect(name, source); });`,
          loader: 'js',
          resolveDir: engine,
        };
      });
    },
  };
};
