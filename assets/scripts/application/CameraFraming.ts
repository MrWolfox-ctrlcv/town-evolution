import { MAX_TERRAIN_HEIGHT } from '../domain/world';
import type { GameState } from '../domain/types';
import { footprint } from '../domain/geometry';
import { isCrop } from '../domain/crops';

/** A read-only landing view of the starter village, never a saved-world migration. */
export function demoVillageFrame(state: GameState) {
  const farm =
    state.buildings.find((b) => b.id === 'b2' && b.kind === 'farm') ??
    state.buildings.find((b) => b.kind === 'farm') ??
    state.buildings[0];
  const home = farm
    ? { x: farm.x + footprint(farm).width / 2, z: farm.z + footprint(farm).depth / 2 }
    : { x: 6, z: 6 };
  const crops = state.groundStacks.filter(
    (p) => isCrop(p.item) && Math.hypot(p.x + 0.5 - home.x, p.z + 0.5 - home.z) < 12,
  );
  const docks = state.buildings.filter(
    (b) => b.kind === 'dock' && Math.hypot(b.x - home.x, b.z - home.z) < 32,
  );
  if (!docks.length) return { ...home, zoomScale: 1 };
  const points = [
    ...(crops.length ? crops.map((p) => ({ x: p.x + 0.5, z: p.z + 0.5 })) : [home]),
    ...docks.map((b) => ({
      x: b.x + footprint(b).width / 2,
      z: b.z + footprint(b).depth / 2,
    })),
  ];
  // Center projected extrema, not object counts. Adding one nearby product must
  // not push an existing crop under a phone's fixed side tray.
  const horizontal = points.map((p) => p.x * 18 - p.z * 15),
    vertical = points.map((p) => p.x * 15 + p.z * 18);
  const u = (Math.min(...horizontal) + Math.max(...horizontal)) / 2,
    v = (Math.min(...vertical) + Math.max(...vertical)) / 2;
  return { x: (18 * u + 15 * v) / 549, z: (18 * v - 15 * u) / 549, zoomScale: 1.4 };
}
/** Conservative projected bounds for the island and its perimeter foliage.
 * Camera direction is (15, 20, 18); half-height includes roofs and bank depth.
 * Unlike aspect clamping, this guarantees horizontal fit on narrow phones.
 */
export function fittedOrthoHeight(aspect: number, gridSize = 12): number {
  return Math.max(8.3, 10.4 / Math.max(0.01, aspect)) * Math.max(1, gridSize / 12);
}

export function homeZoom(gridSize: number): number {
  return Math.min(1, 12 / Math.max(1, gridSize));
}

/** Keep the same closest physical view on the 40-cell and 192-cell worlds. */
export function clampMapZoom(zoom: number, gridSize: number): number {
  const minimum = 0.15 * Math.min(1, 40 / Math.max(1, gridSize));
  return Math.max(minimum, Math.min(1.8, zoom));
}

export function steppedMapZoom(zoom: number, delta: number, gridSize: number): number {
  // Large worlds need proportional steps: a fixed .12 step skips the entire
  // starter coast, while a scaled additive step barely moves at overview zoom.
  return clampMapZoom(
    gridSize > 40 ? zoom * Math.exp(delta * 0.25) : zoom + delta * 0.12,
    gridSize,
  );
}

/** Orthographic depth bounds, independent of focus and the title's small yaw.
 * Retreat only as far as the visible terrain requires. Merely increasing far
 * leaves visible land behind the camera at overview/pan limits, even on old
 * 40-cell worlds. Retreat along the existing direction, preserving projection.
 */
export const V6_VIEW_TOP = 64.015 + 8;
export function cameraDepth(gridSize: number, orthoHeight: number, top = MAX_TERRAIN_HEIGHT + 4) {
  const length = Math.hypot(15, 20, 18);
  const up = 20 / length;
  const horizontal = Math.hypot(15, 18) / length;
  const bottom = 4;
  // Water extends from -size to 2*size; panning allows four cells of margin.
  const worldDepth = (gridSize * 2 + 4) * horizontal * Math.SQRT2;
  const visibleDepth = (Math.max(0, orthoHeight) * horizontal) / up;
  const distance = Math.max(length, Math.min(worldDepth + top * up, visibleDepth + top / up) + 8);
  const scale = distance / length;
  return {
    x: 15 * scale,
    y: 20 * scale,
    z: 18 * scale,
    near: 0.1,
    far: Math.max(
      100,
      Math.ceil(distance + Math.min(worldDepth + bottom * up, visibleDepth + bottom / up) + 8),
    ),
  };
}
