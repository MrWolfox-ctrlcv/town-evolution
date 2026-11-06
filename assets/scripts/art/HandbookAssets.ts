import { ASSETS } from './AssetCatalog';
import { buildContinuousCoast } from './ContinuousCoast';
import { ContinuousResources } from './ContinuousResources';
import type { AssetRecipe } from './AssetTypes';

/** IDs are the actual town meshes, never separately drawn lookalikes. */
export const HANDBOOK_MODELS: Readonly<Record<string, string>> = {
  tree: 'tree-canopy-0',
  compostBarrel: 'compost-barrel',
  roastedCarrot: 'roasted-carrot',
  vegetable: 'pile-vegetable-1',
  lettuce: 'pile-lettuce-1',
  wood: 'pile-wood-1',
  treeSeed: 'pile-treeSeed-1',
  sapling: 'pile-sapling-1',
  nursery: 'nursery-ready',
  rice: 'pile-rice-1',
  wheat: 'pile-wheat-1',
  milledRice: 'pile-milledRice-1',
  flour: 'pile-flour-1',
  bread: 'pile-bread-1',
  stoneMill: 'stone-mill',
  mill: 'mill',
  stoneOven: 'stone-oven',
  bakery: 'bakery',
  handcart: 'handcart',
  transportWarehouse: 'warehouse-transport',
  woodenPier: 'wooden-pier',
  woodenBridge: 'wooden-bridge-8',
  dock: 'dock-simple-three',
  boat: 'boat',
  house: 'house',
  crate: 'crate',
  orderBoard: 'order-board',
  warehouse: 'warehouse-base',
  shop: 'shop',
  expandedWarehouse: 'warehouse-expanded',
  flatLand: 'handbook-ground-sample',
  farm: 'farm-cell-bed',
  farmWithBox: 'farm-with-box',
  largeFarm: 'farm-large-bed',
  waterFarm: 'farm-cell-bed-water',
  soilMound: 'handbook-soil-mound-sample',
  stoneDeposit: 'handbook-stone-deposit-sample',
  soil: 'pile-soil-1',
  stone: 'pile-stone-1',
  mud: 'pile-mud-1',
  residence: 'residence',
  reclaimedLand: 'handbook-reclaimed-land-sample',
};

/** Tools have no world mesh: use the identical PNG used by the live tool tray. */
export const HANDBOOK_TOOLS: Readonly<Record<string, string>> = {
  fertilizer: 'fertilizer',
  axe: 'axe',
  sickle: 'sickle',
  saw: 'saw',
  hammer: 'hammer',
  diggingTool: 'digging-tools',
  wateringCan: 'watering-can',
};

// Cache the same live terrain compilers' output, not a separately authored illustration.
const samples = new Map<string, AssetRecipe>();
export function handbookAsset(kind: string): AssetRecipe | undefined {
  const id = HANDBOOK_MODELS[kind];
  if (!id) return undefined;
  if (ASSETS[id]) return ASSETS[id];
  const cached = samples.get(kind);
  if (cached) return cached;
  let sample: AssetRecipe;
  if (kind === 'soilMound' || kind === 'stoneDeposit') {
    const resource = kind === 'soilMound' ? 'soil' : 'stone';
    const elevation = resource === 'soil' ? 1 : 3;
    const field = new ContinuousResources(1, 73129, () => ({
      biome: resource === 'soil' ? 'hill' : 'mountain',
      elevation,
    }));
    sample = {
      id,
      footprint: [1, 1],
      parts: [],
      mesh: field.sync([{ id, x: 0, z: 0, kind: resource, amount: elevation }]).mesh,
    };
  } else if (kind === 'flatLand' || kind === 'reclaimedLand') {
    const size = kind === 'flatLand' ? 2 : 1;
    sample = {
      id,
      footprint: [size, size],
      parts: [],
      // Same shoreline/ground compiler and materials used under the town.
      mesh: buildContinuousCoast(size, 73129, () => true).mesh,
    };
  } else return undefined;
  samples.set(kind, sample);
  return sample;
}
