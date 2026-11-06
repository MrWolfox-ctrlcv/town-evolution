import type { V3 } from './AssetTypes';
/** Indices reference the shared terrain positions, never logical amount-height boxes. */
export interface NaturalResourceSurface {
  id: string;
  indices: number[];
  min: V3;
  max: V3;
  center: V3;
}
export interface NaturalSurfaceData {
  /** Independent canonical chunk buffers; legacy single-buffer surfaces stay unchanged. */
  chunks?: readonly NaturalSurfaceData[];
  positions: readonly number[];
  resources: readonly NaturalResourceSurface[];
}
