import type { Building, BuildingKind } from '../domain/types';
import { nurseryStage } from '../domain/nursery';
import { compostStage } from '../domain/compost';
/** One stable mapping is shared by live buildings and attachment-height measurements. */
export const BUILDING_ASSETS: Record<BuildingKind, string> = {
  farm: 'farm-cell-bed',
  crate: 'crate',
  compostBarrel: 'compost-barrel',
  house: 'house',
  residence: 'residence',
  warehouse: 'warehouse-base',
  expandedWarehouse: 'warehouse-expanded',
  coldWarehouse: 'warehouse-cold',
  cooler: 'cooler',
  shop: 'shop',
  orderBoard: 'order-board',
  dock: 'dock',
  nursery: 'nursery-ready',
  stoneMill: 'stone-mill',
  mill: 'mill',
  stoneOven: 'stone-oven',
  bakery: 'bakery',
  handcart: 'handcart',
  transportWarehouse: 'warehouse-transport',
  woodenPier: 'wooden-pier',
  woodenBridge: 'wooden-bridge-8',
  boat: 'boat',
};
export function buildingAssetId(building: Building, now: number): string {
  if (building.kind === 'woodenBridge') {
    const length = building.bridge?.length;
    if (!Number.isInteger(length) || length! < 7 || length! > 16)
      throw new Error('Invalid bridge length');
    return `wooden-bridge-${length}`;
  }
  if (building.kind === 'compostBarrel' && building.compost) {
    const stage = compostStage(building.compost, now);
    return stage === 'idle' ? 'compost-barrel' : `compost-barrel-${stage}`;
  }
  if (building.kind === 'nursery') return `nursery-${nurseryStage(building, now)}`;
  if (building.kind === 'dock' && building.dockStyle === 'simple') return 'dock-simple-three';
  return BUILDING_ASSETS[building.kind];
}
