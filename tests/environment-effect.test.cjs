const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function harness(registered = []) {
  const effects = new Map(registered.map((name) => [name, { name }]));
  const pending = [];
  const warnings = [];
  const source = fs.readFileSync('assets/scripts/presentation/EnvironmentEffect.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'console', compiled)(
    () => ({
      EffectAsset: {
        get: (name) => effects.get(name),
        register: (effect) => effects.set(effect.name, effect),
      },
      resources: { load: (path, type, done) => pending.push({ path, done }) },
    }),
    module,
    module.exports,
    { warn: (...args) => warnings.push(args) },
  );
  return { prepare: module.exports.prepareTownEnvironment, pending, effects, warnings };
}
test('registered preview effects start synchronously without resource requests', () => {
  const h = harness(['town-terrain', 'town-stylized-water', 'town-sky']);
  let calls = 0;
  const cancel = h.prepare(() => calls++);
  assert.equal(calls, 1);
  assert.equal(h.pending.length, 0);
  cancel();
});
test('Creator waits for all three effects and registers each before world construction', () => {
  const h = harness();
  let calls = 0;
  h.prepare(() => calls++);
  assert.equal(calls, 0);
  assert.deepEqual(
    h.pending.map((p) => p.path),
    ['environment/town-terrain', 'environment/town-stylized-water', 'environment/town-sky'],
  );
  for (const [index, p] of h.pending.entries()) {
    p.done(null, { name: p.path.split('/')[1] });
    assert.equal(calls, index === 2 ? 1 : 0);
  }
  assert.equal(h.effects.size, 3);
});
test('failed effect still starts with safe material fallback, never resets any save', () => {
  const h = harness(['town-terrain', 'town-sky']);
  let calls = 0;
  h.prepare(() => calls++);
  h.pending[0].done(new Error('missing asset'));
  assert.equal(calls, 1);
  assert.equal(h.warnings.length, 1);
  assert.equal(h.effects.size, 2);
});
test('destroy during async asset loading cannot construct a late town', () => {
  const h = harness();
  let calls = 0;
  const cancel = h.prepare(() => calls++);
  cancel();
  for (const p of h.pending) p.done(null, { name: p.path });
  assert.equal(calls, 0);
  assert.equal(h.effects.size, 0);
});
