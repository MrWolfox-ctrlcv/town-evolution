import { BUILDING_ASSETS } from './BuildingAssets';
import type { BuildingKind } from '../domain/types';
import { ASSETS } from './AssetCatalog';
import { compileAsset } from './MeshCompiler';
const heights = new Map<BuildingKind, number>();
/** The tray clears actual mesh vertices, rather than guessing from logical collision height. */
export function attachmentHeight(kind: BuildingKind): number {
  let height = heights.get(kind);
  if (height !== undefined) return height;
  height = compileAsset(ASSETS[BUILDING_ASSETS[kind]]!).max[1]!;
  if (kind === 'farm') {
    for (const crop of ['vegetable', 'wheat', 'lettuce', 'rice'])
      height = Math.max(height, compileAsset(ASSETS[`crop-cell-${crop}-ready`]!).max[1]! * 1.2);
  }
  height += 0.08;
  heights.set(kind, height);
  return height;
}
/** Fixed attachment slots remain within the smallest (one cell) building footprint. */
export function attachmentSlot(index: number): { x: number; y: number; z: number } {
  return { x: ((index % 3) - 1) * 0.28, y: 0.04, z: Math.floor(index / 3) * 0.42 - 0.21 };
}
/** Presentation trajectory: debris starts at the cut, arcs, then rests above ground. */
export function woodChipPose(index: number, time: number): { x: number; y: number; z: number } {
  const p = Math.max(0, Math.min(1, (time - 0.23) / 0.57)),
    a = index * 2.4;
  return {
    x: Math.cos(a) * p * 0.8,
    y: 0.08 + Math.sin(p * Math.PI) * 0.55,
    z: Math.sin(a) * p * 0.8,
  };
}
