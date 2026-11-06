const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { worldSize } = require('../.domain-build/domain/world');
const { sceneGroundArt } = require('../.domain-build/art/SceneGroundArt');
for (const version of [3, 4])
  test(`v${version} paths and tufts are deterministic, legal and within a fixed mesh budget`, () => {
    const s = version === 3 ? g.createGame(100000, 42173, 3) : g.createDemoGame(100000),
      before = JSON.stringify(s),
      land = (x, z) => g.isLandCell(x, z, s.mapSeed, s.terrainVersion, s.landExtensions);
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
    const size = worldSize(s.terrainVersion);
    const m = sceneGroundArt(size, s.mapSeed, actors, land);
    assert.deepEqual(m, sceneGroundArt(size, s.mapSeed, actors, land));
    assert.equal(JSON.stringify(s), before);
    // Test the legacy 40-cell world separately, without inflating its old budget.
    assert.equal(size, version === 3 ? 40 : 192);
    assert.ok(m.indices.length / 3 < (version === 3 ? 3000 : 14000));
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
