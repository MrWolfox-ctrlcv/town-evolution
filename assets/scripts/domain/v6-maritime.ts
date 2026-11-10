import { getEditableWorld } from './editable-world';
import type { TerrainVersion } from './world';
import { validateV7Extensions, isV7DockShore } from './v7-maritime';
import { validateV5Extensions, isV5DockShore } from './v5-marine';
interface Cell {
  x: number;
  z: number;
}
/** v6 deliberately freezes the published v5 water topology; only inland relief differs. */
export function validateV6Extensions(
  seed: number,
  cells: readonly Cell[],
  version: TerrainVersion = 6,
): void {
  if (version === 7) return validateV7Extensions(seed, cells);
  getEditableWorld(seed, version);
  validateV5Extensions(seed, cells);
}
export function isV6MarineCell(
  seed: number,
  x: number,
  z: number,
  extensions: readonly Cell[],
  version: TerrainVersion = 6,
): boolean {
  return (
    getEditableWorld(seed, version).hydrology.at(x, z)?.seaDockWater === true &&
    !extensions.some((p) => p.x === x && p.z === z)
  );
}
export function isV6DockShore(
  seed: number,
  b: Cell & { rotation: number },
  extensions: readonly Cell[],
  version: TerrainVersion = 6,
): boolean {
  getEditableWorld(seed, version);
  return version === 7 ? isV7DockShore(seed, b, extensions) : isV5DockShore(seed, b, extensions);
}
