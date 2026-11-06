/** Pure NEW-v5 geography. No objects, ownership, inventory, prices, navigation, or mutable cache. */
export const V5_NATURAL_COAST_REVISION = 'natural-rock-bight-linear-quarter-1';
export type CoastWaterKind = 'ocean' | 'bay' | 'lake' | 'river' | null;
export type CoastSide = 'auto' | 'land' | 'water';
export interface CoastBaseFields {
  readonly dry: number;
  readonly mainland: number;
  readonly bay: number;
  readonly lake: number;
  readonly river: number;
  readonly freshwater: number;
  readonly ocean: number;
  readonly waterKind: CoastWaterKind;
}
export interface CoastBaseSample extends CoastBaseFields {
  readonly bankScale: number;
  readonly height: number;
  readonly color: readonly [number, number, number];
}
export interface CoastBaseCertificate {
  readonly lipschitz: 1;
  readonly coverRadius: number;
  readonly dryMargin: 0.15;
  readonly requiredDepth: number;
}
export interface CoastBaseCell {
  readonly x: number;
  readonly z: number;
  readonly state: 'dryBuildable' | 'clearWater' | 'reservedBank';
  readonly waterKind: CoastWaterKind;
  readonly dryLower: number;
  readonly dryUpper: number;
  readonly freshLower: number;
  readonly oceanLower: number;
  readonly seaDockWater: boolean;
  readonly certificate: CoastBaseCertificate;
}
export interface NaturalCoastBaseHydrology {
  readonly seed: number;
  readonly size: number;
  readonly version: string;
  fields(x: number, z: number): CoastBaseFields;
  sample(x: number, z: number): CoastBaseSample;
  classifyCell(x: number, z: number): CoastBaseCell;
}
export interface NaturalCoastFeature {
  readonly version: typeof V5_NATURAL_COAST_REVISION;
  readonly baseRevision: string;
  readonly seed: number;
  /** Derived location only. This is not a Building or an owned/reserved construction. */
  readonly anchor: Readonly<{ x: number; z: number; width: 2; depth: 2 }>;
  readonly rotation: 0 | 1 | 2 | 3;
  readonly halfWidth: 8;
  readonly fullBedHalfWidth: 3.25;
  readonly gateway: number;
  readonly fadeLength: 3;
  readonly leftShoulder: number;
  readonly rightShoulder: number;
  readonly bedUpper: -1.3;
  readonly region: Readonly<{
    u: readonly [-10, 10];
    v: readonly [number, number];
  }>;
  readonly generatedObjects: 0;
}
export type NaturalCoastCertificate =
  | Readonly<{ kind: 'base-distance'; baseCertificate: CoastBaseCertificate }>
  | Readonly<{
      kind: 'natural-cliff-prism';
      sourceVersion: typeof V5_NATURAL_COAST_REVISION;
      baseCertificate: CoastBaseCertificate;
      bedUpperBound: number;
      requiredBedUpper: -1.085;
      freshwaterUpper: number;
      wholeCellSeaward: boolean;
      attachmentBoundary: boolean;
      /** Bare bed proof only. Does not grant passage through the wall/pier/posts. */
      waterSideClosedCell: true;
    }>
  | Readonly<{
      kind: 'natural-cliff-solid';
      baseCertificate: CoastBaseCertificate;
      topHeight: 0.015;
      minimumWaterGap: 0.613;
      wholeCellLandward: true;
    }>;
export interface NaturalCoastCell extends Omit<CoastBaseCell, 'certificate'> {
  readonly certificate: NaturalCoastCertificate;
}
export interface NaturalCoastSample extends CoastBaseSample {
  readonly x: number;
  readonly z: number;
  readonly u: number;
  readonly v: number;
  readonly baseHeight: number;
  readonly cliffBoundary: number;
  readonly influence: number;
  readonly geometryWaterKind: 'ocean' | null;
}
export interface CoastCellBounds {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}
export interface NaturalCoast {
  readonly feature: NaturalCoastFeature;
  readonly axes: Readonly<{
    u: readonly [number, number];
    v: readonly [number, number];
    origin: readonly [number, number];
  }>;
  toWorld(u: number, v: number): readonly [number, number];
  toLocal(x: number, z: number): readonly [number, number];
  /** Authoritative quarter-linear wall, shared by physics/picking/render geometry. */
  shore(u: number): number;
  shoreRange(u0: number, u1: number): Readonly<{ min: number; max: number }>;
  sampleLocal(u: number, v: number, side?: CoastSide): NaturalCoastSample;
  sampleLocalAtShore(u: number, side: 'land' | 'water'): NaturalCoastSample;
  /** Water-bed surface extension for normals only; never a permission/solid query. */
  sampleWaterBedLocal(u: number, v: number): NaturalCoastSample;
  sample(x: number, z: number, side?: CoastSide): NaturalCoastSample;
  classifyCell(x: number, z: number): NaturalCoastCell;
  cellBounds(x: number, z: number): CoastCellBounds;
  intersectsFeatureCell(x: number, z: number): boolean;
  reserveCell(x: number, z: number): boolean;
  boundaryCell(x: number, z: number): boolean;
  /** Source geography only. Does not grant fill attachment, clearance, navigation or ownership. */
  isMarineOriginCell(x: number, z: number): boolean;
  solid(x: number, y: number, z: number): boolean;
  waterDepth(x: number, z: number): number;
  readonly patchBounds: Readonly<{
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    step: 0.25;
  }>;
}
