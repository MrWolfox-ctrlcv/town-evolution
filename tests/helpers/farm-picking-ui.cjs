/** Canonical CPU meshes with production TownView, FarmTools and GameSession routing. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const domain = (name) => require(path.join(root, '.domain-build', name));
const game = domain('domain/game');
const { GameSession } = domain('application/GameSession');
const { farmCellCenter, farmCellAt } = domain('application/FarmCells');
const { MeshSurface } = domain('application/MeshSurface');
const { compileAsset } = domain('art/MeshCompiler');
const { ASSETS } = domain('art/AssetCatalog');
const { growthStage } = domain('art/CropGrowth');
const { cropPose, cropPhase } = domain('art/CropAnimation');
class Node {
  constructor(name) {
    this.name = name;
    this.children = [];
    this.active = true;
    this.renderers = [];
  }
  addChild(node) {
    this.children.push(node);
    node.parent = this;
  }
  getChildByName(name) {
    return this.children.find((node) => node.name === name) ?? null;
  }
  get activeInHierarchy() {
    return this.active && (!this.parent || this.parent.activeInHierarchy);
  }
  getComponentsInChildren() {
    return [...this.renderers, ...this.children.flatMap((node) => node.getComponentsInChildren())];
  }
  getWorldMatrix(out) {
    const w = this.world ?? {};
    // A narrow affine adapter, not an emulation of the Cocos scene graph. Existing tests may
    // still set diagonal world transforms; wind tests supply the complete current matrix.
    out.affine = w.affine?.slice() ?? [
      w.sx ?? 1,
      0,
      0,
      w.tx ?? 0,
      0,
      w.sy ?? 1,
      0,
      w.ty ?? 0,
      0,
      0,
      w.sz ?? 1,
      w.tz ?? 0,
    ];
    this.onPick?.();
  }
  destroy() {}
  setRotationFromEuler() {}
}
class Mat4 {
  static determinant(m) {
    const [a, b, c, , d, e, f, , g, h, i] = m.affine;
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  }
  static invert(out, m) {
    const [a, b, c, tx, d, e, f, ty, g, h, i, tz] = m.affine;
    const determinant = Mat4.determinant(m);
    const inverse = [
      (e * i - f * h) / determinant,
      (c * h - b * i) / determinant,
      (b * f - c * e) / determinant,
      0,
      (f * g - d * i) / determinant,
      (a * i - c * g) / determinant,
      (c * d - a * f) / determinant,
      0,
      (d * h - e * g) / determinant,
      (b * g - a * h) / determinant,
      (a * e - b * d) / determinant,
      0,
    ];
    for (const row of [0, 4, 8])
      inverse[row + 3] = -(inverse[row] * tx + inverse[row + 1] * ty + inverse[row + 2] * tz);
    out.affine = inverse;
  }
}
function transform(out, p, m, translated) {
  const a = m.affine,
    { x, y, z } = p;
  return Object.assign(out, {
    x: a[0] * x + a[1] * y + a[2] * z + (translated ? a[3] : 0),
    y: a[4] * x + a[5] * y + a[6] * z + (translated ? a[7] : 0),
    z: a[8] * x + a[9] * y + a[10] * z + (translated ? a[11] : 0),
  });
}
const Vec3 = {
  transformMat4: (out, p, m) => transform(out, p, m, true),
  transformMat4Normal: (out, p, m) => transform(out, p, m, false),
};
const cc = {
  Node,
  Mat4,
  Vec3,
  MeshRenderer: class {},
  geometry: {
    Ray: class {
      constructor() {
        this.o = {};
        this.d = {};
      }
    },
  },
  gfx: { PrimitiveMode: { TRIANGLE_LIST: 4 }, AttributeName: { ATTR_POSITION: 'position' } },
};
class ModelFactory {
  shape(parent, name) {
    const node = new Node(name);
    parent.addChild(node);
    return node;
  }
  dispose() {}
}
function load(name, dependencies = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(
    fs.readFileSync(path.join(root, 'assets/scripts/presentation', `${name}.ts`), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  new Function('require', 'module', 'exports', source)(
    (id) =>
      dependencies[id] ??
      (id === 'cc'
        ? cc
        : id === './ModelFactory'
          ? { ModelFactory }
          : [
                './TownObjectPicking',
                './GroundTreePicking',
                './TownFarmPicking',
                './V6TreeView',
                './TerrainInteraction',
                './DiggingToolCommand',
                './ToolOutline',
                './CameraVisibility',
                './TownStreamingFrame',
                './V6TownNavigation',
                './TownUiActions',
                './UiContracts',
                './RouteActions',
                './TouchPicking',
                './TownChanges',
                './LooseDropView',
                './DropSupport',
                './BuildingOutline',
                './SingleHammerPreview',
                './DropDrag',
              ].includes(id)
            ? load(id.slice(2), dependencies)
            : id.startsWith('../')
              ? domain(id.slice(3))
              : {}),
    module,
    module.exports,
  );
  return module.exports;
}
const meshQueries = new WeakMap();
class CountedMeshSurface extends MeshSurface {
  constructor(positions, indices) {
    super(positions, indices);
    this.sourcePositions = positions;
  }
  distance(r, limit) {
    meshQueries.get(this.sourcePositions)?.();
    return super.distance(r, limit);
  }
}
const { ModelPicking } = load('ModelPicking', {
  '../application/MeshSurface': { MeshSurface: CountedMeshSurface },
});
const { RenderedCropPicking } = load('RenderedCropPicking', {
  './ModelPicking': { ModelPicking },
});
const { TownView } = load('TownView', {
  './ModelPicking': { ModelPicking },
  './RenderedCropPicking': { RenderedCropPicking },
});
const { FarmTools } = load('FarmTools');
const direction = { x: -0.49, y: -0.65, z: -0.58 };
function rotate(x, z, rotation) {
  return { x: [x, z, -x, -z][rotation], z: [z, -x, -z, x][rotation] };
}
function project(point) {
  const t = (0.17 - point.y) / direction.y;
  return { x: (point.x + direction.x * t) * 100, y: (point.z + direction.z * t) * 100 };
}
function ray(point) {
  return {
    o: {
      x: point.x / 100 - direction.x * 10,
      y: 0.17 - direction.y * 10,
      z: point.y / 100 - direction.z * 10,
    },
    d: direction,
  };
}
function surface(asset, center, rotation) {
  const mesh = compileAsset(ASSETS[asset]);
  const positions = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = rotate(mesh.positions[i], mesh.positions[i + 2], rotation);
    positions.push(center.x + p.x, mesh.positions[i + 1], center.z + p.z);
  }
  return { mesh: { ...mesh, positions }, surface: new MeshSurface(positions, mesh.indices) };
}
/** Same soil pivot and intrinsic YZX Euler convention as CropMotion (local Y is zero).
 * For column vectors the local matrix is Rz * Rx * scale, matching crop-animation.test.
 * The surrounding quarter-turn is the farm grid, not a second crop Euler rotation.
 */
function poseCropPoint(point, center, rotation, pose) {
  const local = rotate(point.x - center.x, point.z - center.z, (4 - rotation) % 4);
  const x = local.x * pose.width,
    y = (point.y - 0.17) * pose.height,
    z = local.z * pose.width;
  const rx = (pose.leanX * Math.PI) / 180,
    rz = (pose.leanZ * Math.PI) / 180;
  const yy = y * Math.cos(rx) - z * Math.sin(rx),
    zz = y * Math.sin(rx) + z * Math.cos(rx);
  const world = rotate(x * Math.cos(rz) - yy * Math.sin(rz), zz, rotation);
  return {
    x: center.x + world.x,
    y: 0.17 + x * Math.sin(rz) + yy * Math.cos(rz),
    z: center.z + world.z,
  };
}
function poseMatrix(center, rotation, pose) {
  const origin = poseCropPoint({ x: 0, y: 0, z: 0 }, center, rotation, pose);
  const axes = ['x', 'y', 'z'].map((axis) =>
    poseCropPoint(
      { x: +(axis === 'x'), y: +(axis === 'y'), z: +(axis === 'z') },
      center,
      rotation,
      pose,
    ),
  );
  return ['x', 'y', 'z'].flatMap((axis) => [
    ...axes.map((p) => p[axis] - origin[axis]),
    origin[axis],
  ]);
}
function fixture({
  rotation = 0,
  large = false,
  crop = 'wheat',
  irrigated = game.CROPS[crop].field === 'water',
  occupied = true,
  ready = true,
  syncMode = 'batch',
} = {}) {
  let now = 100000;
  const state = game.createGame(now, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.inventory.vegetable = 8;
  const farm = state.buildings.find((b) => b.id === 'b2');
  Object.assign(farm, { x: 6, z: 6, rotation });
  if (irrigated) farm.irrigated = true;
  if (large) farm.farmSize = 6;
  farm.cropJobs = Array(large ? 36 : 9).fill(null);
  const size = large ? 6 : 3;
  const occupiedCell = Array.from({ length: size * size }, (_, cell) => cell).sort((a, b) => {
    const p = farmCellCenter(farm, a),
      q = farmCellCenter(farm, b);
    return q.x + q.z - p.x - p.z;
  })[0];
  if (occupied) {
    farm.cropJobs[occupiedCell] = {
      id: 'j3',
      crop,
      startedAt: ready ? now - 15000 : now,
      readyAt: ready ? now : now + 15000,
    };
    if (crop === 'rice')
      Object.assign(farm.cropJobs[occupiedCell], {
        startedAt: ready ? now - game.CROPS.rice.durationMs : now,
        readyAt: ready ? now : now + game.CROPS.rice.durationMs,
        durationMs: game.CROPS.rice.durationMs,
        yield: game.CROPS.rice.yield,
      });
    state.nextId = 4;
  }
  const values = new Map();
  let writes = 0;
  const session = new GameSession(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        writes++;
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    },
    () => now,
    () => state,
  );
  assert.equal(session.save(), true);
  const town = Object.create(TownView.prototype);
  town.lifted = null;
  const resourceQueries = [];
  town.resources = Object.fromEntries(
    ['pickTree', 'pickNatural', 'pickStack'].map((method) => [
      method,
      () => {
        resourceQueries.push(method);
        return null;
      },
    ]),
  );
  let crops = [];
  let refreshes = 0;
  const pickingVisits = [],
    pickingQueries = [];
  function sync() {
    const b = session.state.buildings.find((entry) => entry.id === farm.id);
    const span = large ? 4 : 2;
    const bed = surface(
      `${large ? 'farm-large-bed' : 'farm-cell-bed'}${b.irrigated ? '-water' : ''}`,
      { x: b.x + span / 2, z: b.z + span / 2 },
      rotation,
    );
    crops = b.cropJobs.flatMap((job, cell) =>
      job
        ? [
            {
              cell,
              ...surface(
                `crop-cell-${job.crop}-${growthStage(job, now)}`,
                farmCellCenter(b, cell),
                rotation,
              ),
            },
          ]
        : [],
    );
    const cropRoot = new Node('Farm'),
      grid = new Node('FarmGrid');
    cropRoot.addChild(grid);
    function rendered(name, data) {
      const node = new Node(name);
      node.onPick = () => pickingVisits.push(name);
      meshQueries.set(data.mesh.positions, () => pickingQueries.push(name));
      node.renderers.push({
        node,
        enabled: true,
        mesh: {
          struct: { primitives: [{ primitiveMode: 4 }] },
          readAttribute: () => data.mesh.positions,
          readIndices: () => data.mesh.indices,
        },
      });
      return node;
    }
    grid.addChild(rendered('Soil', bed));
    for (const crop of crops) {
      const cell = new Node(`Cell${crop.cell}`),
        pivot = new Node('CropSoilPivot');
      crop.node = rendered(`Crop${crop.cell}`, crop);
      pivot.addChild(crop.node);
      cell.addChild(pivot);
      grid.addChild(cell);
    }
    town.buildings = new Map([
      [
        b.id,
        {
          kind: 'farm',
          node: cropRoot,
          crops: new RenderedCropPicking(cropRoot),
          surface: new ModelPicking(cropRoot),
        },
      ],
    ]);
    town.previous = session.state;
  }
  sync();
  function applyPose(time) {
    const b = session.state.buildings.find((entry) => entry.id === farm.id);
    for (const crop of crops) {
      const job = b.cropJobs[crop.cell];
      if (!job) continue;
      const center = farmCellCenter(b, crop.cell);
      crop.pose = cropPose(
        job,
        time,
        cropPhase(b.x, b.z, crop.cell),
        growthStage(job, now) === 'ready',
      );
      crop.node.world = { affine: poseMatrix(center, rotation, crop.pose) };
      // Independent forward-transformed oracle. Production picking still reads the original
      // cached mesh and must invert the changing node matrix rather than these posed vertices.
      const positions = [];
      for (let i = 0; i < crop.mesh.positions.length; i += 3) {
        const p = poseCropPoint(
          {
            x: crop.mesh.positions[i],
            y: crop.mesh.positions[i + 1],
            z: crop.mesh.positions[i + 2],
          },
          center,
          rotation,
          crop.pose,
        );
        positions.push(p.x, p.y, p.z);
      }
      crop.posed = {
        mesh: { ...crop.mesh, positions },
        surface: new MeshSurface(positions, crop.mesh.indices),
      };
    }
  }
  const map = {
    cancelGesture() {},
    contains: (p) => p.inside !== false,
    screenRay: ray,
    ground: (p) => ({ x: p.x / 100, z: p.y / 100 }),
  };
  const commands = [],
    commandFrames = [];
  const run = session.run.bind(session);
  session.run = (command) => {
    commands.push(command);
    commandFrames.push({
      rendered: crops.length,
      live: session.state.buildings[1].cropJobs.filter(Boolean).length,
      refreshes,
    });
    const result = run(command);
    if (syncMode === 'command') sync();
    return result;
  };
  const tools = new FarmTools(new Node('World'), session, map, town, () => {
    refreshes++;
    sync();
  });
  function cropPoint() {
    const { mesh } = crops.find((entry) => entry.cell === occupiedCell);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const p = { x: 0, y: 0, z: 0 };
      for (const vertex of mesh.indices.slice(i, i + 3)) {
        p.x += mesh.positions[vertex * 3] / 3;
        p.y += mesh.positions[vertex * 3 + 1] / 3;
        p.z += mesh.positions[vertex * 3 + 2] / 3;
      }
      const point = project(p),
        r = ray(point);
      const soilCell = farmCellAt(farm, map.ground(point));
      if (soilCell === null || soilCell === occupiedCell || p.y < 0.3) continue;
      const hit = crops.find((entry) => entry.cell === occupiedCell).surface.distance(r);
      if (hit !== null) return { point, r, soilCell, distance: hit };
    }
    assert.fail(
      'Fixture must expose a real crop triangle whose soil projection falls in another cell',
    );
  }
  return {
    session,
    town,
    map,
    tools,
    commands,
    commandFrames,
    pickingVisits,
    pickingQueries,
    resourceQueries,
    refreshes: () => refreshes,
    values,
    writes: () => writes,
    get now() {
      return now;
    },
    setNow(value) {
      now = value;
      session.resume();
      sync();
    },
    farm,
    size,
    occupiedCell,
    cropPoint,
    sync,
    applyPose,
    crops: () => crops,
  };
}
module.exports = { fixture, game, load, Node, surface, project, ray, farmCellCenter, farmCellAt };
