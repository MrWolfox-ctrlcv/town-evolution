import { getV7World } from './v7-world';
import { V7_FIELD_EPSILON } from './v7-contracts';
import { requireRule } from './guards';
interface Cell {
  x: number;
  z: number;
}
const key = (x: number, z: number) => `${x},${z}`;
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
/** Conservative whole-cell sea topology. Fresh water never grants a marine route. */
class MarineTopology {
  private readonly min = -16;
  private readonly width: number;
  private readonly sea: Uint8Array;
  private readonly baseline: ReturnType<MarineTopology['navigation']>[];
  private readonly validated = new Map<string, true>();
  readonly field;
  constructor(seed: number) {
    this.field = getV7World(seed).hydrology;
    this.width = this.field.size + 32;
    this.sea = new Uint8Array(this.width ** 2);
    for (let z = this.min; z < this.field.size + 16; z++)
      for (let x = this.min; x < this.field.size + 16; x++)
        this.sea[this.index(x, z)] = Number(
          this.field.classifyCell(x, z).seaDockWater && !this.field.boundaryCell(x, z),
        );
    this.baseline = [this.navigation([], 1), this.navigation([], 2)];
  }
  private index(x: number, z: number): number {
    return (z - this.min) * this.width + x - this.min;
  }
  private navigation(cells: readonly Cell[], footprint: number) {
    const width = this.width,
      limit = width - footprint;
    const blocked = new Uint8Array(this.sea.length);
    for (const p of cells) blocked[this.index(p.x, p.z)] = 1;
    const valid = new Uint8Array(this.sea.length),
      reachable = new Uint8Array(this.sea.length);
    const queue: number[] = [];
    for (let z = 0; z <= limit; z++)
      for (let x = 0; x <= limit; x++) {
        const i = z * width + x;
        let fits = true;
        for (let dz = 0; dz < footprint; dz++)
          for (let dx = 0; dx < footprint; dx++) {
            const n = i + dz * width + dx;
            if (!this.sea[n] || blocked[n]) fits = false;
          }
        if (!fits) continue;
        valid[i] = 1;
        if (x === 0 || z === 0 || x === limit || z === limit) {
          reachable[i] = 1;
          queue.push(i);
        }
      }
    for (let j = 0; j < queue.length; j++) {
      const i = queue[j]!,
        x = i % width,
        z = Math.floor(i / width);
      for (const [dx, dz] of directions) {
        const a = x + dx,
          b = z + dz;
        if (a < 0 || b < 0 || a > limit || b > limit) continue;
        const n = b * width + a;
        if (valid[n] && !reachable[n]) {
          reachable[n] = 1;
          queue.push(n);
        }
      }
    }
    return { valid, reachable };
  }
  checkCell(p: Cell): void {
    requireRule(
      Number.isInteger(p.x) &&
        Number.isInteger(p.z) &&
        p.x >= 1 &&
        p.z >= 1 &&
        p.x < this.field.size - 1 &&
        p.z < this.field.size - 1,
      '扩地位置超出地图',
    );
    requireRule(this.field.at(p.x, p.z)?.state !== 'dryBuildable', '扩地记录重叠');
    const f = this.field.fields(p.x + 0.5, p.z + 0.5);
    requireRule(f.freshwater + Math.SQRT1_2 <= -4 - V7_FIELD_EPSILON, '请保留湖泊、河流和河口');
    requireRule(this.field.isMarineOriginCell(p.x, p.z), '只能沿海扩地');
  }
  validate(cells: readonly Cell[]): void {
    const signature = cells.map((p) => key(p.x, p.z)).join(';');
    if (this.validated.has(signature)) return;
    const filled = new Set<string>();
    for (const p of cells) {
      this.checkCell(p);
      const k = key(p.x, p.z);
      requireRule(!filled.has(k), '扩地记录重叠');
      filled.add(k);
    }
    const seen = new Set<string>(),
      queue: Cell[] = [];
    for (const p of cells)
      if (
        directions.some(([dx, dz]) => this.field.at(p.x + dx, p.z + dz)?.state === 'dryBuildable')
      ) {
        seen.add(key(p.x, p.z));
        queue.push(p);
      }
    for (let j = 0; j < queue.length; j++)
      for (const [dx, dz] of directions) {
        const p = queue[j]!,
          x = p.x + dx,
          z = p.z + dz,
          k = key(x, z);
        if (filled.has(k) && !seen.has(k)) {
          seen.add(k);
          queue.push({ x, z });
        }
      }
    requireRule(seen.size === filled.size, '扩地必须与小岛相连');
    for (const footprint of [1, 2]) {
      const before = this.baseline[footprint - 1]!,
        after = this.navigation(cells, footprint);
      for (let i = 0; i < after.valid.length; i++)
        requireRule(
          !before.reachable[i] || !after.valid[i] || !!after.reachable[i],
          '请保留与外海相通的水域和航路',
        );
    }
    if (this.validated.size >= 8) this.validated.delete(this.validated.keys().next().value!);
    this.validated.set(signature, true);
  }
  seaExit(
    x: number,
    z: number,
    extensions: readonly Cell[],
    obstacles: readonly Cell[] = [],
  ): boolean {
    this.validate(extensions);
    return !!this.navigation([...extensions, ...obstacles], 2).reachable[this.index(x, z)];
  }
}
const contexts = new WeakMap<ReturnType<typeof getV7World>, MarineTopology>();
function context(seed: number): MarineTopology {
  const world = getV7World(seed);
  let value = contexts.get(world);
  if (!value) {
    value = new MarineTopology(seed);
    contexts.set(world, value);
  }
  return value;
}
/** Save import and live reclamation share exactly the same topology checks. */
export function validateV7Extensions(seed: number, cells: readonly Cell[]): void {
  if (!cells.length) return;
  context(seed).validate(cells);
}
export function isV7MarineCell(
  seed: number,
  x: number,
  z: number,
  extensions: readonly Cell[],
): boolean {
  return (
    getV7World(seed).hydrology.at(x, z)?.seaDockWater === true &&
    !extensions.some((p) => p.x === x && p.z === z)
  );
}
/** Existing dock recipe only: no prebuilt harbor, excavation, new price, or implicit building. */
export function isV7DockShore(
  seed: number,
  b: Cell & { rotation: number },
  extensions: readonly Cell[],
): boolean {
  if (!Number.isInteger(b.rotation) || b.rotation < 0 || b.rotation > 3) return false;
  const field = getV7World(seed).hydrology,
    filled = new Set(extensions.map((p) => key(p.x, p.z)));
  for (let dz = 0; dz < 2; dz++)
    for (let dx = 0; dx < 2; dx++)
      if (
        field.at(b.x + dx, b.z + dz)?.state !== 'dryBuildable' &&
        !filled.has(key(b.x + dx, b.z + dz))
      )
        return false;
  const pier: Cell[] = [];
  for (let offset = 0; offset < 2; offset++)
    for (let distance = 0; distance < 2; distance++) {
      const x =
        b.rotation % 2 === 0
          ? b.x + offset
          : b.rotation === 1
            ? b.x + 2 + distance
            : b.x - 1 - distance;
      const z =
        b.rotation % 2 === 1
          ? b.z + offset
          : b.rotation === 0
            ? b.z + 2 + distance
            : b.z - 1 - distance;
      if (!isV7MarineCell(seed, x, z, extensions)) return false;
      pier.push({ x, z });
    }
  // Keep a real side berth/turning box clear. The pier and its posts are not a boat route.
  const side = v7DockNavigationBox(b);
  if (!v7DockBerthCells(b).every((p) => isV7MarineCell(seed, p.x, p.z, extensions))) return false;
  return context(seed).seaExit(
    Math.min(...side.map((p) => p.x)),
    Math.min(...side.map((p) => p.z)),
    extensions,
    pier,
  );
}

/** Conservative clearance beside the existing pier. It creates no boat or dock. */
function sideBox(b: Cell & { rotation: number }, start: number): Cell[] {
  const angle = (b.rotation * Math.PI) / 2,
    u = [Math.round(Math.cos(angle)), -Math.round(Math.sin(angle))],
    v = [Math.round(Math.sin(angle)), Math.round(Math.cos(angle))],
    corners = [
      [1, start],
      [3, start],
      [1, 4],
      [3, 4],
    ].map(([a, c]) => ({
      x: b.x + 1 + u[0]! * a! + v[0]! * c!,
      z: b.z + 1 + u[1]! * a! + v[1]! * c!,
    })),
    result: Cell[] = [];
  for (let z = Math.min(...corners.map((p) => p.z)); z < Math.max(...corners.map((p) => p.z)); z++)
    for (
      let x = Math.min(...corners.map((p) => p.x));
      x < Math.max(...corners.map((p) => p.x));
      x++
    )
      result.push({ x, z });
  return result;
}
export function v7DockNavigationBox(b: Cell & { rotation: number }): Cell[] {
  return sideBox(b, 2);
}
export function v7DockBerthCells(b: Cell & { rotation: number }): Cell[] {
  return sideBox(b, 1);
}
