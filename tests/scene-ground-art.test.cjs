const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { sceneGroundArt } = require('../.domain-build/art/SceneGroundArt');
test('scene paths and ground shading are deterministic, legal and do not mutate demo state', () => {
  const s = g.createDemoGame(100000),
    before = JSON.stringify(s),
    land = (x, z) => g.isLandCell(x, z, s.mapSeed);
  const actors = [
    ...s.buildings.map((b) => ({
      x: b.x,
      z: b.z,
      ...g.footprint(b),
      rotation: b.rotation,
      tree: false,
    })),
    ...s.trees.map((t) => ({ x: t.x, z: t.z, width: 1, depth: 1, rotation: 0, tree: true })),
  ];
  const m = sceneGroundArt(24, s.mapSeed, actors, land);
  assert.deepEqual(m, sceneGroundArt(24, s.mapSeed, actors, land));
  assert.equal(JSON.stringify(s), before);
  assert.ok(m.indices.length / 3 < 2000);
  assert.ok([...m.positions, ...m.normals, ...m.colors].every(Number.isFinite));
  assert.ok(m.colors.every((n) => n >= 0 && n <= 1));
  for (let i = 0; i < m.indices.length; i += 3) {
    const pts = m.indices.slice(i, i + 3).map((n) => m.positions.slice(n * 3, n * 3 + 3));
    const x = pts.reduce((s, p) => s + p[0], 0) / 3,
      z = pts.reduce((s, p) => s + p[2], 0) / 3;
    assert.equal(land(Math.floor(x), Math.floor(z)), true);
    if (pts[0][1] < 0.025)
      for (const a of actors)
        assert.ok(
          !(x >= a.x && x < a.x + a.width && z >= a.z && z < a.z + a.depth),
          'paving cannot cross occupied building/tree cells',
        );
  }
});
