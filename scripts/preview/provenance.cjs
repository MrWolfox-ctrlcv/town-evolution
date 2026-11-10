/** Content identity for real previews. Hashes prove integrity, not publisher authenticity. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const SOURCE_EXCLUDED = [
  '.git',
  'node_modules',
  '.domain-build',
  '.npm-cache',
  'library',
  'temp',
  'local',
  'build',
  'profiles',
];
const ENGINE = '411f98df047c25902f93440d4b22925c2fb65461';
const COMPILER = '723a5b6eb76cd9a1e740566bbbb62ae32ae081ef';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const digest = (value) => sha256(JSON.stringify(canonical(value)));
function safePath(file) {
  assert.equal(typeof file, 'string', 'Manifest path must be a string');
  assert.ok(file.length && !file.includes('\\') && !file.includes('\0'), 'Unsafe manifest path');
  assert.ok(
    !file.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':')),
    'Unsafe manifest path',
  );
}
function inventory(root, excluded = [], files = new Map()) {
  const entries = [];
  function walk(relative) {
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
      if (!relative && excluded.includes(name)) continue;
      const file = path.posix.join(relative, name);
      safePath(file);
      const stat = fs.lstatSync(path.join(root, file));
      if (stat.isDirectory()) walk(file);
      else {
        assert.ok(stat.isFile(), `Symlink or special file is not supported: ${file}`);
        const bytes = fs.readFileSync(path.join(root, file));
        entries.push({ path: file, bytes: bytes.length, sha256: sha256(bytes) });
        files.set(file, bytes);
      }
    }
  }
  walk('');
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  assert.ok(entries.length, 'Manifest must not be empty');
  return {
    schema: 1,
    algorithm: 'sha256',
    excluded: [...excluded],
    entries,
    sha256: digest(entries),
  };
}
function validateManifest(manifest, excluded) {
  assert.deepEqual(Object.keys(manifest).sort(), [
    'algorithm',
    'entries',
    'excluded',
    'schema',
    'sha256',
  ]);
  assert.equal(manifest.schema, 1, 'Unknown manifest schema');
  assert.equal(manifest.algorithm, 'sha256');
  assert.deepEqual(manifest.excluded, excluded, 'Unexpected inventory exclusions');
  assert.ok(Array.isArray(manifest.entries) && manifest.entries.length);
  let previous = '';
  for (const entry of manifest.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['bytes', 'path', 'sha256']);
    safePath(entry.path);
    assert.ok(entry.path > previous, 'Manifest entries must be unique and sorted');
    assert.ok(!excluded.includes(entry.path.split('/')[0]), 'Excluded path in manifest');
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, 'Invalid file size');
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    previous = entry.path;
  }
  assert.equal(manifest.sha256, digest(manifest.entries), 'Invalid manifest digest');
}
function sourceIdentity(root) {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
      ),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  let top;
  try {
    top = git(['rev-parse', '--show-toplevel']);
  } catch (error) {
    // A broken local Git checkout must not silently downgrade to a snapshot.
    if (fs.lstatSync(path.join(root, '.git'), { throwIfNoEntry: false })) throw error;
  }
  const ownGit = top && fs.realpathSync(top) === fs.realpathSync(root);
  if (fs.lstatSync(path.join(root, '.git'), { throwIfNoEntry: false }))
    assert.ok(ownGit, 'Local Git metadata must identify this exact source root');
  return {
    sourceCommit: ownGit ? git(['rev-parse', 'HEAD']) : null,
    sourceTrackedChanges: ownGit ? git(['status', '--porcelain', '--untracked-files=no']) : null,
    sourceSnapshot: !ownGit,
    sourceManifest: inventory(root, SOURCE_EXCLUDED),
  };
}
function createProvenance(root, out, start, metadata) {
  assert.deepEqual(sourceIdentity(root), start, 'Source changed during build');
  const provenance = {
    schema: 1,
    ...metadata,
    ...start,
    runtimeManifest: inventory(out, ['provenance.json']),
  };
  provenance.sha256 = Object.fromEntries(
    ['app.js', 'terrain6-worker.js', 'engine/cc.js'].map((file) => {
      const entry = provenance.runtimeManifest.entries.find((entry) => entry.path === file);
      assert.ok(entry, `Missing runtime entry: ${file}`);
      return [file, entry.sha256];
    }),
  );
  provenance.identitySha256 = digest(provenance);
  return provenance;
}
function writeProvenance(out, provenance) {
  fs.writeFileSync(path.join(out, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
}
function verifyPackage(root, out, expectedSha256) {
  assert.ok(
    fs.lstatSync(path.join(out, 'provenance.json')).isFile(),
    'Provenance must be a regular file',
  );
  const provenanceBytes = fs.readFileSync(path.join(out, 'provenance.json'));
  const provenanceSha256 = sha256(provenanceBytes);
  if (expectedSha256 !== undefined) {
    assert.match(expectedSha256, /^[a-f0-9]{64}$/, 'Invalid expected provenance SHA-256');
    assert.equal(
      provenanceSha256,
      expectedSha256,
      'Provenance differs from externally pinned digest',
    );
  }
  const p = JSON.parse(provenanceBytes);
  assert.deepEqual(
    Object.keys(p).sort(),
    [
      'schema',
      'buildMode',
      'debug',
      'compressed',
      'engine',
      'compiler',
      'builtAtUtc',
      'standalonePreview',
      'sourceCommit',
      'sourceTrackedChanges',
      'sourceSnapshot',
      'sourceManifest',
      'runtimeManifest',
      'sha256',
      'identitySha256',
    ].sort(),
    'Unknown provenance format',
  );
  assert.equal(p.schema, 1, 'Unknown provenance schema');
  assert.equal(p.engine, ENGINE, 'Expected official Cocos 3.8.8 engine');
  assert.equal(p.compiler, COMPILER, 'Expected official Cocos effect compiler');
  assert.ok(['debug', 'release'].includes(p.buildMode));
  assert.equal(p.debug, p.buildMode === 'debug');
  assert.equal(p.compressed, p.buildMode === 'release');
  assert.equal(p.standalonePreview, true);
  assert.equal(new Date(p.builtAtUtc).toISOString(), p.builtAtUtc);
  validateManifest(p.sourceManifest, SOURCE_EXCLUDED);
  validateManifest(p.runtimeManifest, ['provenance.json']);
  const { identitySha256, ...bound } = p;
  assert.equal(identitySha256, digest(bound), 'Source/runtime provenance binding mismatch');
  const actual = sourceIdentity(root);
  assert.equal(p.sourceSnapshot, actual.sourceSnapshot, 'Source kind mismatch');
  assert.equal(p.sourceCommit, actual.sourceCommit, 'Source commit mismatch');
  assert.equal(p.sourceTrackedChanges, actual.sourceTrackedChanges, 'Source status mismatch');
  if (actual.sourceSnapshot) {
    assert.equal(p.sourceCommit, null, 'Snapshot must not impersonate a commit');
    assert.equal(p.sourceTrackedChanges, null);
  } else {
    assert.match(p.sourceCommit, /^[a-f0-9]{40}$/);
    assert.equal(p.sourceTrackedChanges, '', 'Runtime and acceptance source must be Git-clean');
  }
  assert.deepEqual(p.sourceManifest, actual.sourceManifest, 'Source files differ from build');
  const files = new Map();
  assert.deepEqual(
    p.runtimeManifest,
    inventory(out, ['provenance.json'], files),
    'Runtime files differ from build',
  );
  assert.deepEqual(
    p.sha256,
    Object.fromEntries(
      ['app.js', 'terrain6-worker.js', 'engine/cc.js'].map((file) => [
        file,
        sha256(files.get(file)),
      ]),
    ),
    'Runtime bundle hashes disagree',
  );
  files.set('provenance.json', provenanceBytes);
  return { provenance: p, provenanceSha256, files };
}
module.exports = {
  sourceIdentity,
  createProvenance,
  writeProvenance,
  verifyPackage,
  inventory,
  sha256,
  SOURCE_EXCLUDED,
};
