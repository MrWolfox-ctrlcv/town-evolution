/** Cache correctness/maintenance guards, not graphics or device timing tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { verifySnapshot, readSnapshot } = require('../scripts/title-snapshot.cjs');
const { titleIsland, TITLE_ISLAND_TIME } = require('../.domain-build/application/TitleIsland');
const { importSave } = require('../.domain-build/domain/save');

function sourceCopy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'town-title-cache-'));
  fs.mkdirSync(path.join(root, 'assets/scripts/application'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.copyFileSync('scripts/title-snapshot.cjs', path.join(root, 'scripts/title-snapshot.cjs'));
  fs.copyFileSync('tsconfig.domain.json', path.join(root, 'tsconfig.domain.json'));
  fs.cpSync('assets/scripts/domain', path.join(root, 'assets/scripts/domain'), { recursive: true });
  for (const name of ['TitleIsland.ts', 'TitleSnapshot.ts'])
    fs.copyFileSync(
      `assets/scripts/application/${name}`,
      path.join(root, `assets/scripts/application/${name}`),
    );
  return root;
}

test('title cache matches its current source/content provenance and strict save validation', () => {
  const metadata = verifySnapshot();
  assert.equal(metadata.bytes, Buffer.byteLength(readSnapshot().TITLE_SNAPSHOT_JSON));
  assert.deepEqual(
    importSave(readSnapshot().TITLE_SNAPSHOT_JSON, TITLE_ISLAND_TIME),
    titleIsland(),
  );
  // Existing title-island.test compares every field to the current procedural demo generator.
  assert.match(fs.readFileSync('scripts/preview/build.cjs', 'utf8'), /verifySnapshot\(\)/);
});

test('each title creation avoids procedural demo generation, while playable demo generation remains intact', () => {
  const demo = require('../.domain-build/domain/demo'),
    original = demo.createDemoGame;
  let calls = 0;
  demo.createDemoGame = () => {
    calls++;
    throw new Error('Cold title must not regenerate the demo');
  };
  try {
    const first = titleIsland(),
      second = titleIsland();
    assert.deepEqual(first, second);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.naturalResources, second.naturalResources);
    assert.notStrictEqual(first.trees, second.trees);
    assert.equal(calls, 0);
  } finally {
    demo.createDemoGame = original;
  }
  assert.strictEqual(demo.createDemoGame, original);
});

test('source, compiler settings, fixed-clock or generated-data changes cannot silently ship a stale title', () => {
  for (const change of ['domain', 'clock', 'data', 'hash', 'missing', 'config', 'generator']) {
    const root = sourceCopy();
    try {
      verifySnapshot(root);
      const name =
        change === 'config'
          ? 'tsconfig.domain.json'
          : change === 'generator'
            ? 'scripts/title-snapshot.cjs'
            : change === 'domain'
              ? 'assets/scripts/domain/config.ts'
              : change === 'clock'
                ? 'assets/scripts/application/TitleIsland.ts'
                : 'assets/scripts/application/TitleSnapshot.ts';
      const file = path.join(root, name),
        source = fs.readFileSync(file, 'utf8');
      if (change === 'missing') fs.rmSync(file);
      else if (['domain', 'config', 'generator'].includes(change))
        fs.writeFileSync(
          file,
          source + '\n// A current source edit requires deliberate regeneration.\n',
        );
      else if (change === 'clock')
        fs.writeFileSync(file, source.replace('1700000000000', '1700000000001'));
      else if (change === 'data')
        fs.writeFileSync(file, source.replace('"coins":1000', '"coins":1001'));
      else
        fs.writeFileSync(
          file,
          source.replace(readSnapshot(root).TITLE_SNAPSHOT_DATA_HASH, '0'.repeat(64)),
        );
      assert.throws(() => verifySnapshot(root), /npm run title:snapshot/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('failed compiler writes and incompatible output settings never replace a title cache with stale output', () => {
  for (const change of ['emit-write', 'noEmit', 'outDir', 'rootDir', 'emitDeclarationOnly']) {
    const root = sourceCopy();
    try {
      fs.symlinkSync(
        fs.realpathSync('node_modules'),
        path.join(root, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const output = path.join(root, '.domain-build/domain');
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(
        path.join(output, 'demo.js'),
        'exports.createDemoGame = () => ({ stale: true });',
      );
      if (change === 'emit-write') fs.mkdirSync(path.join(output, 'demo.d.ts'));
      else {
        const file = path.join(root, 'tsconfig.domain.json');
        const config = JSON.parse(fs.readFileSync(file, 'utf8'));
        config.compilerOptions[change] =
          change === 'outDir' ? '.elsewhere' : change === 'rootDir' ? '.' : true;
        fs.writeFileSync(file, JSON.stringify(config));
      }
      const file = path.join(root, 'assets/scripts/application/TitleSnapshot.ts');
      const before = fs.readFileSync(file, 'utf8');
      const result = spawnSync(process.execPath, ['scripts/title-snapshot.cjs'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(
        result.stderr,
        change === 'emit-write' ? /TS5033/ : /requires CommonJS JavaScript output/,
      );
      assert.equal(fs.readFileSync(file, 'utf8'), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
