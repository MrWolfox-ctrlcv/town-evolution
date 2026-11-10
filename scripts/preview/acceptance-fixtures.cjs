/** Compare acceptance fixtures with a fresh compilation of the verified source. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { inventory } = require('./provenance.cjs');
function verifyFixtures(root) {
  const compiler = require.resolve('typescript/lib/tsc.js', { paths: [root] });
  const compilerRoot = path.dirname(path.dirname(compiler));
  const compilerManifest = inventory(compilerRoot);
  const actualVersion = JSON.parse(
    fs.readFileSync(path.join(compilerRoot, 'package.json')),
  ).version;
  const expectedVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json')))
    .devDependencies.typescript;
  assert.equal(actualVersion, expectedVersion, 'Acceptance compiler version must match source');
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'town-acceptance-fixtures-'));
  try {
    execFileSync(
      process.execPath,
      [compiler, '-p', path.join(root, 'tsconfig.domain.json'), '--outDir', fresh],
      {
        cwd: root,
        stdio: 'pipe',
        timeout: 120000,
      },
    );
    const manifest = inventory(fresh);
    assert.deepEqual(
      inventory(path.join(root, '.domain-build')),
      manifest,
      'Acceptance fixtures are stale: run npm run build:domain in a fresh .domain-build directory',
    );
    assert.deepEqual(
      inventory(compilerRoot),
      compilerManifest,
      'Acceptance compiler changed during compilation',
    );
    return { compilerVersion: actualVersion, compilerManifest, manifest };
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
  }
}
module.exports = { verifyFixtures };
