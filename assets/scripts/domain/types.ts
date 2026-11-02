export type BuildingKind = 'farm' | 'warehouse' | 'expandedWarehouse' | 'coldWarehouse' | 'cooler';
export type Item = 'vegetable' | 'chilledVegetable';
export interface Job {
  id: string;
  startedAt: number;
  readyAt: number;
}
export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  z: number;
  rotation: 0 | 1;
  job?: Job;
}
export interface GameState {
  schemaVersion: 1;
  coins: number;
  inventory: Record<Item, number>;
  buildings: Building[];
  nextId: number;
  lastSeenAt: number;
  completedOrders: number;
}
export type Command =
  | { type: 'place'; kind: 'farm' | 'warehouse' | 'cooler'; x: number; z: number; rotation?: 0 | 1 }
  | { type: 'start'; buildingId: string }
  | { type: 'collect'; buildingId: string }
  | { type: 'upgrade'; buildingId: string; target: 'expandedWarehouse' }
  | { type: 'combine'; warehouseId: string; coolerId: string }
  | { type: 'sell'; orderId: Item };
export type Result =
  | { ok: true; state: GameState; events: string[] }
  | { ok: false; state: GameState; error: string };
