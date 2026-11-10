import { woodenBench } from './BenchKit';
import { craftedFence } from './CraftedFenceKit';
import { woodenBridge } from './WoodenBridgeKit';
import { compostBarrelAssets, roastedCarrot } from './BarrelRoastKit';
import { farmCollectionBoxAssets, farmWithBox } from './FarmBoxKit';
import { threeComponentDock } from './DockNoticeBoardKit';
import { handcart, transportWarehouse } from './TransportKit';
import { nursery, sapling } from './NurseryKit';
import { stoneMill, mill } from './RiceMillKit';
import { stoneOven, bakery } from './BakeryKit';
import { woodenPier, simpleDock, dockPierExtension, woodenBoat } from './DockPierKit';
import { stackLimitFor } from '../domain/foundation';
import { house, residence } from './HouseKit';
import { naturalBlock } from './NaturalBlockKit';
import { pineParts, treeVariants } from './TreeKit';
import { categorizeAsset } from './AssetCategories';
import { PRODUCTS, productPile } from './ProductPileKit';
import { farmBed, cropCell } from './FarmCellKit';
import { shop, orderBoard, dock } from './TradeKit';
import { warehouse, shell, roof, door, deck, wing, cooling } from './WarehouseKit';
import { farm, environment } from './EnvironmentKit';
import type { AssetRecipe } from './AssetTypes';
export const ASSETS: Record<string, AssetRecipe> = Object.fromEntries(
  [
    ...compostBarrelAssets(),
    roastedCarrot(),
    ...farmCollectionBoxAssets(),
    farmWithBox(),
    farmWithBox(6),
    farmWithBox(3, true),
    farmWithBox(6, true),
    threeComponentDock(),
    farmBed(),
    farmBed(6),
    farmBed(3, true),
    farmBed(6, true),
    ...(['grass', 'forest', 'stone', 'soil', 'sand'] as const).map((material) =>
      naturalBlock(material),
    ),
    { id: 'tree-pine', footprint: [1.2, 1.2], parts: pineParts() },
    ...treeVariants(),
    ...PRODUCTS.flatMap((item) =>
      Array.from({ length: stackLimitFor(item) }, (_, i) => productPile(item, i + 1)),
    ),
    ...(['vegetable', 'wheat', 'lettuce', 'rice'] as const).flatMap((crop) =>
      (['seedling', 'young', 'ready'] as const).map((stage) => cropCell(stage, crop)),
    ),
    // Retain canonical IDs used by earlier exported art packs.
    { ...cropCell('seedling'), id: 'crop-cell-seedling' },
    { ...cropCell('ready'), id: 'crop-cell-ready' },
    ...(['empty', 'seeded', 'growing', 'ready'] as const).map(nursery),
    sapling(),
    stoneMill(),
    mill(),
    stoneOven(),
    bakery(),
    handcart(),
    woodenBench(),
    craftedFence(),
    transportWarehouse(),
    woodenPier(),
    ...Array.from({ length: 10 }, (_, i) => woodenBridge(i + 7)),
    simpleDock(),
    dockPierExtension(),
    woodenBoat(),
    house(),
    residence(),
    shop(),
    orderBoard(),
    dock(),
    warehouse('warehouse-base'),
    warehouse('warehouse-expanded'),
    warehouse('warehouse-cold'),
    { id: 'cooler', footprint: [1, 1], parts: cooling() },
    ...(['empty', 'seedling', 'ready'] as const).map(farm),
    ...(['crate', 'fence', 'tree', 'rock', 'path'] as const).map(environment),
    ...Object.entries({
      shell: shell(),
      roof: roof(),
      door: door(),
      deck: deck(),
      wing: wing(),
      cooling: cooling(),
    }).map(([name, parts]) => ({ id: `module-${name}`, footprint: [2, 2], parts })),
  ].map((asset) => [asset.id, { ...asset, category: categorizeAsset(asset.id) } as AssetRecipe]),
);
export function cropStage(
  job: { readyAt: number } | undefined,
  now: number,
): 'empty' | 'seedling' | 'ready' {
  return !job ? 'empty' : now >= job.readyAt ? 'ready' : 'seedling';
}
