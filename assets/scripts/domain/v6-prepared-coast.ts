import { V5_NATURAL_COAST_REVISION } from './v5-natural-coast-types';
import type {
  NaturalCoastBaseHydrology,
  NaturalCoast,
  NaturalCoastSample,
  NaturalCoastCell,
  CoastSide,
} from './v5-natural-coast-types';
import type { NaturalCoastFeature } from './v5-natural-coast-types';
import {
  coastTransform,
  coastShore,
  coastShoreRange,
  coastSmooth,
  coastCellBounds,
} from './v5-natural-coast-geometry';
export { V5_NATURAL_COAST_REVISION } from './v5-natural-coast-types';
export type {
  NaturalCoastBaseHydrology,
  NaturalCoast,
  NaturalCoastFeature,
  NaturalCoastCell,
  NaturalCoastSample,
  NaturalCoastCertificate,
  CoastSide,
} from './v5-natural-coast-types';
/** Derive only from the immutable base. No caller-supplied geometry or serialized proof is trusted. */
export function derivePreparedCoast(
  base: NaturalCoastBaseHydrology,
  feature: NaturalCoastFeature,
): NaturalCoast {
  const t = coastTransform(feature);
  const shore = (u: number) => coastShore(feature, u);
  const shoreRange = (u0: number, u1: number) => coastShoreRange(feature, u0, u1);
  const weight = (u: number, v: number) =>
    (1 - coastSmooth((Math.abs(u) - 3.25) / 4.75)) * (1 - coastSmooth((v - feature.gateway) / 3));
  const bed = (u: number, v: number) =>
    -1.3 -
    0.13 * (1 + Math.sin(u * 0.91 + v * 0.37 + feature.seed * 0.001)) -
    0.07 * (1 + Math.sin(u * 1.87 - v * 0.63 + feature.seed * 0.003));
  function surfaceLocal(u: number, v: number, w: number): NaturalCoastSample {
    const [x, z] = t.toWorld(u, v),
      b = base.sample(x, z),
      c = shore(u),
      height = b.height + (Math.min(b.height, bed(u, v)) - b.height) * w;
    return {
      ...b,
      x,
      z,
      u,
      v,
      height,
      baseHeight: b.height,
      cliffBoundary: c,
      influence: w,
      geometryWaterKind: height < -0.642 ? 'ocean' : null,
      color: b.color.map((a, i) => a * (1 - w) + [0.38, 0.47, 0.43][i]! * w) as [
        number,
        number,
        number,
      ],
    };
  }
  function sampleLocal(u: number, v: number, side: CoastSide = 'auto'): NaturalCoastSample {
    const c = shore(u),
      waterSide = v > c + 1e-10 || (Math.abs(v - c) <= 1e-10 && side === 'water');
    return surfaceLocal(u, v, waterSide ? weight(u, v) : 0);
  }
  const sampleWaterBedLocal = (u: number, v: number) => surfaceLocal(u, v, weight(u, v));
  const sample = (x: number, z: number, side: CoastSide = 'auto') =>
    sampleLocal(...t.toLocal(x, z), side);
  const cellBounds = (x: number, z: number) => coastCellBounds(t.toLocal, x, z);
  const intersectsFeatureCell = (x: number, z: number) => {
    const b = cellBounds(x, z);
    return b.u0 < 8 && b.u1 > -8 && b.v0 < feature.gateway + 3 && b.v1 > shoreRange(b.u0, b.u1).min;
  };
  const reserveCell = (x: number, z: number) => {
    const b = cellBounds(x, z);
    return b.u0 < 8 && b.u1 > -8 && b.v0 < feature.gateway + 4 && b.v1 > -3;
  };
  const boundaryCell = (x: number, z: number) => {
    const b = cellBounds(x, z);
    if (b.u1 <= -8 || b.u0 >= 8) return false;
    const c = shoreRange(Math.max(-8, b.u0), Math.min(8, b.u1));
    return b.v0 <= c.max + 1e-9 && b.v1 >= c.min - 1e-9;
  };
  function classifyCell(x: number, z: number): NaturalCoastCell {
    const original = base.classifyCell(x, z),
      b = cellBounds(x, z),
      f = base.fields(x + 0.5, z + 0.5),
      s = shoreRange(b.u0, b.u1);
    let result: NaturalCoastCell = {
      ...original,
      certificate: {
        kind: 'base-distance',
        baseCertificate: original.certificate,
      },
    };
    if (intersectsFeatureCell(x, z)) {
      const freshwaterUpper = f.freshwater + Math.SQRT1_2,
        minWeight = weight(Math.max(Math.abs(b.u0), Math.abs(b.u1)), b.v1),
        bedUpper = 0.015 + (-1.3 - 0.015) * minWeight,
        whollySeaward = b.v0 >= s.max - 1e-9,
        geometryClear = whollySeaward && bedUpper <= -1.085 + 1e-9 && freshwaterUpper <= -4,
        deep = original.seaDockWater || geometryClear;
      result = {
        ...original,
        state: deep ? 'clearWater' : 'reservedBank',
        seaDockWater: deep,
        waterKind: deep ? 'ocean' : original.waterKind,
        certificate: {
          kind: 'natural-cliff-prism',
          sourceVersion: V5_NATURAL_COAST_REVISION,
          baseCertificate: original.certificate,
          bedUpperBound: original.seaDockWater ? Math.min(-1.085, bedUpper) : bedUpper,
          requiredBedUpper: -1.085,
          freshwaterUpper,
          wholeCellSeaward: whollySeaward,
          attachmentBoundary: Math.abs(b.v0 - s.max) < 1e-9,
          waterSideClosedCell: true,
        },
      };
    }
    if (
      b.u0 < 8 &&
      b.u1 > -8 &&
      b.v0 < 1 &&
      b.v1 > -3 &&
      original.state === 'dryBuildable' &&
      b.v1 <= s.min + 1e-9
    )
      result = {
        ...original,
        certificate: {
          kind: 'natural-cliff-solid',
          baseCertificate: original.certificate,
          topHeight: 0.015,
          minimumWaterGap: 0.613,
          wholeCellLandward: true,
        },
      };
    return result;
  }
  function isMarineOriginCell(x: number, z: number): boolean {
    // Retain the pre-feature marine-origin rule exactly. The caller still enforces freshwater exclusions.
    const original = base.classifyCell(x, z);
    if (base.fields(x + 0.5, z + 0.5).ocean + Math.SQRT1_2 >= 0) return true;
    if (!intersectsFeatureCell(x, z) || classifyCell(x, z).state === 'dryBuildable') return false;
    const b = cellBounds(x, z),
      a = Math.max(-8, b.u0),
      c = Math.min(8, b.u1);
    // Strictly interior positive-area wet witnesses. Tiny uncertain slivers fail closed.
    // This is an origin/existence test, never a whole-cell clearance certificate.
    for (let i = 0; i < 4; i++) {
      const u = a + ((c - a) * (i + 0.5)) / 4,
        start = Math.max(b.v0, shore(u));
      if (!(start < b.v1 - 1e-8)) continue;
      const v = (start + b.v1) / 2,
        q = sampleLocal(u, v);
      if (q.influence > 1e-8 && q.height < q.baseHeight - 1e-8 && q.height < -0.642 - 1e-8)
        return true;
    }
    return original.seaDockWater;
  }
  const corners = [
    [-10, feature.region.v[0]],
    [10, feature.region.v[0]],
    [-10, feature.region.v[1]],
    [10, feature.region.v[1]],
  ].map(([u, v]) => t.toWorld(u!, v!));
  return Object.freeze({
    feature,
    axes: t.axes,
    toWorld: t.toWorld,
    toLocal: t.toLocal,
    shore,
    shoreRange,
    sampleLocal,
    sampleLocalAtShore: (u: number, side: 'land' | 'water') => sampleLocal(u, shore(u), side),
    sampleWaterBedLocal,
    sample,
    classifyCell,
    cellBounds,
    intersectsFeatureCell,
    reserveCell,
    boundaryCell,
    isMarineOriginCell,
    solid: (x: number, y: number, z: number) => y <= sample(x, z).height,
    waterDepth: (x: number, z: number) => -0.62 - sample(x, z, 'water').height,
    patchBounds: Object.freeze({
      x0: Math.min(...corners.map((p) => p[0])),
      x1: Math.max(...corners.map((p) => p[0])),
      z0: Math.min(...corners.map((p) => p[1])),
      z1: Math.max(...corners.map((p) => p[1])),
      step: 0.25 as const,
    }),
  });
}
