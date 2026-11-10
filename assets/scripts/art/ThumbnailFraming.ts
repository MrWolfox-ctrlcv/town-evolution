import type { MeshData, V3 } from './AssetTypes';

export const THUMBNAIL_COLUMNS = 4;
// Forty-four canonical models still fit the existing 2 MiB atlas budget.
export const THUMBNAIL_PIXELS = 108;
export const THUMBNAIL_EYE: V3 = [6, 5, 8];
const length = (v: V3) => Math.hypot(...v);
const unit = (v: V3): V3 => v.map((n) => n / length(v)) as unknown as V3;
const dot = (a: V3, b: V3) => a.reduce((sum, n, i) => sum + n * b[i]!, 0);
export const THUMBNAIL_RIGHT = unit([THUMBNAIL_EYE[2], 0, -THUMBNAIL_EYE[0]]);
const eye = unit(THUMBNAIL_EYE);
export const THUMBNAIL_UP: V3 = [
  eye[1] * THUMBNAIL_RIGHT[2],
  eye[2] * THUMBNAIL_RIGHT[0] - eye[0] * THUMBNAIL_RIGHT[2],
  -eye[1] * THUMBNAIL_RIGHT[0],
];

/** Fit the actual projected vertices, so long roofs and flat farms cannot be cropped. */
export function thumbnailFraming(mesh: MeshData, index: number, count: number) {
  const rows = Math.ceil(count / THUMBNAIL_COLUMNS);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const point = mesh.positions.slice(i, i + 3) as unknown as V3;
    for (const [axis, basis] of [THUMBNAIL_RIGHT, THUMBNAIL_UP, eye].entries()) {
      const value = dot(point, basis);
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
  }
  const scale = 0.84 / Math.max(max[0]! - min[0]!, max[1]! - min[1]!, 0.001);
  const column = index % THUMBNAIL_COLUMNS,
    row = Math.floor(index / THUMBNAIL_COLUMNS);
  const target = [column - (THUMBNAIL_COLUMNS - 1) / 2, (rows - 1) / 2 - row, 0];
  const delta = target.map((value, i) => value - ((min[i]! + max[i]!) / 2) * scale);
  const position = [0, 1, 2].map(
    (i) => THUMBNAIL_RIGHT[i]! * delta[0]! + THUMBNAIL_UP[i]! * delta[1]! + eye[i]! * delta[2]!,
  ) as unknown as V3;
  return { scale, position, column, row, rows };
}

/** Convert top-to-bottom atlas cells to the active graphics backend's texture origin. */
export function thumbnailRegion(index: number, count: number, screenSpaceSignY: number) {
  const rows = Math.ceil(count / THUMBNAIL_COLUMNS);
  const row = Math.floor(index / THUMBNAIL_COLUMNS);
  const flipY = screenSpaceSignY > 0;
  return {
    x: (index % THUMBNAIL_COLUMNS) * THUMBNAIL_PIXELS,
    y: (flipY ? rows - 1 - row : row) * THUMBNAIL_PIXELS,
    size: THUMBNAIL_PIXELS,
    flipY,
  };
}
