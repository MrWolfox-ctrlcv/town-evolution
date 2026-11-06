import { move } from './AssetTypes';
import type { AssetRecipe, V3 } from './AssetTypes';
import { woodenBoard } from './BuildingAccessories';
import { simpleDock } from './DockPierKit';

export const DOCK_BOARD_POSITION: V3 = [-0.39, 0.38, -0.71];
export const DOCK_BOARD_SCALE = 0.88;

/** Three recognizable ingredients; the legacy dock and the earlier two-part asset stay unchanged. */
export function threeComponentDock(): AssetRecipe {
  const original = simpleDock();
  // Remove only four decorative cap rings to fit the established 3,000-triangle budget.
  // Every plank, piling, nail, rope, brace and crate part remains identical to the input assembly.
  const parts = original.parts.filter((p) => p.name !== 'pier-post-endgrain');
  parts.push(...move(woodenBoard(), DOCK_BOARD_POSITION, DOCK_BOARD_SCALE));
  return {
    ...original,
    id: 'dock-simple-three',
    parts,
    sockets: { ...original.sockets, noticeBoard: DOCK_BOARD_POSITION },
  };
}
