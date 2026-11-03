/** Engine-independent source of truth for every exported and in-game mesh. */
export type V3 = readonly [number, number, number];
export type Shape =
  | 'box'
  | 'gable'
  | 'gem'
  | 'crown'
  | 'timber'
  | 'blade'
  | 'grain'
  | 'kernel'
  | 'cerealLeaf'
  | 'straw'
  | 'ribbon'
  | 'frond'
  | 'log'
  | 'root'
  | 'binding';
export interface Part {
  name: string;
  shape: Shape;
  position: V3;
  size: V3;
  color: string;
  rotation?: V3;
}
export interface AssetRecipe {
  id: string;
  footprint: readonly [number, number];
  parts: Part[];
  sockets?: Record<string, V3>;
}
export interface MeshData {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  min: number[];
  max: number[];
}
export const ART = {
  plaster: '#F5E2BE',
  stone: '#D5BE94',
  roof: '#D66C42',
  roofDark: '#A84D31',
  wood: '#B77E43',
  woodLight: '#D49A53',
  woodDark: '#765039',
  teal: '#468B83',
  tealLight: '#89B9AA',
  tealDark: '#2E605D',
  soil: '#956443',
  soilDark: '#744B35',
  leaf: '#8DA644',
  leafLight: '#ACBE55',
  trunk: '#86603D',
  rock: '#93877B',
  grass: '#97AE65',
  path: '#E2C397',
  glass: '#78A8AD',
};
export function part(
  name: string,
  shape: Shape,
  position: V3,
  size: V3,
  color: string,
  rotation?: V3,
): Part {
  return { name, shape, position, size, color, ...(rotation ? { rotation } : {}) };
}
export function move(parts: Part[], offset: V3, scale = 1): Part[] {
  return parts.map((p) => ({
    ...p,
    position: p.position.map((v, i) => v * scale + offset[i]!) as unknown as V3,
    size: p.size.map((v) => v * scale) as unknown as V3,
  }));
}
