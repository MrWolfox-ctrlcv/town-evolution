export type BuildingKind =
  | 'farm'
  | 'warehouse'
  | 'expandedWarehouse'
  | 'coldWarehouse'
  | 'cooler'
  | 'shop'
  | 'orderBoard'
  | 'dock';
export type Crop = 'vegetable' | 'wheat' | 'lettuce';
export type Item = Crop | 'chilledVegetable' | 'wood' | 'stone';
export type ToolId = 'sickle' | 'wateringCan' | 'fertilizer' | 'hammer' | 'saw' | 'axe';
export type Tool = ToolId;
export type ToolState = Record<ToolId, number>;
export interface Tree {
  id: string;
  x: number;
  z: number;
}
export interface GroundStack {
  x: number;
  z: number;
  item: Item;
  amount: number;
}
export interface Job {
  id: string;
  startedAt: number;
  readyAt: number;
  crop?: Crop;
  durationMs?: number;
  yield?: number;
}
export type RecipeId = 'gather-wood' | 'build-warehouse' | 'expand-warehouse' | 'merge-cold';
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
  kind: BuildingKind;
  x: number;
  z: number;
  rotation: 0 | 1 | 2 | 3;
  job?: Job;
  cropJobs?: (Job | null)[];
}
export type Stock = Record<Item, number>;
export interface Shipment {
  id: number;
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
  schemaVersion: 8;
  fusion: FusionState;
  mapSeed: number;
  tools: ToolState;
  toolRecoveryAvailable: Record<ToolId, boolean>;
  trees: Tree[];
  nextTreeId: number;
  groundStacks: GroundStack[];
  cropRecoveryAvailable: boolean;
  commerce: CommerceState;
  coins: number;
  inventory: Record<Item, number>;
  buildings: Building[];
  nextId: number;
  lastSeenAt: number;
  completedOrders: number;
}
export type Command =
  | { type: 'attachMaterial' | 'detachMaterial'; buildingId: string; item: Item; quantity: number }
  | { type: 'useTool'; tool: 'hammer'; buildingId: string }
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
  | { type: 'moveBuilding'; buildingId: string; x: number; z: number }
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
  | { type: 'dragMerge'; sourceId: string; targetId: string }
  | { type: 'sell'; orderId: Item }
  | { type: 'shopTrade'; buildingId: string; item: Item; quantity: number; side: 'buy' | 'sell' }
  | { type: 'orderFulfill'; buildingId: string; orderId: Item; offerId: number }
  | {
      type: 'dockTransfer';
      buildingId: string;
      item: Item;
      quantity: number;
      direction: 'stage' | 'return';
    }
  | { type: 'dockShip'; buildingId: string; shipmentId: number }
  | { type: 'dockCollect'; buildingId: string; shipmentId: number };
export type Result =
  | { ok: true; state: GameState; events: string[] }
  | { ok: false; state: GameState; error: string };
