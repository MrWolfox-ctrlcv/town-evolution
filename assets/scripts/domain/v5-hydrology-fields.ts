import {
  v5Capsule,
  v5Ellipse,
  v5HydrologyHash,
  v5RiverIndex,
  v5RiverPath,
  v5SmoothMax,
} from './v5-hydrology-shapes';
import type { V5Point } from './v5-hydrology-shapes';
export type V5WaterKind = 'ocean' | 'bay' | 'lake' | 'river' | null;
export interface V5WaterFields {
  readonly dry: number;
  readonly mainland: number;
  readonly bay: number;
  readonly lake: number;
  readonly river: number;
  readonly freshwater: number;
  readonly ocean: number;
  readonly waterKind: V5WaterKind;
}
export function v5HydrologyMetadata(seed: number) {
  const shiftX = (v5HydrologyHash(seed, 2, 7) - 0.5) * 6;
  const shiftZ = (v5HydrologyHash(seed, 7, 2) - 0.5) * 6;
  const lake = Object.freeze([119 + shiftX, 126 + shiftZ, 14.5, 10.5] as const);
  const river: readonly V5Point[] = Object.freeze(
    [
      [lake[0] + 8, lake[1] + 3],
      [141, 139 + shiftZ],
      [146, 151],
      [165, 157],
      [177, 173],
      [192, 183],
    ].map((p) => Object.freeze(p as [number, number])),
  );
  return Object.freeze({
    shiftX,
    shiftZ,
    lake,
    river,
    riverWidth: 5.8,
    bays: Object.freeze(
      [
        [184, 88, 27, 18],
        [76, 183, 21, 24],
      ].map((p) => Object.freeze(p as [number, number, number, number])),
    ),
    summits: Object.freeze(
      [
        [66, 62, 28],
        [82, 72, 36],
        [99, 82, 42],
        [115, 91, 34],
        [134, 94, 26],
      ].map((p) => Object.freeze(p as [number, number, number])),
    ),
    hills: Object.freeze(
      [
        [42, 60, 10, 12, 7],
        [54, 113, 13, 10, 9],
        [91, 148, 15, 11, 8],
        [148, 54, 11, 12, 8],
      ].map((p) => Object.freeze(p as [number, number, number, number, number])),
    ),
    forests: Object.freeze(
      [
        [45, 86, 15, 20],
        [58, 145, 20, 14],
        [151, 120, 17, 21],
        [114, 39, 19, 13],
      ].map((p) => Object.freeze(p as [number, number, number, number])),
    ),
  });
}
export function createV5WaterFields(seed: number) {
  const metadata = v5HydrologyMetadata(seed),
    riverPath = v5RiverPath(metadata.river);
  const riverAt = v5RiverIndex(riverPath);
  function fields(x: number, z: number): V5WaterFields {
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1e6 || Math.abs(z) > 1e6)
      throw new Error('Invalid V5 hydrology sample');
    const mainland = Math.max(
      v5Ellipse(x, z, 94, 94, 116, 77, Math.PI / 4),
      v5Ellipse(x, z, 20, 19, 16, 16),
      v5Ellipse(x, z, 6, 5.5, 5.4, 5),
      v5Capsule(x, z, [20, 19], [43, 42], 11),
      v5Capsule(x, z, [7, 7], [20, 19], 4),
    );
    const bay = Math.max(
      ...metadata.bays.map(([cx, cz, rx, rz]) => v5Ellipse(x, z, cx, cz, rx, rz)),
    );
    const [lx, lz, rx, rz] = metadata.lake;
    const lake = v5SmoothMax(
      v5SmoothMax(
        v5Ellipse(x, z, lx, lz, rx, rz),
        v5Ellipse(x, z, lx - 7, lz + 3, 11, 8.5, -0.25),
        1.5,
      ),
      v5Ellipse(x, z, lx + 4, lz - 3, 10, 9, 0.3),
      1.5,
    );
    const river = riverAt(x, z),
      ocean = Math.max(-mainland, bay);
    const freshwater = v5SmoothMax(lake, river, 4),
      dry = -v5SmoothMax(ocean, freshwater, 4);
    const waterKind =
      dry >= 0
        ? null
        : freshwater >= ocean
          ? lake >= river
            ? 'lake'
            : 'river'
          : bay >= -mainland
            ? 'bay'
            : 'ocean';
    return { dry, mainland, bay, lake, river, freshwater, ocean, waterKind };
  }
  return { metadata, riverPath, fields };
}
