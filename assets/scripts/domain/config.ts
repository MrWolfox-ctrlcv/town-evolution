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
  gridSize: 192,
  buildings: {
    woodenBridge: { label: '木桥', width: 2, depth: 8, cost: 0, capacity: 0 },
    compostBarrel: { label: '堆肥木桶', width: 1, depth: 1, cost: 0, capacity: 0 },
    nursery: { label: '育苗箱', width: 1, depth: 1, cost: 0, capacity: 0 },
    stoneMill: { label: '石磨', width: 1, depth: 1, cost: 0, capacity: 0 },
    mill: { label: '磨坊', width: 2, depth: 2, cost: 0, capacity: 0 },
    stoneOven: { label: '石窑', width: 1, depth: 1, cost: 0, capacity: 0 },
    bakery: { label: '烘焙坊', width: 2, depth: 2, cost: 0, capacity: 0 },
    handcart: { label: '手推车', width: 1, depth: 1, cost: 0, capacity: 0 },
    transportWarehouse: { label: '运输仓', width: 2, depth: 2, cost: 0, capacity: 16 },
    woodenPier: { label: '木栈桥', width: 2, depth: 2, cost: 0, capacity: 0 },
    boat: { label: '木船', width: 1, depth: 2, cost: 0, capacity: 0 },
    fence: { label: '围栏', width: 1, depth: 1, cost: 0, capacity: 0 },
    bench: { label: '长凳', width: 1, depth: 1, cost: 0, capacity: 0 },
    crate: { label: '箱子', width: 1, depth: 1, cost: 0, capacity: 0 },
    house: { label: '基础房屋', width: 2, depth: 2, cost: 0, capacity: 0 },
    residence: { label: '住宅', width: 2, depth: 2, cost: 0, capacity: 0 },
    farm: { label: '菜地', width: 2, depth: 2, cost: 20, capacity: 0 },
    warehouse: { label: '基础仓房', width: 2, depth: 2, cost: 50, capacity: 16 },
    expandedWarehouse: { label: '扩容仓库', width: 2, depth: 2, cost: 0, capacity: 32 },
    coldWarehouse: { label: '冷藏库', width: 2, depth: 2, cost: 0, capacity: 16 },
    shop: { label: '商店', width: 2, depth: 2, cost: 30, capacity: 0 },
    orderBoard: { label: '订单板', width: 1, depth: 1, cost: 0, capacity: 0 },
    dock: { label: '船坞', width: 2, depth: 2, cost: 50, capacity: 0 },
    cooler: { label: '制冷设施', width: 1, depth: 1, cost: 40, capacity: 0 },
  },
  cropDurationMs: 15_000,
  cropYield: 2,
  coldDurationMs: 10_000,
  coldInput: 2,
  expansionCost: 40,
  combineCost: 20,
};
export const MAX_VALUE = 1_000_000_000;
export const MAX_TIME = 8_000_000_000_000_000;
export const ORDERS: Partial<Record<Item, { amount: number; reward: number }>> = {
  vegetable: { amount: 4, reward: 24 },
  wheat: { amount: 4, reward: 24 },
  lettuce: { amount: 4, reward: 24 },
  chilledVegetable: { amount: 2, reward: 24 },
};
