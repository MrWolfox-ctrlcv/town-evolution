const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = process.env.WOODEN_BRIDGE_ART_BUILD || '../.domain-build';
const load = (name) => require(path.resolve(__dirname, build, 'art', name));
const { woodenBridge, woodenBridgeParts, bridgeSupports, BRIDGE_DECK_TOP, BRIDGE_ROOT_HEIGHT } =
  load('WoodenBridgeKit');
const { woodenPierParts } = load('DockPierKit');
const { move } = load('AssetTypes');
const { compileAsset } = load('MeshCompiler');
const lengths = Array.from({ length: 10 }, (_, i) => i + 7);
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} versus ${b}`);
const deck = (recipe) => recipe.parts.filter((p) => /(?:deck|bank)-plank$/.test(p.name));

test('all bridge lengths retain both complete original platforms without stretching or mutation', () => {
  const source = woodenPierParts(),
    snapshot = JSON.stringify(source);
  for (const length of lengths) {
    const recipe = woodenBridge(length),
      end = length / 2 - 1;
    assert.deepEqual(recipe.parts.slice(0, source.length), move(source, [0, 0, -end]));
    assert.deepEqual(
      recipe.parts.slice(source.length, source.length * 2),
      move(source, [0, 0, end]),
    );
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-deck-plank').length, 18);
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-piling').length, 8);
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-rope-binding').length, 16);
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-rope-rail').length, 24);
    assert.equal(recipe.parts.filter((p) => p.name === 'pier-iron-nail').length, 36);
  }
  assert.equal(JSON.stringify(woodenPierParts()), snapshot);
});

test('a plank walkway spans the entire river gap and meets both banks at the occupied edge', () => {
  for (const length of lengths) {
    const recipe = woodenBridge(length),
      boards = deck(recipe).sort((a, b) => a.position[2] - b.position[2]);
    near(boards[0].position[2] - boards[0].size[2] / 2, -length / 2, 'first bank');
    near(boards.at(-1).position[2] + boards.at(-1).size[2] / 2, length / 2, 'far bank');
    for (let i = 0; i < boards.length; i++) {
      const board = boards[i];
      near(board.position[0], 0, 'centered board');
      near(board.size[0], 1.78, 'original deck width');
      near(board.position[1] + board.size[1] / 2, BRIDGE_DECK_TOP, 'flat walking surface');
      assert.equal(board.texture, 'warm-wood');
      assert.ok(board.size[2] <= 0.187, 'wood grain is not stretched over the crossing');
      if (i) {
        const previous = boards[i - 1],
          gap = board.position[2] - board.size[2] / 2 - previous.position[2] - previous.size[2] / 2;
        assert.ok(gap >= -1e-9 && gap <= 0.013 + 1e-9, `no missing or overlapping board: ${gap}`);
      }
    }
    assert.equal(recipe.parts.filter((p) => p.name === 'bridge-bank-plank').length, 2);
    assert.equal(
      recipe.parts.filter((p) => p.name === 'bridge-deck-plank').length,
      (length - 4) * 5 + 1,
    );
    assert.ok(!recipe.parts.some((p) => /water|river|ground|terrain|shore|slab/.test(p.name)));
  }
  near(BRIDGE_ROOT_HEIGHT + BRIDGE_DECK_TOP, 0.015, 'deck aligns with cleared dry bank');
});

test('segmented load-bearing beams connect both original platforms below the open plank deck', () => {
  for (const length of lengths) {
    const recipe = woodenBridge(length);
    for (const side of [-1, 1]) {
      const beams = recipe.parts
        .filter((p) => p.name.endsWith('under-beam') && p.position[0] * side > 0)
        .sort((a, b) => a.position[2] - b.position[2]);
      near(beams[0].position[2] - beams[0].size[2] / 2, -length / 2 + 0.1, 'near beam end');
      near(beams.at(-1).position[2] + beams.at(-1).size[2] / 2, length / 2 - 0.1, 'far beam end');
      for (let i = 0; i < beams.length; i++) {
        const beam = beams[i];
        assert.ok(beam.size[2] <= 1.806 + 1e-9, 'timbers remain short reused-size segments');
        assert.ok(
          beam.position[1] + beam.size[1] / 2 > 0.26,
          'beam physically meets deck underside',
        );
        if (i) {
          const previous = beams[i - 1];
          assert.ok(
            beam.position[2] - beam.size[2] / 2 <= previous.position[2] + previous.size[2] / 2,
            'beam joins overlap rather than float apart',
          );
        }
      }
    }
    const middlePosts = recipe.parts.filter((p) => p.name === 'bridge-piling');
    for (const post of middlePosts)
      assert.ok(
        recipe.parts.some(
          (p) =>
            p.name === 'bridge-cross-beam' && Math.abs(p.position[2] - post.position[2]) < 1e-9,
        ),
        'every middle post pair supports a transverse beam',
      );
  }
});

test('middle posts preserve actual round piling, cap, endgrain, rope ties and diagonal braces', () => {
  const sourceRow = woodenPierParts().filter(
    (p) =>
      p.position[2] === -0.72 &&
      (p.name.startsWith('pier-post-') ||
        ['pier-piling', 'pier-rope-binding', 'pier-diagonal-brace'].includes(p.name)),
  );
  for (const length of lengths) {
    const recipe = woodenBridge(length),
      rows = recipe.parts.filter((p) => p.name === 'bridge-cross-beam').map((p) => p.position[2]);
    assert.ok(rows.length >= 1);
    for (const z of rows) {
      const expected = move(sourceRow, [0, 0, z + 0.72]).map((p) => ({
        ...p,
        name: p.name.replace('pier-', 'bridge-'),
      }));
      const actual = recipe.parts.filter(
        (p) =>
          Math.abs(p.position[2] - z) < 1e-9 &&
          (p.name.startsWith('bridge-post-') ||
            ['bridge-piling', 'bridge-rope-binding', 'bridge-diagonal-brace'].includes(p.name)),
      );
      assert.deepEqual(actual, expected);
    }
  }
});

test('sagging round ropes join all post rows without closing the walking ends', () => {
  for (const length of lengths) {
    const recipe = woodenBridge(length),
      posts = recipe.parts.filter((p) => p.name.endsWith('piling') && p.position[0] > 0),
      rows = posts.map((p) => p.position[2]).sort((a, b) => a - b),
      ropes = recipe.parts.filter((p) => p.name.endsWith('rope-rail'));
    assert.equal(ropes.length, (rows.length - 1) * 12);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i] - rows[i - 1] <= 1.8 + 1e-9, 'no unsupported long rope spans');
      for (const x of [-0.76, 0.76]) {
        const section = ropes.filter(
          (p) => p.position[0] === x && p.position[2] > rows[i - 1] && p.position[2] < rows[i],
        );
        assert.equal(section.length, 6, 'each post pair has the original six-segment rope');
        assert.ok(
          section.some((p) => p.position[1] < 0.81),
          'rope sags visibly',
        );
        assert.ok(section.every((p) => p.shape === 'log' && !p.texture));
      }
    }
    assert.ok(
      ropes.every((p) => Math.abs(p.position[0]) === 0.76),
      'no rope across the walkway',
    );
  }
});

test('terrain footing descriptors match every original and middle post with a buried overlap', () => {
  for (const length of lengths) {
    const recipe = woodenBridge(length),
      posts = recipe.parts.filter((p) => p.name.endsWith('piling')),
      supports = bridgeSupports(length);
    assert.equal(supports.length, posts.length);
    assert.equal(new Set(supports.map((p) => `${p.x},${p.z}`)).size, supports.length);
    for (let i = 0; i < supports.length; i++) {
      const support = supports[i],
        post = posts[i];
      assert.equal(support.x, post.position[0]);
      assert.equal(support.z, post.position[2]);
      near(support.top, post.position[1] - post.size[1] / 2 + 0.005, '5mm footing overlap');
      near(support.halfWidth, 0.115, 'foot matches original piling diameter');
      assert.deepEqual(Object.keys(support).sort(), ['halfWidth', 'top', 'x', 'z']);
      assert.ok(!('bottom' in support), 'riverbed must be sampled, not hardcoded in the art');
    }
  }
});

test('every length compiles finite normalized bounded meshes inside a bridge-only budget', () => {
  for (const length of lengths) {
    const recipe = woodenBridge(length),
      mesh = compileAsset(recipe),
      vertices = mesh.positions.length / 3;
    assert.ok(mesh.indices.length / 3 < 18500, recipe.id);
    assert.ok(vertices < 25000 && recipe.parts.length <= 500, recipe.id);
    assert.equal(mesh.normals.length, mesh.positions.length);
    assert.equal(mesh.colors.length, vertices * 4);
    assert.equal(mesh.uvs.length, vertices * 2);
    assert.ok(mesh.texturedIndices.length > 0);
    assert.ok([...mesh.positions, ...mesh.normals, ...mesh.uvs].every(Number.isFinite), recipe.id);
    assert.ok(mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i < vertices));
    for (let i = 0; i < mesh.normals.length; i += 3)
      near(Math.hypot(...mesh.normals.slice(i, i + 3)), 1, 'unit surface normal');
    for (let turn = 0; turn < 4; turn++) {
      const a = (turn * Math.PI) / 2;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i],
          z = mesh.positions[i + 2];
        assert.ok(
          Math.abs(x * Math.cos(a) + z * Math.sin(a)) <= recipe.footprint[turn % 2] / 2 + 1e-9,
          `${recipe.id}/${turn}/x`,
        );
        assert.ok(
          Math.abs(-x * Math.sin(a) + z * Math.cos(a)) <=
            recipe.footprint[(turn + 1) % 2] / 2 + 1e-9,
          `${recipe.id}/${turn}/z`,
        );
      }
    }
  }
});

test('the ten finite cache keys are deterministic and reject malformed or unbounded lengths', () => {
  assert.deepEqual(woodenBridge(), woodenBridge(8));
  assert.deepEqual(woodenBridgeParts(), woodenBridge(8).parts);
  assert.deepEqual(bridgeSupports(), bridgeSupports(8));
  for (const length of lengths) {
    const recipe = woodenBridge(length);
    assert.equal(recipe.id, `wooden-bridge-${length}`);
    assert.deepEqual(recipe.footprint, [2, length]);
    assert.deepEqual(recipe, woodenBridge(length));
  }
  for (const bad of [0, -1, 6, 17, 7.5, 100000, NaN, Infinity, -Infinity, null, '8', {}, [8]])
    for (const create of [woodenBridge, woodenBridgeParts, bridgeSupports])
      assert.throws(() => create(bad), RangeError);
  const mutated = woodenBridge();
  mutated.parts[0].position[0] = 999;
  assert.notEqual(woodenBridge().parts[0].position[0], 999, 'no shared mutable recipe state');
});
