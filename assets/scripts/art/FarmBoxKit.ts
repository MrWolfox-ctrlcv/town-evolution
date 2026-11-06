import type { Crop } from '../domain/types';
import { move } from './AssetTypes';
import type { AssetRecipe, Part, V3 } from './AssetTypes';
import { woodenCrate } from './BuildingAccessories';
import { cropProductUnit } from './CropPileKit';
import { farmBed } from './FarmCellKit';
import { compileAsset } from './MeshCompiler';

export const FARM_BOX_SCALE = 1.65;
const BOX_CROPS: readonly Crop[] = ['vegetable', 'wheat', 'lettuce', 'rice'];
export type FarmBoxVisualStock = Partial<Record<Crop, number>>;

/** Rotation belongs to the existing FarmGrid; the original field center never moves. */
export function farmBoxLocalCenter(size: 3 | 6 = 3): V3 {
  const half = size / 3;
  return [half + 0.5, 0, half - 0.5];
}

function visibleCrops(stock: FarmBoxVisualStock): Crop[] {
  return BOX_CROPS.filter((crop) => Number.isFinite(stock[crop]) && (stock[crop] ?? 0) > 0);
}

/** Choose a cached variant without rebuilding its geometry during town refreshes. */
export function farmCollectionBoxAssetId(stock: FarmBoxVisualStock = {}): string {
  const mask = visibleCrops(stock).reduce(
    (value, crop) => value | (1 << BOX_CROPS.indexOf(crop)),
    0,
  );
  return `farm-collection-box-${mask}`;
}

/** Presence-only display: actual stored crop kinds appear, quantities remain the HUD's job. */
export function farmCollectionBox(stock: FarmBoxVisualStock = {}): AssetRecipe {
  const crops = visibleCrops(stock);
  const parts: Part[] = move(woodenCrate(), [0, 0, 0], FARM_BOX_SCALE);
  crops.forEach((crop, index) => {
    const source = cropProductUnit(crop);
    const mesh = compileAsset({ id: crop, footprint: [1, 1], parts: source });
    const scale = 0.52;
    const x = crops.length === 1 ? 0 : index % 2 ? 0.16 : -0.16;
    const z = crops.length < 3 ? 0 : index < 2 ? -0.16 : 0.16;
    const centered = source.map((p) => ({
      ...p,
      name: `farm-box-${crop}-${p.name}`,
      position: [
        p.position[0] - (mesh.min[0]! + mesh.max[0]!) / 2,
        p.position[1] - mesh.min[1]!,
        p.position[2] - (mesh.min[2]! + mesh.max[2]!) / 2,
      ] as V3,
    }));
    parts.push(...move(centered, [x, 0.72, z], scale));
  });
  return {
    id: farmCollectionBoxAssetId(stock),
    footprint: [1, 1],
    parts,
    sockets: { contents: [0, 0.72, 0] },
  };
}

/** Register these finite variants once; model rebuilds choose the current stock's mask. */
export function farmCollectionBoxAssets(): AssetRecipe[] {
  return Array.from({ length: 16 }, (_, mask) =>
    farmCollectionBox(
      Object.fromEntries(BOX_CROPS.map((crop, bit) => [crop, mask & (1 << bit) ? 1 : 0])),
    ),
  );
}

/** Handbook assembly made from the same field and empty box meshes used in the town. */
export function farmWithBox(size: 3 | 6 = 3, irrigated = false): AssetRecipe {
  const bed = farmBed(size, irrigated),
    box = farmCollectionBox(),
    center = farmBoxLocalCenter(size);
  // This thumbnail-only translation centers the union. Never apply it to the live FarmGrid.
  const parts = move([...bed.parts, ...move(box.parts, center)], [-0.5, 0, 0]);
  return {
    id: `${size === 6 ? 'farm-large-with-box' : 'farm-with-box'}${irrigated ? '-water' : ''}`,
    footprint: [bed.footprint[0] + 1, bed.footprint[1]],
    parts,
    sockets: { fieldCenter: [-0.5, 0, 0], boxCenter: [center[0] - 0.5, 0, center[2]] },
  };
}
