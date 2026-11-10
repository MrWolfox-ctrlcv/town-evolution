/** Offline integrity preflight only. Does not claim graphics, interactions or device approval. */
const path = require('node:path');
const { verifyPackage } = require('./provenance.cjs');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.PREVIEW_OUT || 'build/preview');
const { provenance: p, provenanceSha256 } = verifyPackage(
  root,
  out,
  process.env.PREVIEW_PROVENANCE_SHA256,
);
console.log(
  JSON.stringify(
    {
      result: 'PASS',
      verification: 'source/runtime integrity only',
      sourceSnapshot: p.sourceSnapshot,
      sourceCommit: p.sourceCommit,
      sourceFiles: p.sourceManifest.entries.length,
      sourceSha256: p.sourceManifest.sha256,
      runtimeFiles: p.runtimeManifest.entries.length,
      runtimeSha256: p.runtimeManifest.sha256,
      identitySha256: p.identitySha256,
      provenanceSha256,
    },
    null,
    2,
  ),
);
