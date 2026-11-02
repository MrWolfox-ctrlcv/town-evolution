import type { BuildingKind, Item } from './types';
interface Definition {
  label: string;
  width: number;
  depth: number;
  cost: number;
  capacity: number;
}
export const CONFIG: {
  gridSize: number;
  buildings: Record<BuildingKind, Definition>;
  cropDurationMs: number;
  cropYield: number;
  coldDurationMs: number;
  coldInput: number;
  expansionCost: number;
  combineCost: number;
} = {
  gridSize: 12,
  buildings: {
    farm: { label: '菜地', width: 2, depth: 2, cost: 20, capacity: 0 },
    warehouse: { label: '基础仓房', width: 2, depth: 2, cost: 50, capacity: 16 },
    expandedWarehouse: { label: '扩容仓库', width: 2, depth: 2, cost: 0, capacity: 32 },
    coldWarehouse: { label: '冷藏库', width: 2, depth: 2, cost: 0, capacity: 16 },
    cooler: { label: '制冷设施', width: 1, depth: 1, cost: 40, capacity: 0 },
  },
  cropDurationMs: 15_000,
  cropYield: 4,
  coldDurationMs: 10_000,
  coldInput: 2,
  expansionCost: 40,
  combineCost: 20,
};
export const MAX_VALUE = 1_000_000_000;
export const MAX_TIME = 8_000_000_000_000_000;
export const ORDERS: Record<Item, { amount: number; reward: number }> = {
  vegetable: { amount: 4, reward: 24 },
  chilledVegetable: { amount: 2, reward: 24 },
};
