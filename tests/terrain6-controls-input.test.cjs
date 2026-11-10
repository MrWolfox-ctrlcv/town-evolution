const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
class Node {
  children = [];
  constructor(name) {
    this.name = name;
  }
  addChild(node) {
    this.children.push(node);
  }
  setPosition(x, y, z) {
    this.position = { x, y, z };
  }
  destroy() {
    this.destroyed = true;
  }
}
function load(name, deps = {}) {
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, `assets/scripts/presentation/${name}.ts`), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id in deps) return deps[id];
      if (id === 'cc')
        return {
          Node,
          Vec3: class {
            constructor(x, y, z) {
              Object.assign(this, { x, y, z });
            }
          },
        };
      if (id.startsWith('../')) return require(path.join(root, '.domain-build', id.slice(3)));
      return {};
    },
    module,
    module.exports,
  );
  return module.exports;
}
function fixture() {
  let hit = { x: 17, z: 23, point: { x: 18, y: 5.2, z: 23.1 }, surface: 'wall' };
  const commands = [];
  const state = {
    terrainVersion: 6,
    terrain6: { nextOperation: 12 },
    inventory: { soil: 2.25, stone: 0.5 },
  };
  const session = {
    state,
    message: '',
    run: (c) => {
      commands.push(c);
      return c.expectedOperation === state.terrain6.nextOperation;
    },
  };
  const map = { contains: (p) => p.x >= 0, screenRay: (p) => p, cancelGesture() {} };
  const town = {
    pickTerrain: () => hit,
    isGroundReady: () => true,
    pickBuilding: () => null,
    pickTree: () => null,
    pickDrop: () => null,
    pickStack: () => null,
  };
  const Factory = class {
    shape(parent, name) {
      const node = new Node(name);
      parent.addChild(node);
      return node;
    }
    dispose() {}
  };
  const { V6TerrainTool } = load('V6TerrainTool', {
    '../domain/editable-world': { getEditableWorld: () => ({ size: 224 }) },
    '../domain/guards': { integer: (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max },
    './ModelFactory': { ModelFactory: Factory },
    '../domain/v6-edit-level': { terrain6EditLevel: () => 2 },
    '../domain/v6-edit-plan': {
      previewTerrain6Edit: (s, c) => ({
        allowed: c.expectedOperation === s.terrain6.nextOperation,
        reason: '地形已变化',
        cost: { soil: 0.25, stone: 0 },
        yield: { soil: 1 / 4096, stone: 0 },
        height: 4.2,
      }),
    },
    '../domain/v6-edit-surface': { getV6EditSurface: () => ({ range: () => [5.2, 5.2] }) },
  });
  const parent = new Node('Root');
  const tool = new V6TerrainTool(parent, session, map, town, () => {});
  return { tool, session, commands, parent, town, setHit: (value) => (hit = value) };
}
test('terrain drag uses wall owner cell and preserves the captured operation and source', () => {
  const f = fixture();
  f.tool.begin(9, 'fill', 'soil');
  f.tool.move(9, { x: 50, y: 50 });
  assert.equal(f.commands.length, 0);
  assert.ok(
    f.parent.children[0].position.y >= 5.2,
    'outline must not sit under the current terrain',
  );
  f.session.state.terrain6.nextOperation++;
  f.session.state.inventory.soil = 9;
  f.tool.end(9, { x: 50, y: 50 });
  assert.equal(f.commands.length, 1);
  assert.deepEqual(f.commands[0], {
    type: 'editTerrain6',
    x: 17,
    z: 23,
    level: 2,
    expectedOperation: 12,
    kind: 'fill',
    material: 'soil',
    source: { type: 'inventory', item: 'soil', amount: 2.25 },
  });
});
test('wrong pointer, cancel, off-map release and pending chunk never submit an edit', () => {
  const f = fixture();
  f.tool.begin(9, 'dig', 'soil');
  f.tool.end(10, { x: 50, y: 50 });
  f.tool.cancel();
  f.tool.end(9, { x: 50, y: 50 });
  f.tool.begin(9, 'dig', 'soil');
  f.tool.end(9, { x: -1, y: 50 });
  f.tool.begin(9, 'dig', 'soil');
  f.setHit(null);
  f.tool.end(9, { x: 50, y: 50 });
  assert.equal(f.commands.length, 0);
});
test('buildings, trees, drops and piles block the terrain tool', () => {
  for (const method of ['pickBuilding', 'pickTree', 'pickDrop', 'pickStack']) {
    const f = fixture();
    f.town[method] = () => 'blocker';
    f.tool.begin(9, 'dig', 'soil');
    f.tool.end(9, { x: 50, y: 50 });
    assert.equal(f.commands.length, 0, method);
  }
});
test('dig preview displays a positive fragment exactly, never zero', () => {
  const f = fixture();
  f.tool.begin(9, 'dig', 'soil');
  f.tool.move(9, { x: 50, y: 50 });
  assert.match(f.session.message, /1\/4096/);
});
test('MapCamera uses actual terrain height and never falls through an unready chunk', () => {
  const { MapCamera } = load('MapCamera');
  const map = Object.create(MapCamera.prototype);
  map.screenRay = () => ({ o: { x: 10, y: 20, z: 30 }, d: { x: -0.2, y: -1, z: -0.4 } });
  map.hooks = { ground: () => ({ x: 8, y: 7, z: 25 }) };
  assert.deepEqual({ ...map.ground({ x: 1, y: 1 }) }, { x: 8, y: 7, z: 25 });
  map.hooks.ground = () => null;
  assert.equal(map.ground({ x: 1, y: 1 }), null);
  assert.deepEqual({ ...map.ground({ x: 1, y: 1 }, 3) }, { x: 6.6, y: 3, z: 23.2 });
});
test('explicit farm mode targets terrain owner without replacing legacy resource gathering', () => {
  const { diggingToolCommand } = load('DiggingToolCommand');
  const session = { state: { terrainVersion: 6, naturalResources: [] } };
  const town = {
    pickNatural: () => null,
    pickBuilding: () => null,
    pickTree: () => null,
    pickStack: () => null,
    pickTerrain: () => ({ x: 17, z: 23 }),
  };
  const map = { ground: () => ({ x: 18, y: 5.2, z: 23.1 }) };
  assert.deepEqual(diggingToolCommand(session, town, map, {}, {}), {
    type: 'useTool',
    tool: 'diggingTool',
    x: 17,
    z: 23,
  });
  session.state.terrainVersion = 4;
  session.state.naturalResources = [{ id: 'rock', kind: 'stone' }];
  town.pickNatural = () => 'rock';
  assert.deepEqual(diggingToolCommand(session, town, map, {}, {}), {
    type: 'gatherNatural',
    resourceId: 'rock',
  });
});
test('nearby touch candidates are occluded on their own sample ray, not only the center ray', () => {
  const sample = { sample: true };
  const context = {};
  const { TownObjectPicking } = load('TownObjectPicking', {
    './TouchPicking': {
      touchPickContext: () => context,
      nearerHit: (a, b) => (!a || b.distance < a.distance ? b : a),
      nearbyTouchHit: (_context, candidates) => candidates[0]?.pick(sample) ?? null,
    },
  });
  const resources = {
    pickTree: () => null,
    pickStack: () => null,
    pickNatural: () => null,
    pickDrop: () => null,
    touchCandidates: () => [{ pick: () => ({ kind: 'tree', id: 'behind-hill', distance: 10 }) }],
  };
  const picker = new TownObjectPicking(
    () => resources,
    () => null,
    () => [],
    (ray) => (ray === sample ? 5 : null),
  );
  assert.equal(picker.hit({}), null);
  const visible = new TownObjectPicking(
    () => resources,
    () => null,
    () => [],
    () => 11,
  );
  assert.equal(visible.hit({}).id, 'behind-hill');
});
test('controller streams both v5 and v6 each frame without changing legacy scheduling', () => {
  const { TownController } = load('TownController', {
    './TownStreamingFrame': load('TownStreamingFrame'),
  });
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const controller = Object.create(TownController.prototype);
    let frames = 0;
    controller.session = { state: { terrainVersion: version } };
    controller.hud = { tick() {} };
    controller.map = {
      tick() {},
      maxTerrainError: () => 0.05,
      maxOverviewError: () => 0.25,
      visibleBounds: (height) => ({ height, minX: 0, minZ: 0, maxX: 12, maxZ: 14 }),
    };
    controller.town = {
      frame: (land, trees, lodSpan) => {
        frames++;
        assert.equal(land.height, version === 6 ? 72.015 : 64);
        assert.equal(trees.height, version === 6 ? 72.015 : 4);
        if (version === 6) assert.equal(lodSpan, 14);
      },
    };
    controller.projectSelection = () => {};
    controller.elapsed = 0;
    controller.tools = { checkTerrainGesture: () => true };
    controller.tick(0.01);
    assert.equal(frames, version >= 5 ? 1 : 0);
  }
});
test('v6 raised terrain and roofs stay between clip planes at close zoom and pan limits', () => {
  const {
    cameraDepth,
    fittedOrthoHeight,
    homeZoom,
    clampMapZoom,
    V6_VIEW_TOP,
  } = require('../.domain-build/application/CameraFraming');
  const length = Math.hypot(15, 20, 18),
    planar = Math.hypot(15, 18);
  const forward = { x: 15 / length, y: 20 / length, z: 18 / length };
  const right = { x: 18 / planar, y: 0, z: -15 / planar };
  const up = {
    x: (-15 * 20) / (length * planar),
    y: planar / length,
    z: (-18 * 20) / (length * planar),
  };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  for (const aspect of [0.3, 0.5, 1, 2, 3])
    for (const zoom of [clampMapZoom(0, 192), homeZoom(192), 0.4, 1, 1.8]) {
      const height = fittedOrthoHeight(aspect, 192) * zoom;
      const depth = cameraDepth(192, height, V6_VIEW_TOP),
        distance = Math.hypot(depth.x, depth.y, depth.z);
      assert.ok(depth.y > V6_VIEW_TOP);
      for (const focus of [-4, 6, 96, 196])
        for (let x = -4; x <= 196; x += 5)
          for (let z = -4; z <= 196; z += 5)
            for (const y of [-4, 0, 6.4, 46, 64.015, V6_VIEW_TOP]) {
              const relative = { x: x - focus, y, z: z - focus };
              if (
                Math.abs(dot(relative, up)) > height ||
                Math.abs(dot(relative, right)) > height * aspect
              )
                continue;
              const projectedDepth = distance - dot(relative, forward);
              assert.ok(
                projectedDepth > depth.near && projectedDepth < depth.far,
                JSON.stringify({ aspect, zoom, focus, x, y, z, projectedDepth, depth }),
              );
            }
      assert.deepEqual(
        cameraDepth(192, height),
        cameraDepth(192, height, 20),
        'legacy default must remain exact',
      );
    }
});
test('v6 visible bounds include high-platform trees at viewport edges', () => {
  const { cameraDepth, V6_VIEW_TOP } = require('../.domain-build/application/CameraFraming');
  const length = Math.hypot(15, 20, 18),
    planar = Math.hypot(15, 18);
  const forward = { x: 15 / length, y: 20 / length, z: 18 / length };
  const right = { x: 18 / planar, y: 0, z: -15 / planar };
  const up = {
    x: (-15 * 20) / (length * planar),
    y: planar / length,
    z: (-18 * 20) / (length * planar),
  };
  const height = 6,
    depth = cameraDepth(192, height, V6_VIEW_TOP);
  const eye = { x: 96 + depth.x, y: depth.y, z: 96 + depth.z };
  const camera = {
    rect: { x: 0, y: 0, width: 1, height: 1 },
    screenPointToRay(x, y, ray) {
      const u = ((x / 400) * 2 - 1) * height,
        v = ((y / 400) * 2 - 1) * height;
      ray.o = {
        x: eye.x + right.x * u + up.x * v,
        y: eye.y + up.y * v,
        z: eye.z + right.z * u + up.z * v,
      };
      ray.d = { x: -forward.x, y: -forward.y, z: -forward.z };
    },
  };
  const { cameraVisibleBounds } = load('CameraVisibility', {
    cc: { geometry: { Ray: class {} }, screen: { windowSize: { width: 400, height: 400 } } },
  });
  const bounds = cameraVisibleBounds(camera, V6_VIEW_TOP),
    legacy = cameraVisibleBounds(camera, 4);
  let missingFromLegacy = 0;
  for (const x of [1, 399])
    for (const y of [1, 399]) {
      const ray = {};
      camera.screenPointToRay(x, y, ray);
      const t = (67 - ray.o.y) / ray.d.y;
      const p = { x: ray.o.x + ray.d.x * t, z: ray.o.z + ray.d.z * t };
      assert.ok(
        t > 0 &&
          p.x >= bounds.minX &&
          p.x <= bounds.maxX &&
          p.z >= bounds.minZ &&
          p.z <= bounds.maxZ,
      );
      if (p.x < legacy.minX || p.x > legacy.maxX || p.z < legacy.minZ || p.z > legacy.maxZ)
        missingFromLegacy++;
    }
  assert.ok(
    missingFromLegacy > 0,
    'the old 4-high envelope must demonstrate the clipped high-platform case',
  );
});
test('v6 shadow culling range is explicit and resets to the exact old default', () => {
  const sun = { shadowDistance: 100, shadowInvisibleOcclusionRange: 32 };
  const { fitTownShadowDepth } = load('SceneLighting', {
    cc: { Layers: { Enum: { DEFAULT: 1 } }, DirectionalLight: class {} },
  });
  const camera = {
    enabledInHierarchy: true,
    visibility: 1,
    far: 220,
    near: 0.1,
    node: {
      activeInHierarchy: true,
      scene: { getChildByName: () => ({ getComponent: () => sun }) },
    },
  };
  fitTownShadowDepth(camera, 72.015);
  assert.equal(sun.shadowInvisibleOcclusionRange, 72.015);
  assert.equal(sun.shadowDistance, 220);
  camera.node.activeInHierarchy = false;
  fitTownShadowDepth(camera);
  assert.equal(
    sun.shadowInvisibleOcclusionRange,
    72.015,
    'inactive title must not change the live world',
  );
  camera.node.activeInHierarchy = true;
  fitTownShadowDepth(camera);
  assert.equal(sun.shadowInvisibleOcclusionRange, 32);
});
test('all lifted object routes use published v6 terrain rather than their old zero plane', () => {
  const interaction = load('TerrainInteraction');
  const ray = { o: { x: 30, y: 30, z: 30 }, d: { x: -0.2, y: -1, z: -0.3 } };
  for (const name of ['BuildingDrag', 'StackDrag', 'DropDrag']) {
    const Type = load(name, { './TerrainInteraction': interaction })[name];
    const drag = Object.create(Type.prototype);
    drag.session = { state: { terrainVersion: 6 } };
    drag.town = { pickTerrain: () => ({ x: 17, z: 23, point: { x: 18, y: 7, z: 23.5 } }) };
    const point = drag.ground(ray);
    assert.ok(point.x > 17 && point.x < 18, name + ' must keep vertical face owner');
    assert.equal(point.y, 7);
    drag.town.pickTerrain = () => null;
    assert.equal(drag.ground(ray), null, name + ' must reject pending terrain');
    drag.session.state.terrainVersion = 4;
    assert.deepEqual({ ...drag.ground(ray) }, { x: 24, y: 0, z: 21 });
  }
});
test('building height derivation changes only the preview copy', () => {
  const { buildingPreview } = load('TerrainInteraction', {
    '../domain/geometry': {
      validatePlacement: (_state, b) => {
        b.baseElevation = 7;
      },
    },
  });
  const original = { id: 'house', kind: 'house', x: 1, z: 2, rotation: 0, baseElevation: 1 };
  const preview = buildingPreview({ terrainVersion: 6 }, original);
  assert.equal(preview.baseElevation, 7);
  assert.equal(original.baseElevation, 1);
  assert.equal(buildingPreview({ terrainVersion: 4 }, original), original);
});
test('entity assembly keeps absolute building height exactly once under an elevated marker', () => {
  const { entityAssemblyPreview } = load('EntityAssemblyPreview');
  const source = { id: 'a', kind: 'house', x: 1, z: 1, rotation: 0, baseElevation: 5 };
  const result = { id: 'b', kind: 'house', x: 4, z: 4, rotation: 0, baseElevation: 7 };
  const rootNode = new Node('marker');
  rootNode.setPosition(2, 5, 2);
  const shapes = [],
    bases = [];
  const factory = {
    shape: (...args) => shapes.push(args),
    building: (...args) => {
      bases.push(args[5]);
      const node = new Node('preview');
      node.setPosition(0, args[5], 0);
      return node;
    },
  };
  entityAssemblyPreview(
    rootNode,
    factory,
    { terrainVersion: 6, buildings: [source], mapSeed: 1, lastSeenAt: 1, landExtensions: [] },
    [{ id: 'a' }],
    result,
    2,
    2,
    true,
  );
  assert.deepEqual(bases, [7]);
  assert.equal(rootNode.children[0].position.y, 2.025);
  assert.equal(rootNode.position.y + rootNode.children[0].position.y, 7.025);
  assert.ok(shapes.every((args) => Math.abs(args[3] - 0.15) < 1e-10));
});
test('tool outlines accept local height offsets without flattening higher selected cells', () => {
  const { toolOutline } = load('ToolOutline');
  const shapes = [],
    factory = { shape: (...args) => shapes.push(args) };
  toolOutline(factory, new Node('marker'), 0, 0)(1, 2, 1, 1, 'gold', 3.14);
  assert.equal(shapes.length, 4);
  assert.ok(shapes.every((args) => args[3] === 3.14));
});
test('resident terrain warnings remain separate from session state and clear on recovery', () => {
  const { TownView } = load('TownView');
  const town = Object.create(TownView.prototype);
  let problem = '地形细节过多，请拉近或缩小视域';
  town.island = { surfaceProblem: () => problem, isLoading: () => false };
  town.resources = { loading: false };
  const { TownController } = load('TownController', {
    '../domain/game': { getCapacity: () => 100, getUsedStorage: () => 1 },
    '../application/CommerceSelection': { tradeItems: () => ['vegetable'] },
    './ObjectContext': { objectTarget: () => null },
    './HudDescription': { description: () => '原操作详情' },
    './HudActions': { actions: () => [], rotationAction: () => null },
  });
  const controller = Object.create(TownController.prototype);
  controller.session = { state: { coins: 12 }, statusMessage: '原保存提示' };
  controller.ui = { tradeItem: 'vegetable', profile: 'v6-preview' };
  controller.town = town;
  town.sync = () => {};
  let rendered;
  controller.hud = { render: (data) => ((rendered = data), false) };
  controller.deferredLayout = { update: () => false };
  controller.tools = { active: false };
  controller.projectSelection = () => {};
  controller.refresh();
  assert.equal(rendered.message, problem);
  assert.equal(rendered.detail, '原操作详情');
  assert.equal(controller.session.statusMessage, '原保存提示');
  problem = null;
  controller.refresh();
  assert.equal(rendered.message, '原保存提示');
  const toast = fs.readFileSync(
    path.join(root, 'assets/scripts/presentation/StatusToast.ts'),
    'utf8',
  );
  assert.match(toast, /请先取消\|地形细节过多/);
  assert.match(toast, /this\.warning \|\| Date\.now\(\) < this\.expiry/);
});
test('top storage count and physical merge hints retain exact smallest material quantities', () => {
  let used = 1 + 1 / 4096;
  const { ResourceCounters } = load('ResourceCounters', {
    '../domain/game': { getUsedStorage: () => used, getCapacity: () => 60 },
  });
  const counters = Object.create(ResourceCounters.prototype);
  counters.values = [{}, {}];
  counters.render({ coins: 12 });
  assert.equal(counters.values[1].string, '1+1/4096 / 60');
  used = 1;
  counters.render({ coins: 12 });
  assert.equal(counters.values[1].string, '1/60', 'legacy whole-unit label is unchanged');
  const { DropDrag } = load('DropDrag', {
    '../domain/game': { dropMovePlan: () => ({ transferAmount: 1 / 4096, remaining: 3 / 4096 }) },
  });
  const drag = Object.create(DropDrag.prototype);
  drag.session = { state: {} };
  assert.equal(
    drag.hint({ type: 'moveDrop', target: { type: 'ground', stack: {} } }),
    '合并1/4096份 · 余下3/4096份留原地',
  );
  const { stackDropHint } = require('../.domain-build/application/StackDrop');
  const state = {
    groundStacks: [
      { x: 1, z: 1, item: 'soil', amount: 1 / 4096 },
      { x: 2, z: 1, item: 'soil', amount: 1 },
    ],
  };
  assert.equal(
    stackDropHint(state, { type: 'moveStack', fromX: 1, fromZ: 1, x: 2, z: 1 }),
    '松手合并1/4096份',
  );
});
test('terrain drags cannot cross a same-operation restored checkpoint or a different seed', () => {
  for (const change of [
    (s) => {
      s.terrain6 = { ...s.terrain6 };
    },
    (s) => {
      s.mapSeed = 8;
    },
  ]) {
    const f = fixture();
    f.session.state.mapSeed = 7;
    f.tool.begin(4, 'fill', 'soil');
    f.tool.move(4, { x: 100, y: 100 });
    change(f.session.state);
    assert.equal(f.tool.valid(), false);
    f.tool.end(4, { x: 100, y: 100 });
    assert.deepEqual(f.commands, []);
    assert.equal(f.session.state.inventory.soil, 2.25);
  }
});
test('a detail eviction seen by the actual controller frame cancels a drag permanently before reappearance', () => {
  const f = fixture();
  f.tool.begin(4, 'dig', 'soil');
  f.tool.move(4, { x: 100, y: 100 });
  const { ToolRouter } = load('ToolRouter');
  const router = Object.create(ToolRouter.prototype);
  router.terrain = f.tool;
  const { TownController } = load('TownController', {
    './TownStreamingFrame': load('TownStreamingFrame'),
  });
  const controller = Object.create(TownController.prototype);
  controller.session = f.session;
  controller.hud = { tick() {} };
  controller.map = {
    tick() {},
    maxTerrainError: () => 0.05,
    maxOverviewError: () => 0.25,
    visibleBounds: () => ({ minX: 0, minZ: 0, maxX: 12, maxZ: 14 }),
  };
  controller.town = { frame() {} };
  controller.tools = router;
  controller.elapsed = 0;
  controller.projectSelection = () => {};
  let cancelled = 0;
  controller.cancelInput = () => {
    cancelled++;
    f.tool.cancel();
  };
  f.town.isGroundReady = () => false;
  controller.tick(0.01);
  assert.equal(cancelled, 1);
  f.town.isGroundReady = () => true;
  controller.tick(0.01);
  f.tool.end(4, { x: 100, y: 100 });
  assert.deepEqual(f.commands, [], 'reappearing fine geometry cannot revive the old pointer');
});
test('display-only buildings stay opaque but cannot be selected through center or neighboring rays', () => {
  const sample = {},
    context = {};
  let ready = false;
  const { TownObjectPicking } = load('TownObjectPicking', {
    './TouchPicking': {
      touchPickContext: () => context,
      nearerHit: (a, b) => (!a || b.distance < a.distance ? b : a),
      nearbyTouchHit: (_context, candidates) =>
        candidates
          .map((c) => c.pick(sample))
          .filter(Boolean)
          .sort((a, b) => a.distance - b.distance)[0] ?? null,
    },
  });
  const resources = {
    pickTree: () => null,
    pickStack: () => null,
    pickNatural: () => null,
    pickDrop: () => null,
    touchCandidates: () => [],
  };
  const surfaces = [
    { id: 'far-visible', surface: { nearScreen: () => true, distance: () => 4 } },
    { id: 'ready-behind', surface: { nearScreen: () => true, distance: () => 6 } },
  ];
  for (const center of [true, false]) {
    const picker = new TownObjectPicking(
      () => resources,
      () => (center ? { id: 'far-visible', distance: 4 } : null),
      () => surfaces,
      () => 10,
      (hit) => hit.id !== 'far-visible' || ready,
    );
    assert.equal(
      picker.hit({}),
      null,
      'an unusable opaque winner must not reveal a usable object behind it',
    );
    ready = true;
    assert.equal(picker.hit({}).id, 'far-visible');
    ready = false;
  }
});
test('far or pending farm surfaces cannot harvest or plant, while the same saved IDs work after detail readiness', () => {
  const { TownView } = load('TownView', { './TownFarmPicking': load('TownFarmPicking') });
  const town = Object.create(TownView.prototype);
  let ready = false,
    groundDistance = 20;
  town.island = { isGroundReady: () => ready, terrainDistance: () => groundDistance };
  const farm = {
    id: 'saved-farm',
    kind: 'farm',
    x: 3,
    z: 4,
    rotation: 0,
    farmSize: 3,
    cropJobs: Array(9).fill(null),
  };
  town.previous = { terrainVersion: 6, buildings: [farm], lastSeenAt: 1 };
  town.lifted = null;
  town.resources = {
    pickTree: () => null,
    pickStack: () => null,
    pickNatural: () => null,
    pickDrop: () => null,
  };
  town.buildings = new Map([
    [
      farm.id,
      {
        kind: 'farm',
        crops: { cellAt: () => 4, isSoil: () => false },
        surface: { hit: () => ({ node: {}, distance: 5 }) },
      },
    ],
  ]);
  const ray = { o: { x: 0, y: 10, z: 0 }, d: { x: 0, y: -1, z: 0 } };
  assert.equal(town.pickCrop(ray), null);
  assert.equal(town.pickPlant(ray), null);
  ready = true;
  assert.equal(town.pickCrop(ray).buildingId, 'saved-farm');
  assert.equal(town.pickPlant(ray).cell, 4);
  groundDistance = 3;
  assert.equal(
    town.pickCrop(ray),
    null,
    'the displayed distant hill still occludes a ready crop behind it',
  );
  town.previous.terrainVersion = 4;
  ready = false;
  assert.equal(
    town.pickCrop(ray).buildingId,
    'saved-farm',
    'legacy worlds do not acquire terrain6 readiness restrictions',
  );
});
test('the actual bootstrap session replacement disposes old terrain gestures before opening a restored branch', () => {
  for (const seed of [7, 8]) {
    const f = fixture();
    f.session.state.mapSeed = 7;
    f.tool.begin(9, 'fill', 'soil');
    const replacement = {
      state: { ...f.session.state, mapSeed: seed, terrain6: { ...f.session.state.terrain6 } },
    };
    const order = [];
    const { TownBootstrap } = load('TownBootstrap', {
      cc: { _decorator: { ccclass: () => (Type) => Type }, Component: class {}, Node },
      './TownController': {
        TownController: class {
          constructor() {
            order.push('new');
          }
          layout() {}
          resume() {
            order.push('resume');
          }
        },
      },
    });
    const boot = Object.create(TownBootstrap.prototype);
    boot.controllerSession = f.session;
    boot.controller = {
      dispose: () => {
        order.push('dispose');
        f.tool.dispose();
      },
    };
    boot.stage = new Node('old');
    boot.node = new Node('parent');
    boot.menu = { hide() {} };
    boot.flow = {
      session: replacement,
      page: 'game',
      profile: 'v6-preview',
      consumeTownActions: () => false,
    };
    boot.render();
    assert.deepEqual(order, ['dispose', 'new', 'resume']);
    f.tool.end(9, { x: 100, y: 100 });
    assert.deepEqual(f.commands, []);
  }
});
test('unready visible resources occlude ready objects before usability gating for center and neighboring samples', () => {
  const sample = {},
    context = {};
  const { TownObjectPicking } = load('TownObjectPicking', {
    './TouchPicking': {
      touchPickContext: () => context,
      nearerHit: (a, b) => (!a || b.distance < a.distance ? b : a),
      nearbyTouchHit: (_context, candidates) =>
        candidates
          .map((c) => c.pick(sample))
          .filter(Boolean)
          .sort((a, b) => a.distance - b.distance)[0] ?? null,
    },
  });
  for (const kind of ['tree', 'pile', 'natural', 'drop'])
    for (const center of [true, false]) {
      const blocker = {
        kind,
        id: 'unready-visible',
        distance: 4,
        x: 3,
        z: 4,
        point: { x: 3, y: 2, z: 4 },
      };
      const seen = [];
      const resources = {
        pickTree: () => null,
        pickStack: () => null,
        pickNatural: () => null,
        pickDrop: () => null,
        touchCandidates: (_context, _exclude, includeBlocked) => {
          seen.push(includeBlocked);
          return !center && includeBlocked ? [{ pick: () => blocker }] : [];
        },
      };
      const name = {
        tree: 'pickTree',
        pile: 'pickStack',
        natural: 'pickNatural',
        drop: 'pickDrop',
      }[kind];
      resources[name] = (_ray, ...args) => {
        const includeBlocked = args.at(-1);
        seen.push(includeBlocked);
        return center && includeBlocked ? blocker : null;
      };
      const picker = new TownObjectPicking(
        () => resources,
        () => (center ? { id: 'behind', distance: 6 } : null),
        () => [{ id: 'behind', surface: { nearScreen: () => true, distance: () => 6 } }],
        () => 10,
        (hit) => hit.kind === 'building',
      );
      assert.equal(
        picker.hit({}),
        null,
        kind + ' must not be skipped to select the building behind',
      );
      assert.ok(seen.every(Boolean));
    }
});
test('display-only trees and drops still block farm tools instead of disappearing from the nearest-surface query', () => {
  const { townFarmToolSurface } = load('TownFarmPicking');
  const buildings = new Map([
    [
      'farm',
      {
        kind: 'farm',
        surface: { hit: () => ({ node: {}, distance: 5 }) },
        crops: { cellAt: () => 0, isSoil: () => false },
      },
    ],
  ]);
  for (const kind of ['pickTree', 'pickStack', 'pickNatural', 'pickDrop']) {
    const resources = {
      pickTree: () => null,
      pickStack: () => null,
      pickNatural: () => null,
      pickDrop: () => null,
    };
    resources[kind] = (_ray, ...args) => (args.at(-1) ? { distance: 4 } : null);
    const hit = townFarmToolSurface(
      {},
      buildings,
      null,
      resources,
      () => 10,
      () => true,
    );
    assert.equal(hit.buildingId, null, kind + ' must remain an opaque foreground blocker');
  }
});

test('terrain tool ignores out-of-world coast hits without poisoning the drag', () => {
  for (const x of [-1, 224, 0.5, NaN, Infinity]) {
    const f = fixture();
    f.tool.begin(9, 'dig', 'soil');
    f.setHit({ x, z: 23, point: { x, y: 0, z: 23 } });
    assert.doesNotThrow(() => f.tool.move(9, { x: 50, y: 50 }));
    assert.equal(f.commands.length, 0);
    f.setHit({ x: 17, z: 23, point: { x: 17.5, y: 2, z: 23.5 } });
    f.tool.end(9, { x: 50, y: 50 });
    assert.equal(
      f.commands.length,
      1,
      'valid destination still works after invalid intermediate coast hit',
    );
  }
});
