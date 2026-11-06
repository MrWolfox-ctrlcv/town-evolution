import type { MeshData } from './AssetTypes';
import { emptyNaturalMesh } from './NaturalMesh';
import { coastVertex } from './CoastMesh';
import { coastNormals } from './CoastalBeach';
import { perlin, smooth01 } from './ContinuousNoise';
import type { CoastPoint } from './CoastProtection';

export interface CoastalWaterData extends MeshData {
  shoreDistances?: readonly number[];
  heightOffsets?: readonly number[];
  shoreBreaks?: readonly number[];
}
function segmentDistance(x: number, z: number, a: CoastPoint, b: CoastPoint): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length)) : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
/** Nearby segments only: enlarged worlds must not scan the entire coast per vertex. */
function coastDistance(
  outlines: readonly (readonly CoastPoint[])[],
): (x: number, z: number) => number {
  const buckets = new Map<string, Array<readonly [CoastPoint, CoastPoint]>>();
  for (const loop of outlines)
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!,
        b = loop[(i + 1) % loop.length]!;
      for (
        let x = Math.floor((Math.min(a[0], b[0]) - 9) / 8);
        x <= Math.floor((Math.max(a[0], b[0]) + 9) / 8);
        x++
      )
        for (
          let z = Math.floor((Math.min(a[1], b[1]) - 9) / 8);
          z <= Math.floor((Math.max(a[1], b[1]) + 9) / 8);
          z++
        ) {
          const key = `${x},${z}`,
            bucket = buckets.get(key) ?? [];
          bucket.push([a, b]);
          buckets.set(key, bucket);
        }
    }
  return (x, z) => {
    let distance = 9;
    for (const [a, b] of buckets.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? [])
      distance = Math.min(distance, segmentDistance(x, z, a, b));
    return distance;
  };
}
/** Coherent world-space wave phases; time is presentation-only, never saved. */
export function coastalWaveHeight(x: number, z: number, seed: number, time = 0): number {
  return (
    -0.62 +
    0.014 * Math.sin(x * 0.22 + z * 0.12 + time * 0.65 + seed * 0.01) +
    0.008 * Math.sin(x * -0.1 + z * 0.27 - time * 0.43)
  );
}
/** Broken, softly moving wave crests, not a solid white outline around the island. */
export function coastalFoamStrength(distance: number, breakup: number, time = 0): number {
  if (distance < 0 || distance > 2.3) return 0;
  const crest = 0.42 + 0.24 * Math.sin(time * 0.8 + breakup * 2.1),
    second = 1.35 + 0.28 * Math.sin(time * 0.8 + breakup * 2.1 - 1.9),
    firstBand = Math.max(0, 1 - Math.abs(distance - crest) / 0.27),
    secondBand = Math.max(0, 1 - Math.abs(distance - second) / 0.36);
  return Math.min(0.64, (firstBand * firstBand + secondBand * secondBand * 0.4) * breakup);
}
export function buildCoastalWater(
  size: number,
  seed: number,
  outlines: readonly (readonly CoastPoint[])[],
  time = 0,
): CoastalWaterData {
  const mesh = emptyNaturalMesh(),
    shoreDistances: number[] = [],
    heightOffsets: number[] = [],
    shoreBreaks: number[] = [],
    steps = Math.min(128, Math.max(12, Math.ceil(size * 2))),
    min = -size,
    max = size * 2,
    step = (max - min) / steps,
    distanceAt = coastDistance(outlines);
  const vertex = (x: number, z: number, shore = -1, offset = 0) => {
    const deep = smooth01(distanceAt(x, z) / 9),
      color = [
        0.34 * (1 - deep) + 0.15 * deep,
        0.75 * (1 - deep) + 0.43 * deep,
        0.73 * (1 - deep) + 0.58 * deep,
      ],
      breakup = Math.max(0, Math.min(1, 0.6 + perlin(x * 0.27, z * 0.27, seed + 113))),
      dx =
        0.014 * 0.22 * Math.cos(x * 0.22 + z * 0.12 + time * 0.65 + seed * 0.01) +
        0.008 * -0.1 * Math.cos(x * -0.1 + z * 0.27 - time * 0.43),
      dz =
        0.014 * 0.12 * Math.cos(x * 0.22 + z * 0.12 + time * 0.65 + seed * 0.01) +
        0.008 * 0.27 * Math.cos(x * -0.1 + z * 0.27 - time * 0.43),
      length = Math.hypot(dx, 1, dz);
    shoreDistances.push(shore);
    heightOffsets.push(offset);
    shoreBreaks.push(breakup);
    return coastVertex(
      mesh,
      x,
      coastalWaveHeight(x, z, seed, time) + offset,
      z,
      -dx / length,
      1 / length,
      -dz / length,
      color,
    );
  };
  for (let ix = 0; ix <= steps; ix++)
    for (let iz = 0; iz <= steps; iz++) vertex(min + ix * step, min + iz * step);
  for (let x = 0; x < steps; x++)
    for (let z = 0; z < steps; z++) {
      const a = x * (steps + 1) + z,
        b = a + 1,
        c = a + steps + 2,
        d = a + steps + 1;
      mesh.indices.push(a, b, c, a, c, d);
    }
  // Fine strips keep the wet sand and wave crests visible even when the ocean
  // grid is coarse. Every index remains Uint16-safe, including many lake holes.
  const distances = [0, 0.15, 0.3, 0.5, 0.75, 1.05, 1.4, 2, 3, 4.5, 6],
    sourcePoints = outlines.reduce((n, loop) => n + loop.length, 0),
    pointBudget = Math.floor((65535 - mesh.positions.length / 3) / distances.length),
    stride = Math.max(1, Math.ceil(sourcePoints / Math.max(1, pointBudget - outlines.length * 2)));
  for (const outline of outlines) {
    if (outline.length < 3) continue;
    const loop = outline.filter((_, i) => i % stride === 0);
    if (loop.length < 3 || mesh.positions.length / 3 + loop.length * distances.length > 65535)
      continue;
    const normals = coastNormals(loop),
      rows = distances.map((distance) =>
        loop.map((p, i) =>
          vertex(
            p[0] + normals[i]![0] * distance,
            p[1] + normals[i]![1] * distance,
            distance,
            0.006,
          ),
        ),
      );
    for (let row = 0; row < rows.length - 1; row++)
      for (let i = 0; i < loop.length; i++) {
        const next = (i + 1) % loop.length,
          a = rows[row]![i]!,
          b = rows[row]![next]!,
          c = rows[row + 1]![next]!,
          d = rows[row + 1]![i]!;
        mesh.indices.push(a, d, c, a, c, b);
      }
  }
  return { ...mesh, shoreDistances, heightOffsets, shoreBreaks };
}
