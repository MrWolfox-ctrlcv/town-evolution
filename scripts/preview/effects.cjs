/** Bundle only lossless cached effects and real startup WebGL validation. */
const { deflateSync } = require('node:zlib');
const { collectInputs, readCache, verifyRecord } = require('./effect-cache.cjs');
module.exports = function effectCachePlugin(engine, cli) {
  // Accept nothing stale, corrupt or missing. Never fall back to old cache/slow compiler.
  const { record } = readCache(collectInputs(engine, cli));
  const inflateModule = require.resolve('pako/lib/inflate.js', { paths: [engine] });
  const compressed = deflateSync(JSON.stringify(record.packed), { level: 9 }).toString('base64');
  return {
    name: 'official-cocos-cached-effects',
    setup(build) {
      build.onEnd((result) => {
        if (!result.errors.length) verifyRecord(record, collectInputs(engine, cli));
      });
      build.onResolve({ filter: /^cocos-preview-effects$/ }, () => ({
        path: 'entry',
        namespace: 'cached-effects',
      }));
      build.onLoad({ filter: /.*/, namespace: 'cached-effects' }, () => ({
        contents: `import { inflate } from ${JSON.stringify(inflateModule)};
import { unpack } from './effect-codec.cjs';
import { validateEffects } from './effect-validation.cjs';
export const effects = (() => {
const bytes = Uint8Array.from(atob(${JSON.stringify(compressed)}), c => c.charCodeAt(0));
const data = unpack(JSON.parse(inflate(bytes, { to: 'string' })));
validateEffects(data.validation);
return data.effects;
})();`,
        loader: 'js',
        resolveDir: __dirname,
      }));
    },
  };
};
