/** Structural guard only. Actual Creator import/build must be run separately. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const required = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.domain.json',
  'tsconfig.cocos-check.json',
  'assets/scenes/Main.scene',
  'assets/scenes/Main.scene.meta',
  'assets/scripts/presentation/TownBootstrap.ts',
  'assets/scripts/presentation/TownBootstrap.ts.meta',
  'assets/scripts/domain/game.ts',
  'assets/scripts/domain/storage.ts',
  'README.md',
  'docs/architecture.md',
  'docs/verification.md',
];
for (const file of required) assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
const pkg = json('package.json');
assert.equal(pkg.creator.version, '3.8.8');
assert.equal(pkg.devDependencies['@cocos/creator-types'], '3.8.8');
assert.equal(json('tsconfig.json').extends, './temp/tsconfig.cocos.json');
const scene = json('assets/scenes/Main.scene');
assert.ok(Array.isArray(scene));
assert.equal(scene[0].__type__, 'cc.SceneAsset');
assert.equal(scene[1].__type__, 'cc.Scene');
function inspect(value) {
  if (!value || typeof value !== 'object') return;
  if ('__id__' in value)
    assert.ok(
      Number.isInteger(value.__id__) && value.__id__ >= 0 && value.__id__ < scene.length,
      'Broken scene reference',
    );
  for (const v of Object.values(value)) inspect(v);
}
inspect(scene);
function compressUuid(uuid) {
  const hex = uuid.replace(/-/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = hex.slice(0, 5);
  for (let i = 5; i < 32; i += 3) {
    const value = parseInt(hex.slice(i, i + 3), 16);
    result += chars[value >> 6] + chars[value & 63];
  }
  return result;
}
const scriptMeta = json('assets/scripts/presentation/TownBootstrap.ts.meta');
const component = scene.find((v) => v.__type__ === compressUuid(scriptMeta.uuid));
assert.ok(component, 'Bootstrap UUID does not match script meta');
assert.match(read('assets/scripts/presentation/TownBootstrap.ts'), /@ccclass\('TownBootstrap'\)/);
const uuids = new Set();
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(rel);
      continue;
    }
    if (entry.name.endsWith('.meta')) {
      const m = json(rel);
      assert.equal(typeof m.uuid, 'string');
      assert.ok(!uuids.has(m.uuid), `Duplicate UUID ${rel}`);
      uuids.add(m.uuid);
    }
    if (entry.name.endsWith('.ts')) {
      const source = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      assert.ok(!source.includes("declare module 'cc'"), 'Do not fake engine typings');
      if (rel.includes(`${path.sep}domain${path.sep}`))
        assert.ok(
          !/from\s+['"]cc['"]|\bDate\.now\(|\bMath\.random\(|\blocalStorage\s*\./.test(source),
          'Domain must remain independent/deterministic',
        );
    }
  }
}
walk('assets');
console.log(
  `Project structure verified: ${scene.length} serialized objects, ${uuids.size} unique asset IDs.`,
);
console.log('NOT RUN: Creator import, scene rendering, Web/Android build, device validation.');
