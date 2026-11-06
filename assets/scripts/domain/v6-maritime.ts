import { getV6World } from './v6-world';
import { validateV5Extensions, isV5DockShore } from './v5-marine';
interface Cell {
  x: number;
  z: number;
}
/** v6 deliberately freezes the published v5 water topology; only inland relief differs. */
export function validateV6Extensions(seed: number, cells: readonly Cell[]): void {
  getV6World(seed);
  validateV5Extensions(seed, cells);
}
export function isV6MarineCell(
  seed: number,
  x: number,
  z: number,
  extensions: readonly Cell[],
): boolean {
  return (
    getV6World(seed).hydrology.at(x, z)?.seaDockWater === true &&
    !extensions.some((p) => p.x === x && p.z === z)
  );
}
export function isV6DockShore(
  seed: number,
  b: Cell & { rotation: number },
  extensions: readonly Cell[],
): boolean {
  getV6World(seed);
  return isV5DockShore(seed, b, extensions);
}
