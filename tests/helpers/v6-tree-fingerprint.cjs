/** Float64 byte fingerprints preserve signed zero, unlike JSON number strings. */
const { createHash } = require('node:crypto');
function numbers(hash, values) {
  const bytes = Buffer.allocUnsafe(values.length * 8);
  for (let i = 0; i < values.length; i++) bytes.writeDoubleLE(values[i], i * 8);
  hash.update(String(values.length) + ':').update(bytes);
}
function meshFingerprint(mesh, hash = createHash('sha256')) {
  for (const key of ['positions', 'normals', 'colors', 'indices', 'min', 'max', 'uvs']) {
    hash.update(key + ':');
    if (mesh[key]) numbers(hash, mesh[key]);
    else hash.update('absent');
  }
  return hash;
}
function fingerprint(batch, upload) {
  const hash = meshFingerprint(batch.mesh),
    picks = createHash('sha256');
  const surfaces = [...batch.surfaces];
  batch.anchors.forEach((p, i) => {
    const [id, surface] = surfaces[i];
    picks.update(id + ':');
    numbers(picks, [p.x, p.y, p.z, ...surface.bounds.min, ...surface.bounds.max]);
    for (const dx of [-0.4, 0, 0.4])
      for (const dz of [-0.4, 0, 0.4]) {
        const distance = surface.distance({
          o: { x: p.x + dx, y: p.y + 20, z: p.z + dz },
          d: { x: 0, y: -1, z: 0 },
        });
        if (distance === null) picks.update('miss');
        else numbers(picks, [distance]);
      }
  });
  const uploadHash = createHash('sha256');
  let uploadParts = 0,
    uploadBytes = 0;
  for (const part of upload.iterateV6UploadParts(batch.mesh)) {
    meshFingerprint(part, uploadHash);
    uploadParts++;
    uploadBytes += upload.v6MeshBytes(part);
  }
  return {
    meshSha256: hash.digest('hex'),
    picksSha256: picks.digest('hex'),
    uploadSha256: uploadHash.digest('hex'),
    vertices: batch.mesh.positions.length / 3,
    triangles: batch.mesh.indices.length / 3,
    canonicalBytes: batch.bytes,
    uploadParts,
    uploadBytes,
  };
}
module.exports = { fingerprint };
