import type { MeshData } from './AssetTypes';
import { v6OwnsSurfaceCell } from './V6SurfaceContracts';
import type { V6SurfaceWorld } from './V6SurfaceContracts';
import { buildCoastalWater } from './CoastalWater';
import type { CoastalWaterData } from './CoastalWater';
import { v5MeshWriter, v5SurfaceSampler } from './V5CoastMesh';
import type { V5SurfaceVertex } from './V5CoastMesh';
import { appendV5FillWalls, appendV5FillTile, v5FillKey, v5FillTop } from './V6CoastFill';
import type { V5FillCell } from './V6CoastFill';
import { v5CliffTileBuilder } from './V6CoastCliff';
export const V5_COAST_CHUNK_SIZE = 16;
const KEYS: readonly string[] = Object.freeze(
  Array.from({ length: 196 }, (_, i) => `${(i % 14) - 1},${Math.floor(i / 14) - 1}`),
);
export function listV5CoastChunks(): readonly string[] {
  return KEYS;
}
export function v5CoastChunkBounds(key: string): readonly [number, number, number, number] {
  if (!KEYS.includes(key)) throw new Error('Invalid V5 coast chunk');
  const [x, z] = key.split(',').map(Number) as [number, number];
  return [x * 16, z * 16, (x + 1) * 16, (z + 1) * 16];
}
export interface V5CoastJob {
  advance(maxBlocks: number): boolean;
  result(): MeshData;
}
export interface V5CoastSource {
  readonly keys: readonly string[];
  readonly water: CoastalWaterData;
  build(key: string, visualOnly?: boolean): MeshData;
  begin(key: string, visualOnly?: boolean): V5CoastJob;
}
/** Validation once per source. No dense whole-world terrain intermediate or stored meshes. */
export function createV6CoastSource(
  world: V6SurfaceWorld,
  extensions: readonly V5FillCell[] = [],
  reusedWater?: CoastalWaterData,
): V5CoastSource {
  const seed = world.seed;
  const field = world.hydrology;
  const fills = extensions.map((p) => ({ x: p.x, z: p.z }));
  const filled = new Set(fills.map((p) => v5FillKey(p.x, p.z)));
  const water = reusedWater ?? buildCoastalWater(field.size, seed, []);
  // A single non-overlapping ocean/lake/river surface. Land/fill tops occlude it physically.
  if (!reusedWater)
    for (let i = 0; i < water.positions.length / 3; i++) {
      const x = water.positions[i * 3]!,
        z = water.positions[i * 3 + 2]!;
      const sample = field.naturalCoast.sample(x, z, 'water');
      const baseT = Math.max(0, Math.min(1, -sample.dry / 9));
      const bedT = Math.max(0, Math.min(1, (-0.62 - sample.height) / 0.6));
      const t = baseT * (1 - sample.influence) + bedT * sample.influence;
      const d = t * t * (3 - 2 * t);
      water.colors[i * 4] = 0.34 * (1 - d) + 0.15 * d;
      water.colors[i * 4 + 1] = 0.75 * (1 - d) + 0.43 * d;
      water.colors[i * 4 + 2] = 0.73 * (1 - d) + 0.58 * d;
    }
  function begin(key: string, visualOnly = false): V5CoastJob {
    const [x0, z0, x1, z1] = v5CoastChunkBounds(key);
    const writer = v5MeshWriter(),
      sample = v5SurfaceSampler(field);
    const cliff = v5CliffTileBuilder(field, filled),
      bounds = field.featureBounds;
    const local = fills.filter((p) => p.x >= x0 && p.x < x1 && p.z >= z0 && p.z < z1);
    const pending: Array<readonly [number, number, number]> = [[x0, z0, 64]];
    let wallIndex = 0,
      output: MeshData | undefined;
    function block(x: number, z: number, n: number): void {
      const width = n / 4,
        cx = x + width / 2,
        cz = z + width / 2;
      let ownedAny = false,
        ownedAll = true;
      for (let zz = Math.floor(z); zz < Math.ceil(z + width); zz++)
        for (let xx = Math.floor(x); xx < Math.ceil(x + width); xx++) {
          const owned = v6OwnsSurfaceCell(world, xx, zz);
          ownedAny ||= owned;
          ownedAll &&= owned;
        }
      if (ownedAll) return;
      if (ownedAny && n > 1) {
        const half = n / 2,
          w = width / 2;
        pending.push([x + w, z + w, half], [x, z + w, half], [x + w, z, half], [x, z, half]);
        return;
      }
      let any = false,
        all = true;
      for (let iz = Math.floor(z); iz < Math.ceil(z + width); iz++)
        for (let ix = Math.floor(x); ix < Math.ceil(x + width); ix++) {
          const hit = filled.has(v5FillKey(ix, iz));
          any ||= hit;
          all &&= hit;
        }
      const d = field.fields(cx, cz).dry,
        r = (width * Math.SQRT2) / 2 + 0.25 * Math.SQRT2;
      const cliffOverlap =
        x < bounds.x1 && x + width > bounds.x0 && z < bounds.z1 && z + width > bounds.z0;
      // Far display only: the complete block is below the opaque water's global
      // minimum -0.642. PROFILE depth >= .74 at dry <= -2.35; bankScale <= 1,
      // naturalCoast only lowers that bound. Dry-distance is 1-Lipschitz.
      // Preserve every shore, original owner, reclaimed fill and cliff block.
      if (visualOnly && !ownedAny && !any && !cliffOverlap && d + r <= -2.35) return;
      const flat =
        all && !cliffOverlap
          ? 1
          : cliffOverlap
            ? 0
            : !any && d - r >= 0
              ? 1
              : !any && d + r <= -3.3
                ? -1
                : 0;
      const vertex = (xx: number, zz: number): V5SurfaceVertex =>
        all
          ? v5FillTop(xx, zz)
          : flat
            ? {
                position: [xx, flat > 0 ? 0.015 : 0.015 - 1.1, zz],
                normal: [0, 1, 0],
                color: flat > 0 ? [0.53, 0.68, 0.31] : [0.43, 0.58, 0.54],
              }
            : sample(xx, zz);
      if (n === 1 && cliffOverlap && all) {
        appendV5FillTile(writer, field, x, z);
        return;
      }
      if (n === 1 && cliffOverlap && !all) {
        cliff(writer, x, z);
        return;
      }
      if (n === 1) {
        const a = vertex(x, z),
          b = vertex(x, z + width),
          c = vertex(x + width, z + width),
          d = vertex(x + width, z);
        writer.triangle(a, b, c);
        writer.triangle(a, c, d);
        return;
      }
      if (flat) {
        // Every quarter-grid perimeter vertex is retained: no hanging edges at finer neighbors.
        const center = vertex(cx, cz),
          ring: V5SurfaceVertex[] = [];
        for (let i = 0; i < n; i++) ring.push(vertex(x, z + i / 4));
        for (let i = 0; i < n; i++) ring.push(vertex(x + i / 4, z + width));
        for (let i = 0; i < n; i++) ring.push(vertex(x + width, z + width - i / 4));
        for (let i = 0; i < n; i++) ring.push(vertex(x + width - i / 4, z));
        for (let i = 0; i < ring.length; i++)
          writer.triangle(center, ring[i]!, ring[(i + 1) % ring.length]!);
        return;
      }
      const h = n / 2,
        w = width / 2;
      pending.push([x + w, z + w, h], [x, z + w, h], [x + w, z, h], [x, z, h]);
    }
    return {
      advance(maxBlocks: number): boolean {
        if (!Number.isSafeInteger(maxBlocks) || maxBlocks < 1)
          throw new Error('Invalid coast work budget');
        if (output) return true;
        for (let i = 0; i < maxBlocks; i++) {
          const next = pending.pop();
          if (next) block(...next);
          else if (wallIndex < local.length)
            appendV5FillWalls(writer, field, filled, local[wallIndex++]!);
          else {
            output = writer.finish();
            return true;
          }
        }
        return false;
      },
      result(): MeshData {
        if (!output) throw new Error('V5 coast job is not complete');
        return output;
      },
    };
  }
  function build(key: string, visualOnly = false): MeshData {
    const job = begin(key, visualOnly);
    while (!job.advance(1024)) {
      /* Offline synchronous convenience only. */
    }
    return job.result();
  }
  return { keys: KEYS, water, build, begin };
}
