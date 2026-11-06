import { ITEM_KEYS, CROPS, isCrop } from './crops';
import type { GameState, Building, CommerceState, Stock, Item, Crop } from './types';
export type TradableItem = Exclude<Item, 'treeSeed' | 'mud' | 'sapling'>;
export function isTradableItem(item: Item): item is TradableItem {
  return item !== 'treeSeed' && item !== 'mud' && item !== 'sapling' && ITEM_KEYS.includes(item);
}
export const TRADE_ITEMS = ITEM_KEYS.filter(isTradableItem);
/** Loose agricultural goods can move directly to a market or dock; construction materials cannot. */
export type GroundTradeItem = Crop | 'milledRice' | 'flour' | 'bread' | 'roastedCarrot';
export function isGroundTradeItem(item: Item): item is GroundTradeItem {
  return (
    isCrop(item) ||
    item === 'milledRice' ||
    item === 'flour' ||
    item === 'bread' ||
    item === 'roastedCarrot'
  );
}
export const COMMERCE = {
  shopCapacity: 28,
  dockCapacity: 16,
  shippingDurationMs: 30_000,
  // Temporary first-play prices; existing goods and active shipping contracts are unchanged.
  prices: {
    rice: {
      get buy() {
        return CROPS.rice.buy;
      },
      sell: 5,
      ship: 6,
    },
    milledRice: { buy: 16, sell: 11, ship: 13 },
    flour: { buy: 16, sell: 11, ship: 13 },
    bread: { buy: 24, sell: 18, ship: 20 },
    roastedCarrot: { buy: 16, sell: 11, ship: 13 },
    wood: { buy: 8, sell: 4, ship: 4 },
    stone: { buy: 8, sell: 4, ship: 4 },
    soil: { buy: 4, sell: 2, ship: 2 },
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
    rice: { amount: 8, reward: 56 },
    milledRice: { amount: 4, reward: 56 },
    flour: { amount: 4, reward: 56 },
    bread: { amount: 4, reward: 88 },
    roastedCarrot: { amount: 4, reward: 56 },
    vegetable: { amount: 8, reward: 56 },
    wheat: { amount: 8, reward: 56 },
    lettuce: { amount: 8, reward: 56 },
    chilledVegetable: { amount: 4, reward: 56 },
  },
};
export function emptyStock(): Stock {
  return Object.fromEntries(ITEM_KEYS.map((item) => [item, 0])) as Stock;
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
      Object.entries(c.shipments).map(([id, s]) => [
        id,
        {
          ...s,
          cargo: { ...s.cargo },
          ...(s.unitPrices ? { unitPrices: { ...s.unitPrices } } : {}),
        },
      ]),
    ),
  };
}
export function initializeFacility(c: CommerceState, b: Building): void {
  if (b.kind === 'shop')
    c.shopStock[b.id] = { ...emptyStock(), vegetable: 8, wheat: 8, lettuce: 8 };
  if (b.kind === 'dock') c.dockCargo[b.id] = emptyStock();
}

export function hasTradeFacility(s: GameState): boolean {
  return s.buildings.some((b) => ['shop', 'orderBoard', 'dock'].includes(b.kind));
}

export function shippingReward(stock: Stock, unitPrices?: Stock): number {
  return TRADE_ITEMS.reduce(
    (sum, item) => sum + stock[item] * (unitPrices ? unitPrices[item] : COMMERCE.prices[item].ship),
    0,
  );
}
export function shippingPriceSnapshot(): Stock {
  const prices = emptyStock();
  for (const item of TRADE_ITEMS) prices[item] = COMMERCE.prices[item].ship;
  return prices;
}

/** Retired v8 voyages keep fixed original terms even when current balance changes. */
export const LEGACY_SHIPPING_DURATION_MS = 30_000;
export function legacyShippingPrices(): Stock {
  return {
    ...emptyStock(),
    wood: 4,
    stone: 4,
    soil: 2,
    vegetable: 6,
    wheat: 6,
    lettuce: 6,
    chilledVegetable: 12,
  };
}
