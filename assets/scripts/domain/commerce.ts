import { ITEM_KEYS, CROPS } from './crops';
import type { GameState, Building, CommerceState, Stock } from './types';
export const COMMERCE = {
  shopCapacity: 28,
  dockCapacity: 16,
  shippingDurationMs: 30_000,
  prices: {
    wood: { buy: 8, sell: 4, ship: 4 },
    stone: { buy: 8, sell: 4, ship: 4 },
    vegetable: {
      get buy() {
        return CROPS.vegetable.buy;
      },
      sell: 5,
      ship: 6,
    },
    wheat: {
      get buy() {
        return CROPS.wheat.buy;
      },
      sell: 5,
      ship: 6,
    },
    lettuce: {
      get buy() {
        return CROPS.lettuce.buy;
      },
      sell: 5,
      ship: 6,
    },
    chilledVegetable: { buy: 16, sell: 10, ship: 12 },
  },
  orders: {
    vegetable: { amount: 8, reward: 56 },
    wheat: { amount: 8, reward: 56 },
    lettuce: { amount: 8, reward: 56 },
    chilledVegetable: { amount: 4, reward: 56 },
  },
};
export function emptyStock(): Stock {
  return { vegetable: 0, wheat: 0, lettuce: 0, wood: 0, stone: 0, chilledVegetable: 0 };
}
export function stockTotal(stock: Stock): number {
  return ITEM_KEYS.reduce((sum, item) => sum + stock[item], 0);
}
export function emptyCommerce(): CommerceState {
  return { offerId: 1, shipmentId: 1, shopStock: {}, dockCargo: {}, shipments: {} };
}
export function cloneCommerce(c: CommerceState): CommerceState {
  return {
    ...c,
    shopStock: Object.fromEntries(Object.entries(c.shopStock).map(([id, s]) => [id, { ...s }])),
    dockCargo: Object.fromEntries(Object.entries(c.dockCargo).map(([id, s]) => [id, { ...s }])),
    shipments: Object.fromEntries(
      Object.entries(c.shipments).map(([id, s]) => [id, { ...s, cargo: { ...s.cargo } }]),
    ),
  };
}
export function initializeFacility(c: CommerceState, b: Building): void {
  if (b.kind === 'shop')
    c.shopStock[b.id] = {
      vegetable: 8,
      wheat: 8,
      lettuce: 8,
      wood: 0,
      stone: 0,
      chilledVegetable: 0,
    };
  if (b.kind === 'dock') c.dockCargo[b.id] = emptyStock();
}

export function hasTradeFacility(s: GameState): boolean {
  return s.buildings.some((b) => ['shop', 'orderBoard', 'dock'].includes(b.kind));
}

export function shippingReward(stock: Stock): number {
  return ITEM_KEYS.reduce((sum, item) => sum + stock[item] * COMMERCE.prices[item].ship, 0);
}
