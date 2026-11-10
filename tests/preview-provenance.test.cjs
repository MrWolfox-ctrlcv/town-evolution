/** File fixtures test identity/integrity only; never assert browser or GPU success. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  sourceIdentity,
  createProvenance,
  verifyPackage,
  writeProvenance,
} = require('../scripts/preview/provenance.cjs');
const metadata = {
  buildMode: 'release',
  debug: false,
  compressed: true,
  engine: '411f98df047c25902f93440d4b22925c2fb65461',
  compiler: '723a5b6eb76cd9a1e740566bbbb62ae32ae081ef',
  builtAtUtc: '2026-11-08T00:00:00.000Z',
  standalonePreview: true,
};
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-provenance-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'repo'),
    out = path.join(base, 'dist');
  function put(dir, file, bytes = file) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), bytes);
  }
  for (const file of [
    'package.json',
    'package-lock.json',
    'assets/main.ts',
    'scripts/preview/build.cjs',
    'scripts/preview/capture.cjs',
    'scripts/preview/generated/effects.cache.json',
    '.github/workflows/preview.yml',
  ])
    put(root, file);
  for (const file of [
    'app.js',
    'terrain6-worker.js',
    'engine/cc.js',
    'index.html',
    'system.js',
    'environment/ground.png',
  ])
    put(out, file);
  const build = (start = sourceIdentity(root)) => {
    const value = createProvenance(root, out, start, metadata);
    writeProvenance(out, value);
    return value;
  };
  return { base, root, out, put, build };
}
function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function init(root) {
  git(root, 'init');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
}
test('snapshot identity is complete, stable and distinct from a Git commit', (t) => {
  const f = fixture(t),
    first = sourceIdentity(f.root);
  assert.equal(first.sourceSnapshot, true);
  assert.equal(first.sourceCommit, null);
  assert.equal(first.sourceTrackedChanges, null);
  assert.equal(first.sourceManifest.entries.length, 7);
  assert.deepEqual(sourceIdentity(f.root), first);
  f.put(f.root, 'build/generated.js');
  f.put(f.root, '.domain-build/main.js');
  f.put(f.root, 'node_modules/dependency/index.js');
  assert.deepEqual(sourceIdentity(f.root), first);
  f.build();
  assert.equal(verifyPackage(f.root, f.out).provenance.sourceSnapshot, true);
});
test('a nested snapshot never borrows an enclosing Git commit', (t) => {
  const f = fixture(t);
  init(f.base);
  assert.equal(sourceIdentity(f.root).sourceCommit, null);
  f.build();
  verifyPackage(f.root, f.out);
});
for (const target of ['source', 'runtime'])
  for (const change of ['modify', 'add', 'delete'])
    test(`${target} ${change} after build is rejected`, (t) => {
      const f = fixture(t);
      f.build();
      const dir = target === 'source' ? f.root : f.out;
      const file = target === 'source' ? 'scripts/preview/capture.cjs' : 'environment/ground.png';
      if (change === 'modify') f.put(dir, file, 'changed');
      if (change === 'add') f.put(dir, 'unexpected.txt');
      if (change === 'delete') fs.unlinkSync(path.join(dir, file));
      assert.throws(() => verifyPackage(f.root, f.out));
    });
test('all copied loaders and images are checked, not only three bundles', (t) => {
  const f = fixture(t);
  f.build();
  f.put(f.out, 'index.html', 'stale');
  assert.throws(() => verifyPackage(f.root, f.out));
});
test('source change while building prevents a provenance record', (t) => {
  const f = fixture(t),
    start = sourceIdentity(f.root);
  f.put(f.root, 'package-lock.json', 'changed');
  assert.throws(() => f.build(start));
});
test('missing, malformed, unknown and re-signed unsafe provenance fails closed', (t) => {
  const f = fixture(t),
    good = f.build();
  for (const mutation of [
    (p) => {
      p.schema = 99;
    },
    (p) => {
      delete p.sourceManifest;
    },
    (p) => {
      p.sourceManifest.entries[0].path = '../outside';
    },
    (p) => {
      p.runtimeManifest.entries[0].path = '/outside';
    },
    (p) => {
      p.sourceManifest.entries.push(p.sourceManifest.entries[0]);
    },
    (p) => {
      p.runtimeManifest.entries[0].bytes = -1;
    },
    (p) => {
      p.sourceCommit = 'a'.repeat(40);
    },
    (p) => {
      p.sourceTrackedChanges = '';
    },
    (p) => {
      p.sourceSnapshot = false;
    },
    (p) => {
      p.engine = 'a'.repeat(40);
    },
    (p) => {
      p.identitySha256 = '0'.repeat(64);
    },
  ]) {
    const p = structuredClone(good);
    mutation(p);
    fs.writeFileSync(path.join(f.out, 'provenance.json'), JSON.stringify(p));
    assert.throws(() => verifyPackage(f.root, f.out));
  }
  fs.unlinkSync(path.join(f.out, 'provenance.json'));
  assert.throws(() => verifyPackage(f.root, f.out));
});
test('mixing another source manifest with this package is rejected', (t) => {
  const f = fixture(t),
    good = f.build();
  f.put(f.root, 'assets/main.ts', 'new source');
  const newer = f.build();
  newer.sourceManifest = good.sourceManifest;
  fs.writeFileSync(path.join(f.out, 'provenance.json'), JSON.stringify(newer));
  assert.throws(() => verifyPackage(f.root, f.out));
});
test('Git acceptance requires exact root, clean tracked source and matching commit', (t) => {
  const f = fixture(t);
  init(f.root);
  const p = f.build();
  assert.equal(p.sourceSnapshot, false);
  assert.equal(p.sourceCommit, git(f.root, 'rev-parse', 'HEAD'));
  verifyPackage(f.root, f.out);
  f.put(f.root, 'assets/main.ts', 'dirty');
  assert.throws(() => verifyPackage(f.root, f.out));
  f.build();
  assert.throws(() => verifyPackage(f.root, f.out));
  git(f.root, 'add', '.');
  git(f.root, 'commit', '-m', 'changed');
  assert.throws(() => verifyPackage(f.root, f.out));
  f.build();
  verifyPackage(f.root, f.out);
});
test('snapshot/source and runtime symlinks are rejected, excluded dependency link is allowed', (t) => {
  const f = fixture(t);
  fs.symlinkSync(f.out, path.join(f.root, 'node_modules'), 'dir');
  f.build();
  verifyPackage(f.root, f.out);
  fs.symlinkSync(path.join(f.root, 'package.json'), path.join(f.root, 'alias.json'));
  assert.throws(() => sourceIdentity(f.root));
  fs.unlinkSync(path.join(f.root, 'alias.json'));
  fs.symlinkSync(path.join(f.out, 'app.js'), path.join(f.out, 'alias.js'));
  assert.throws(() => verifyPackage(f.root, f.out));
});
test('frozen serving bytes remain the verified bytes after filesystem mutation', (t) => {
  const f = fixture(t);
  f.build();
  const { files } = verifyPackage(f.root, f.out);
  f.put(f.out, 'app.js', 'tamper after preflight');
  assert.equal(files.get('app.js').toString(), 'app.js');
  assert.throws(() => verifyPackage(f.root, f.out));
});
test('an externally pinned provenance digest rejects replacement', (t) => {
  const f = fixture(t);
  f.build();
  const result = verifyPackage(f.root, f.out);
  verifyPackage(f.root, f.out, result.provenanceSha256);
  assert.throws(() => verifyPackage(f.root, f.out, '0'.repeat(64)));
});
test('broken local .git never downgrades to a snapshot', (t) => {
  const f = fixture(t);
  f.put(f.root, '.git', 'gitdir: does-not-exist');
  assert.throws(() => sourceIdentity(f.root));
  fs.unlinkSync(path.join(f.root, '.git'));
  fs.symlinkSync(path.join(f.base, 'absent'), path.join(f.root, '.git'));
  assert.throws(() => sourceIdentity(f.root));
});
test('a symlinked provenance record cannot escape package inventory', (t) => {
  const f = fixture(t);
  f.build();
  const external = path.join(f.base, 'provenance.json');
  fs.renameSync(path.join(f.out, 'provenance.json'), external);
  fs.symlinkSync(external, path.join(f.out, 'provenance.json'));
  assert.throws(() => verifyPackage(f.root, f.out));
});
test('a local .git pointer to a foreign worktree cannot downgrade to snapshot', (t) => {
  const f = fixture(t),
    foreign = path.join(f.base, 'foreign');
  f.put(foreign, 'readme');
  init(foreign);
  git(foreign, 'config', 'core.worktree', foreign);
  f.put(f.root, '.git', `gitdir: ${path.join(foreign, '.git')}\n`);
  assert.throws(() => sourceIdentity(f.root));
});
test('nested folders named like output roots remain source inputs', (t) => {
  const f = fixture(t);
  f.build();
  f.put(f.root, 'assets/build/new-input.txt');
  assert.throws(() => verifyPackage(f.root, f.out));
});
test('a malicious Git environment cannot impersonate a snapshot checkout', (t) => {
  const f = fixture(t),
    foreign = path.join(f.base, 'foreign');
  f.put(foreign, 'readme');
  init(foreign);
  const oldDir = process.env.GIT_DIR,
    oldTree = process.env.GIT_WORK_TREE;
  try {
    process.env.GIT_DIR = path.join(foreign, '.git');
    process.env.GIT_WORK_TREE = f.root;
    assert.equal(sourceIdentity(f.root).sourceSnapshot, true);
    assert.equal(sourceIdentity(f.root).sourceCommit, null);
  } finally {
    if (oldDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = oldDir;
    if (oldTree === undefined) delete process.env.GIT_WORK_TREE;
    else process.env.GIT_WORK_TREE = oldTree;
  }
});
test('fresh fixture compilation rejects stale, missing and extra compiled output', (t) => {
  const f = fixture(t);
  const { verifyFixtures } = require('../scripts/preview/acceptance-fixtures.cjs');
  const typescript = require('typescript/package.json').version;
  f.put(f.root, 'package.json', JSON.stringify({ devDependencies: { typescript } }));
  f.put(
    f.root,
    'tsconfig.domain.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'CommonJS',
        rootDir: 'src',
        outDir: '.domain-build',
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  f.put(f.root, 'src/index.ts', 'export const value = 1;\n');
  fs.symlinkSync(
    path.resolve(__dirname, '../node_modules'),
    path.join(f.root, 'node_modules'),
    'dir',
  );
  const compiler = require.resolve('typescript/lib/tsc.js');
  execFileSync(process.execPath, [compiler, '-p', path.join(f.root, 'tsconfig.domain.json')]);
  verifyFixtures(f.root);
  const compiled = path.join(f.root, '.domain-build/index.js');
  const original = fs.readFileSync(compiled);
  f.put(f.root, '.domain-build/index.js', 'stale');
  assert.throws(() => verifyFixtures(f.root));
  fs.writeFileSync(compiled, original);
  f.put(f.root, '.domain-build/extra.js');
  assert.throws(() => verifyFixtures(f.root));
  fs.unlinkSync(path.join(f.root, '.domain-build/extra.js'));
  fs.unlinkSync(compiled);
  assert.throws(() => verifyFixtures(f.root));
});
