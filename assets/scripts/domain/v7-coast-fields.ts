import { createCoastPolygon } from './v7-polygon-field';
import { perlin } from './v5-noise';
import { v5HydrologyMetadata } from './v5-hydrology-fields';
import type { V5WaterFields } from './v5-hydrology-fields';
import {
  v5Capsule,
  v5Ellipse,
  v5HydrologyHash,
  v5RiverIndex,
  v5RiverPath,
  v5SmoothMax,
} from './v5-hydrology-shapes';
import { V7_COAST_NOISE } from './v7-contracts';

/** Positive land M; positive water B/L/R/O/F. All final fields are 1-Lipschitz. */
export function createV7WaterFields(seed: number) {
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 1_000_000_000)
    throw Error('Invalid v7 seed');
  const metadata = Object.freeze({
    ...v5HydrologyMetadata(seed),
    bays: Object.freeze(
      [
        [172, 94, 24, 18],
        [83, 173, 21, 23],
      ].map((p) => Object.freeze(p as [number, number, number, number])),
    ),
    bayOutlets: Object.freeze([
      [[172, 94], [203, 94], 9],
      [[83, 173], [83, 203], 9],
    ] as const),
    riverOutlet: Object.freeze([[177, 173], [203, 191], 2.9] as const),
  });
  const outer = createCoastPolygon(seed + 4781, 96, 96, 86, 81, Math.PI / 4, 22, 96);
  const east = createCoastPolygon(seed + 7919, 172, 94, 24, 18, 0, 12, 48);
  const south = createCoastPolygon(seed + 9973, 83, 173, 21, 23, 0.2, 12, 48);
  const riverPath = v5RiverPath(metadata.river);
  const riverAt = v5RiverIndex(riverPath);
  const phases = [101, 211, 307].map(
    (salt) =>
      [v5HydrologyHash(seed, salt, 17) * 256, v5HydrologyHash(seed, 31, salt) * 256] as const,
  );
  const noise = (x: number, z: number, index: number, bay: boolean): number => {
    const profile = bay ? V7_COAST_NOISE.bay : V7_COAST_NOISE.mainland;
    const phase = phases[index]!;
    return profile.amplitudes.reduce(
      (sum, amplitude, i) =>
        sum +
        (amplitude *
          perlin(
            x / profile.wavelengths[i]! + phase[0],
            z / profile.wavelengths[i]! + phase[1],
            seed + 1009 + index * 2017 + i * 4093,
          )) /
          Math.SQRT2,
      0,
    );
  };
  function fields(x: number, z: number): V5WaterFields {
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1e6 || Math.abs(z) > 1e6)
      throw Error('Invalid v7 field coordinate');
    const macro =
      (outer.insideDistance(x, z) + noise(x, z, 0, false)) / V7_COAST_NOISE.mainland.scale;
    const starter = Math.max(
      Math.min(x - 2.25, 10 - x, z - 2.25, 8 - z),
      v5Ellipse(x, z, 20, 19, 16, 16),
      v5Capsule(x, z, [20, 19], [43, 42], 11),
      v5Capsule(x, z, [7, 7], [20, 19], 4),
    );
    const mainland = Math.max(macro, starter);
    const eastBay = (east.insideDistance(x, z) + noise(x, z, 1, true)) / V7_COAST_NOISE.bay.scale;
    const southBay = (south.insideDistance(x, z) + noise(x, z, 2, true)) / V7_COAST_NOISE.bay.scale;
    const bay = Math.max(
      eastBay,
      southBay,
      v5Capsule(x, z, [172, 94], [203, 94], 9),
      v5Capsule(x, z, [83, 173], [83, 203], 9),
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
    const river = Math.max(riverAt(x, z), v5Capsule(x, z, [177, 173], [203, 191], 2.9));
    const ocean = Math.max(-mainland, bay);
    const freshwater = v5SmoothMax(lake, river, 4);
    const dry = -v5SmoothMax(ocean, freshwater, 4);
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
  const b = outer.bounds;
  const boundaryDistance = Math.min(b[0], b[1], 192 - b[2], 192 - b[3]);
  const coastBoundaryUpper = Math.max(
    -2.25,
    (-boundaryDistance +
      V7_COAST_NOISE.mainland.amplitudes[0] +
      V7_COAST_NOISE.mainland.amplitudes[1]) /
      V7_COAST_NOISE.mainland.scale,
  );
  return {
    metadata,
    riverPath,
    fields,
    coastBoundaryUpper,
    coastPolygons: Object.freeze({ outer, east, south }),
  };
}
