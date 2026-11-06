import type { GameState, NaturalResource, LandCell } from './types';
import type { V6CellCheckpoint, V6Material } from './v6-edit-types';
import { getV6World } from './v6-world';
import { initialResourceCap, v6EditPlane as plane } from './v6-material-volume';
import { requireRule, integer } from './guards';
/** One immutable state snapshot drives rendering, picking, edits and placement. */
type SurfaceState = Pick<
  GameState,
  'terrainVersion' | 'terrain6' | 'mapSeed' | 'naturalResources' | 'landExtensions'
>;
const surfaces = new WeakMap<
  object,
  {
    cells: GameState['terrain6'];
    list: V6CellCheckpoint[] | undefined;
    resources: GameState['naturalResources'];
    extensions: GameState['landExtensions'];
    surface: ReturnType<typeof createSurface>;
  }
>();
export function getV6EditSurface(state: SurfaceState): ReturnType<typeof createSurface> {
  const found = surfaces.get(state);
  if (
    found &&
    found.cells === state.terrain6 &&
    found.list === state.terrain6?.cells &&
    found.resources === state.naturalResources &&
    found.extensions === state.landExtensions
  )
    return found.surface;
  const surface = createSurface(state);
  surfaces.set(state, {
    cells: state.terrain6,
    list: state.terrain6?.cells,
    resources: state.naturalResources,
    extensions: state.landExtensions,
    surface,
  });
  return surface;
}
function createSurface(state: SurfaceState) {
  requireRule(
    state.terrainVersion === 6 && state.terrain6?.format === 1,
    '此地图没有规则地形编辑状态',
  );
  const world = getV6World(state.mapSeed);
  const edits = new Map(state.terrain6.cells.map((c) => [`${c.x},${c.z}`, c]));
  const resources = new Map(state.naturalResources.map((r) => [`${r.x},${r.z}`, r]));
  const extensions = state.landExtensions;
  const extensionSet = new Set(extensions.map((p) => `${p.x},${p.z}`));
  const original = (x: number, z: number) => edits.get(`${x},${z}`);
  const capAt = (x: number, z: number) =>
    initialResourceCap(
      world,
      x,
      z,
      original(x, z)?.initialResourceAmount ?? resources.get(`${x},${z}`)?.amount ?? 0,
    );
  function checkPoint(px: number, pz: number, x: number, z: number): void {
    requireRule(
      integer(x, world.size - 1) &&
        integer(z, world.size - 1) &&
        Number.isFinite(px) &&
        Number.isFinite(pz) &&
        px >= x &&
        px <= x + 1 &&
        pz >= z &&
        pz <= z + 1,
      '地形采样位置无效',
    );
  }
  function retainedHeightInCell(px: number, pz: number, x: number, z: number): number {
    checkPoint(px, pz, x, z);
    if (extensionSet.has(`${x},${z}`)) return plane(0);
    const c = original(x, z),
      cut = c?.cutLevel === null || !c ? Infinity : plane(c.cutLevel);
    return Math.min(
      Math.max(world.groundHeight(px, pz), Math.min(world.naturalHeight(px, pz), capAt(x, z))),
      cut,
    );
  }
  function heightInCell(px: number, pz: number, x: number, z: number): number {
    checkPoint(px, pz, x, z);
    const c = original(x, z);
    return c ? plane(c.level) : retainedHeightInCell(px, pz, x, z);
  }
  function range(x: number, z: number): readonly [number, number] {
    let lo = Infinity,
      hi = -Infinity;
    for (let j = 0; j <= 4; j++)
      for (let i = 0; i <= 4; i++) {
        const h = heightInCell(x + i / 4, z + j / 4, x, z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    return [lo, hi];
  }
  function resourceAt(x: number, z: number): NaturalResource | null {
    return resources.get(`${x},${z}`) ?? null;
  }
  function exposedResourceAt(x: number, z: number): NaturalResource | null {
    const r = resourceAt(x, z);
    if (!r) return null;
    const c = original(x, z);
    if (!c) return r;
    for (let j = 0; j <= 4; j++)
      for (let i = 0; i <= 4; i++) {
        const px = x + i / 4,
          pz = z + j / 4;
        const retained = retainedHeightInCell(px, pz, x, z);
        if (retained === plane(c.level) && retained > world.groundHeight(px, pz)) return r;
      }
    return null;
  }
  function materialAt(px: number, pz: number, y: number, x: number, z: number): V6Material {
    const c = original(x, z);
    if (c && y > retainedHeightInCell(px, pz, x, z)) {
      const fill = c.fills.find((f) => y > plane(f.level - 1) && y <= plane(f.level));
      if (fill) return fill.material;
    }
    return y > world.groundHeight(px, pz) && world.resourceAt(x, z)?.kind === 'stone'
      ? 'stone'
      : 'soil';
  }
  return {
    world,
    revision: world.revision,
    capAt,
    heightInCell,
    retainedHeightInCell,
    range,
    resourceAt,
    exposedResourceAt,
    materialAt,
    extensions,
    changedCells: state.terrain6.cells.map(({ x, z }) => ({ x, z })),
    checkpointAt: original,
    editAt(x: number, z: number) {
      const c = original(x, z);
      return c
        ? {
            x,
            z,
            cut: c.cutLevel === null ? Infinity : plane(c.cutLevel),
            level: c.level,
            fills: c.fills,
          }
        : null;
    },
  };
}
export function v6ExposedResource(state: GameState, x: number, z: number): NaturalResource | null {
  return getV6EditSurface(state).exposedResourceAt(x, z);
}
/** Full-cell extrema are shared by every new/moved/rotated/merged footprint and save import. */
export function v6FoundationHeight(
  state: GameState,
  cells: readonly LandCell[],
  allowReservedDock = false,
): number {
  const surface = getV6EditSurface(state);
  requireRule(cells.length > 0, '建筑缺少占地');
  let height: number | undefined;
  for (const p of cells) {
    const c = surface.world.at(p.x, p.z);
    const extension = state.landExtensions.some((q) => q.x === p.x && q.z === p.z);
    requireRule(extension || (c && (!c.reserved || allowReservedDock)), '水域或保留地不能建造');
    requireRule(!surface.exposedResourceAt(p.x, p.z), '请先采集表面天然资源');
    const [lo, hi] = surface.range(p.x, p.z);
    requireRule(lo === hi && (height === undefined || height === lo), '请先将完整占地修为同一平面');
    height = lo;
  }
  return height!;
}
export function resourceAfterV6Cut(
  world: ReturnType<typeof getV6World>,
  cell: V6CellCheckpoint,
): NaturalResource | null {
  const r = world.resourceAt(cell.x, cell.z);
  if (!r || cell.initialResourceAmount === 0) return null;
  const levels = world.occupiedLevels(cell.x, cell.z).slice(0, cell.initialResourceAmount);
  const amount =
    cell.cutLevel === null ? levels.length : levels.filter((v) => v <= cell.cutLevel!).length;
  return amount ? { ...r, amount } : null;
}
