import { farmBed, cropCell } from './FarmCellKit';
import { shop, orderBoard, dock } from './TradeKit';
import { warehouse, shell, roof, door, deck, wing, cooling } from './WarehouseKit';
import { farm, environment } from './EnvironmentKit';
import type { AssetRecipe } from './AssetTypes';
export const ASSETS: Record<string, AssetRecipe> = Object.fromEntries(
  [
    farmBed(),
    ...(['vegetable', 'wheat', 'lettuce'] as const).flatMap((crop) =>
      (['seedling', 'ready'] as const).map((stage) => cropCell(stage, crop)),
    ),
    // Retain canonical IDs used by earlier exported art packs.
    { ...cropCell('seedling'), id: 'crop-cell-seedling' },
    { ...cropCell('ready'), id: 'crop-cell-ready' },
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
  ].map((asset) => [asset.id, asset as AssetRecipe]),
);
export function cropStage(
  job: { readyAt: number } | undefined,
  now: number,
): 'empty' | 'seedling' | 'ready' {
  return !job ? 'empty' : now >= job.readyAt ? 'ready' : 'seedling';
}
