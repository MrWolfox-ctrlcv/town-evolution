import type { Item } from './inventory-types';
/** Unreleased v6 balance. One soil/stone unit is one tile × nominal global layer. */
export const V6_MATERIAL_QUANTA = 4096;
export type V6Material = 'soil' | 'stone';
export interface V6FillLayer {
  level: number;
  material: V6Material;
}
export interface V6CellCheckpoint {
  x: number;
  z: number;
  /** Complete live deposit amount before this cell's first edit. Zero means exhausted. */
  initialResourceAmount: number;
  /** Lowest natural clipping plane ever reached. Null means the original surface. */
  cutLevel: number | null;
  level: number;
  fills: V6FillLayer[];
}
export interface Terrain6State {
  format: 1;
  /** Strict stale-command guard, not a bounded journal. Loading never pays a yield. */
  nextOperation: number;
  cells: V6CellCheckpoint[];
}
export type V6MaterialSource =
  | { type: 'inventory'; item: V6Material; amount: number }
  | { type: 'ground'; stack: { x: number; z: number; item: Item; amount: number } };
export type EditTerrain6Command = {
  type: 'editTerrain6';
  x: number;
  z: number;
  level: number;
  expectedOperation: number;
} & ({ kind: 'dig' } | { kind: 'fill'; material: V6Material; source: V6MaterialSource });
export interface V6NaturalResource {
  id: string;
  x: number;
  z: number;
  kind: V6Material;
  amount: number;
}
/** Read capability only: material arithmetic never constructs or mutates a generator. */
export interface V6MaterialWorld {
  size: number;
  vertex(x: number, z: number): { ground: number; stone: number; soil: number };
  resourceAt(x: number, z: number): V6NaturalResource | null;
  occupiedLevels(x: number, z: number): readonly number[];
}
export function cloneTerrain6(value: Terrain6State): Terrain6State {
  return {
    format: 1,
    nextOperation: value.nextOperation,
    cells: value.cells.map((c) => ({ ...c, fills: c.fills.map((f) => ({ ...f })) })),
  };
}
