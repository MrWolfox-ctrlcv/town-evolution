import type { Terrain6State, EditTerrain6Command } from './v6-edit-types';
import type { BridgeState } from './bridge-types';
export type { BridgeState, BridgePierSnapshot, BridgePlacement } from './bridge-types';
import type { Crop, Item, Stock, ItemAmount } from './inventory-types';
export type { Crop, Item, Stock, ItemAmount } from './inventory-types';
import type { ProcessingRecipeId, RecipeId } from './recipe-ids';
export type { ProcessingRecipeId, RecipeId } from './recipe-ids';
import type { TerrainVersion } from './world';
export type BuildingKind =
  | 'farm'
  | 'crate'
  | 'house'
  | 'residence'
  | 'warehouse'
  | 'expandedWarehouse'
  | 'coldWarehouse'
  | 'cooler'
  | 'shop'
  | 'orderBoard'
  | 'dock'
  | 'nursery'
  | 'stoneMill'
  | 'mill'
  | 'stoneOven'
  | 'bakery'
  | 'handcart'
  | 'transportWarehouse'
  | 'woodenPier'
  | 'boat'
  | 'compostBarrel'
  | 'woodenBridge';
export interface LandCell {
  x: number;
  z: number;
}
export type ToolId =
  | 'sickle'
  | 'wateringCan'
  | 'fertilizer'
  | 'hammer'
  | 'saw'
  | 'axe'
  | 'diggingTool';
export type Tool = ToolId;
export type ToolState = Record<ToolId, number>;
export interface Tree {
  id: string;
  x: number;
  z: number;
  plantedAt?: number;
  readyAt?: number;
  growthDurationMs?: number;
}
export interface NaturalResource {
  id: string;
  kind: 'stone' | 'soil';
  x: number;
  z: number;
  amount: number;
}
export interface GroundStack {
  x: number;
  z: number;
  item: Item;
  amount: number;
}
export interface MixedCraftRequest {
  recipeId: 'build-stone-oven';
  tool: 'hammer';
  /** Exact, explicitly selected pile snapshots. Never search for nearby substitutes. */
  sources: GroundStack[];
  x: number;
  z: number;
}
export type DropSource =
  | { type: 'natural'; resourceId: string; kind: 'soil' | 'stone' }
  | { type: 'terrain6'; x: number; z: number; operation: number; kind: 'soil' | 'stone' }
  | { type: 'crop'; buildingId: string; cell: number; jobId: string };
export interface LooseDrop {
  id: string;
  item: Item;
  amount: number;
  /** Absolute world coordinates in sixths of a map tile, never producer-relative. */
  x6: number;
  z6: number;
  source: DropSource;
}
export type DropSnapshot = Pick<LooseDrop, 'id' | 'item' | 'amount' | 'x6' | 'z6'>;
export type DropMoveTarget =
  | { type: 'ground'; x: number; z: number; stack?: GroundStack }
  | { type: 'drop'; drop: DropSnapshot };
export interface LocalContainer {
  /** Capacity is a saved snapshot, not a live lookup into the current balance. */
  capacity: number;
  stock: Stock;
}

export interface FarmCollectionBox extends LocalContainer {
  crateId: string;
}
export interface Job {
  id: string;
  startedAt: number;
  readyAt: number;
  crop?: Crop;
  durationMs?: number;
  yield?: number;
}
export interface CompostJob {
  id: string;
  startedAt: number;
  readyAt: number;
  durationMs: number;
  inputs: ItemAmount[];
  fertilizerYield: number;
}
export interface CompostState {
  capacity: number;
  stock: Stock;
  job?: CompostJob;
}
export type CompostSource =
  | { type: 'inventory'; item: Item; amount: number }
  | { type: 'ground'; stack: GroundStack }
  | { type: 'drop'; drop: DropSnapshot };
export interface ProcessingJob {
  id: string;
  recipeId: ProcessingRecipeId;
  startedAt: number;
  readyAt: number;
  durationMs: number;
  inputs: ItemAmount[];
  outputs: ItemAmount[];
}
export interface Discovery {
  count: number;
  firstDiscoveredAt: number;
}
export interface FusionState {
  attachments: Record<string, Stock>;
  discoveries: Partial<Record<RecipeId, Discovery>>;
}
export interface Building {
  id: string;
  /** v6-only absolute support plane, recomputed by every placement and checked on import. */
  baseElevation?: number;
  kind: BuildingKind;
  x: number;
  z: number;
  rotation: 0 | 1 | 2 | 3;
  job?: Job;
  cropJobs?: (Job | null)[];
  /** Absent means the original 3×3 crop grid on a 2×2 map footprint. */
  farmSize?: 6;
  irrigated?: true;
  nurserySeeded?: true;
  processingJob?: ProcessingJob;
  /** Absence retains legacy dock appearance and its existing shipping capability. */
  dockStyle?: 'simple';
  boatAttached?: true;
  collectionBox?: FarmCollectionBox;
  compost?: CompostState;
  bridge?: BridgeState;
}
export interface Shipment {
  id: number;
  /** New voyages snapshot their promise; absence denotes a legacy fixed-rate voyage. */
  durationMs?: number;
  unitPrices?: Stock;
  cargo: Stock;
  reward: number;
  startedAt: number;
  completeAt: number;
}
export interface CommerceState {
  offerId: number;
  shipmentId: number;
  shopStock: Record<string, Stock>;
  dockCargo: Record<string, Stock>;
  shipments: Record<string, Shipment>;
}
export interface GameState {
  schemaVersion: 10;
  fusion: FusionState;
  mapSeed: number;
  terrainVersion: TerrainVersion;
  /** Required on v5 preview saves. Old v1–v4 records remain byte-compatible. */
  terrainRevision?: string;
  terrain6?: Terrain6State;
  landExtensions: LandCell[];
  tools: ToolState;
  toolRecoveryAvailable: Record<ToolId, boolean>;
  trees: Tree[];
  naturalResources: NaturalResource[];
  nextTreeId: number;
  groundStacks: GroundStack[];
  looseDrops: LooseDrop[];
  cropRecoveryAvailable: boolean;
  commerce: CommerceState;
  coins: number;
  inventory: Record<Item, number>;
  buildings: Building[];
  nextId: number;
  lastSeenAt: number;
  completedOrders: number;
}
export type EntitySnapshot = Pick<Building, 'id' | 'kind' | 'x' | 'z' | 'rotation'>;
export type Command =
  | EditTerrain6Command
  | { type: 'depositCompost'; buildingId: string; quantity: number; source: CompostSource }
  | { type: 'withdrawCompostInput'; buildingId: string; item: Item; quantity: number }
  | { type: 'collectCompost'; buildingId: string; jobId: string }
  | { type: 'moveDrop'; source: DropSnapshot; target: DropMoveTarget }
  | { type: 'mergeStackIntoDrop'; source: GroundStack; target: DropSnapshot }
  | { type: 'hammerAssembly'; tool: 'hammer'; sources: EntitySnapshot[] }
  | { type: 'pickupDrop'; dropId: string }
  | { type: 'attachFarmBox'; buildingId: string; crateId: string }
  | { type: 'withdrawFarmBox'; buildingId: string; item: Crop; quantity: number }
  | ({ type: 'craftMixed' } & MixedCraftRequest)
  | { type: 'buildNursery'; buildingId: string; source?: LandCell }
  | { type: 'seedNursery'; buildingId: string; source?: LandCell }
  | { type: 'plantSapling'; x: number; z: number; source?: LandCell }
  | { type: 'startProcessing'; buildingId: string; recipeId: ProcessingRecipeId }
  | { type: 'collectProcessing'; buildingId: string; jobId: string }
  | {
      type: 'transportDeliver';
      buildingId: string;
      targetId: string;
      cargo: { item: Item; quantity: number }[];
    }
  | { type: 'useTool'; tool: 'diggingTool'; x: number; z: number }
  | { type: 'useTool'; tool: 'wateringCan'; buildingId: string }
  | { type: 'useTool'; tool: 'wateringCan'; x: number; z: number; sources: LandCell[] }
  | { type: 'expandLand'; fromX: number; fromZ: number; x: number; z: number }
  | { type: 'buildResidence'; buildingId: string; source?: LandCell }
  | {
      type: 'attachMaterial' | 'detachMaterial';
      buildingId: string;
      item: Item;
      quantity: number;
      source?: GroundStack;
    }
  | { type: 'useTool'; tool: 'hammer'; buildingId: string }
  | { type: 'useTool'; tool: 'hammer'; x: number; z: number }
  | { type: 'gatherNatural'; resourceId: string }
  | { type: 'recoverCrop' }
  | { type: 'buyTool'; tool: ToolId }
  | { type: 'recoverTool'; tool: ToolId }
  | { type: 'placeTree'; x: number; z: number }
  | { type: 'dropProduct'; item: Item; x: number; z: number; quantity?: number }
  | { type: 'pickupStack'; x: number; z: number; warehouseId?: string }
  | { type: 'pickupProduct'; item: Item; x: number; z: number; quantity?: number }
  | { type: 'useTool'; tool: 'axe'; treeId: string }
  | { type: 'useTool'; tool: 'saw'; x: number; z: number }
  | { type: 'rotateBuilding'; buildingId: string }
  | { type: 'moveStack'; fromX: number; fromZ: number; x: number; z: number }
  | { type: 'moveBuilding'; buildingId: string; x: number; z: number; source?: EntitySnapshot }
  | { type: 'plantCell'; buildingId: string; cell: number; crop?: Crop }
  | { type: 'harvestCell'; buildingId: string; cell: number }
  | { type: 'buyCrop'; item: Crop; quantity: number }
  | {
      type: 'place';
      kind: 'farm' | 'warehouse' | 'cooler' | 'shop' | 'orderBoard' | 'dock';
      x: number;
      z: number;
      rotation?: 0 | 1 | 2 | 3;
    }
  | { type: 'repurposeToBoard'; buildingId: string }
  | { type: 'start'; buildingId: string }
  | { type: 'collect'; buildingId: string }
  | { type: 'upgrade'; buildingId: string; target: 'expandedWarehouse' }
  | { type: 'combine'; warehouseId: string; coolerId: string }
  | { type: 'dragMerge'; sourceId: string; targetId: string; sources?: EntitySnapshot[] }
  | { type: 'sell'; orderId: Item }
  | {
      type: 'shopTrade';
      buildingId: string;
      item: Item;
      quantity: number;
      side: 'buy' | 'sell';
      source?: LandCell;
    }
  | { type: 'orderFulfill'; buildingId: string; orderId: Item; offerId: number }
  | {
      type: 'dockTransfer';
      buildingId: string;
      item: Item;
      quantity: number;
      direction: 'stage' | 'return';
      source?: LandCell;
    }
  | { type: 'dockShip'; buildingId: string; shipmentId: number }
  | { type: 'dockCollect'; buildingId: string; shipmentId: number };
export type Result =
  | { ok: true; state: GameState; events: string[] }
  | { ok: false; state: GameState; error: string };
