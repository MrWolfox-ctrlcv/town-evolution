import { V6FifoCache } from './v6-fifo-cache';
import { v6SlabVolume } from './v6-volume-integral';
import { V6_MATERIAL_QUANTA as Q } from './v6-edit-types';
import type { V6MaterialWorld, V6CellCheckpoint } from './v6-edit-types';
export const v6EditPlane = (level: number): number => Math.fround(0.015 + level);
export const V6_EDIT_MAX_LEVEL = 64;
interface Point {
  x: number;
  z: number;
  y: number;
}
function clippedIntegral(triangle: readonly Point[], plane: number): number {
  const polygon: Point[] = [];
  for (let i = 0; i < triangle.length; i++) {
    const a = triangle[i]!,
      b = triangle[(i + 1) % triangle.length]!;
    const insideA = a.y > plane,
      insideB = b.y > plane;
    if (insideA) polygon.push(a);
    if (insideA !== insideB) {
      const t = (plane - a.y) / (b.y - a.y);
      polygon.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z), y: plane });
    }
  }
  let volume = 0;
  for (let i = 1; i + 1 < polygon.length; i++) {
    const a = polygon[0]!,
      b = polygon[i]!,
      c = polygon[i + 1]!;
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    volume += (area * (a.y - plane + (b.y - plane) + (c.y - plane))) / 3;
  }
  return volume;
}
function layerIntegral(tri: readonly Point[], lower: number, upper: number): number {
  return clippedIntegral(tri, lower) - clippedIntegral(tri, upper);
}
export function initialResourceCap(
  world: V6MaterialWorld,
  x: number,
  z: number,
  amount: number,
): number {
  const original = world.resourceAt(x, z);
  if (!original || !amount) return -Infinity;
  if (!Number.isInteger(amount) || amount < 0 || amount > original.amount)
    throw Error('天然资源初值无效');
  return amount === original.amount
    ? Infinity
    : v6EditPlane(world.occupiedLevels(x, z)[amount - 1]!);
}
/** A fixed original layer has one shared Q-quanta budget, split between real soil and stone.
 * Positive slivers retain at least one quantum. Neither material can independently claim Q.
 * Clipping integrates the actual 32 piecewise-linear triangles, not just corner averages.
 */
const volumeCache = new WeakMap<
  V6MaterialWorld,
  V6FifoCache<string, Map<number, Readonly<{ soil: number; stone: number }>>>
>();
export function naturalLayerQuanta(
  world: V6MaterialWorld,
  cell: Pick<V6CellCheckpoint, 'x' | 'z' | 'initialResourceAmount'>,
  level: number,
): Readonly<{ soil: number; stone: number }> {
  let cells = volumeCache.get(world);
  if (!cells) {
    cells = new V6FifoCache(512);
    volumeCache.set(world, cells);
  }
  const key = `${cell.x},${cell.z},${cell.initialResourceAmount}`;
  let layers = cells.get(key);
  if (!layers) {
    layers = new Map();
    cells.set(key, layers);
  }
  let value = layers.get(level);
  if (!value) {
    value = Object.freeze(computeNaturalLayerQuanta(world, cell, level));
    layers.set(level, value);
  }
  return value;
}
function computeNaturalLayerQuanta(
  world: V6MaterialWorld,
  cell: Pick<V6CellCheckpoint, 'x' | 'z' | 'initialResourceAmount'>,
  level: number,
): { soil: number; stone: number } {
  const lower = v6EditPlane(level - 1),
    upper = v6EditPlane(level),
    height = upper - lower;
  const cap = initialResourceCap(world, cell.x, cell.z, cell.initialResourceAmount);
  const deposit = world.resourceAt(cell.x, cell.z);
  let base = 0,
    extra = 0;
  let full = true;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const sample = (dx: number, dz: number) => {
        const v = world.vertex(cell.x * 4 + i + dx, cell.z * 4 + j + dz);
        const top = Math.fround(v.ground + Math.max(v.stone, v.soil));
        if (Math.max(v.ground, Math.min(top, cap)) < upper) full = false;
        return { x: (i + dx) / 4, z: (j + dz) / 4, ground: v.ground, top };
      };
      const a = sample(0, 0),
        b = sample(0, 1),
        c = sample(1, 1),
        d = sample(1, 0);
      for (const tri of [
        [a, b, c],
        [a, c, d],
      ]) {
        const ground = layerIntegral(
          tri.map((p) => ({ ...p, y: p.ground })),
          lower,
          upper,
        );
        base += ground;
        if (cap >= upper && deposit) extra += v6SlabVolume(tri, lower, upper);
      }
    }
  const soil = Math.max(0, base + (deposit?.kind === 'soil' ? extra : 0));
  const stone = Math.max(0, deposit?.kind === 'stone' ? extra : 0);
  const total = Math.min(height, soil + stone);
  if (total <= 0) return { soil: 0, stone: 0 };
  const mixed = soil > 0 && stone > 0;
  const count = Math.max(
    mixed ? 2 : 1,
    Math.min(full ? Q : Q - 1, Math.round((total / height) * Q)),
  );
  const sq = mixed
    ? Math.max(1, Math.min(count - 1, Math.round((soil / total) * count)))
    : stone > soil
      ? 0
      : count;
  return { soil: sq, stone: count - sq };
}
export function retainedLayerQuanta(
  world: V6MaterialWorld,
  cell: V6CellCheckpoint,
  level: number,
): { soil: number; stone: number } {
  return cell.cutLevel !== null && level > cell.cutLevel
    ? { soil: 0, stone: 0 }
    : naturalLayerQuanta(world, cell, level);
}
export function fillLayerQuanta(
  world: V6MaterialWorld,
  cell: V6CellCheckpoint,
  level: number,
): number {
  const q = retainedLayerQuanta(world, cell, level);
  return Q - q.soil - q.stone;
}
