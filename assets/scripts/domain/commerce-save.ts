import type { Building, CommerceState, Stock } from './types';
import {
  COMMERCE,
  emptyCommerce,
  stockTotal,
  shippingReward,
  LEGACY_SHIPPING_DURATION_MS,
  legacyShippingPrices,
} from './commerce';
import { integer, requireRule } from './guards';
import { importStock } from './stock-save';
import { MAX_CROP_DURATION, ITEM_KEYS } from './crops';
import { MAX_TIME } from './config';
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stock(
  value: unknown,
  capacity: number,
  legacy: boolean,
  oldMaterials: boolean,
  sourceVersion: 8 | 9 | 10,
): Stock {
  const optional = [
    ...(legacy ? (['wheat', 'lettuce'] as const) : []),
    ...(oldMaterials ? (['wood', 'stone'] as const) : []),
  ];
  const result = importStock(value, sourceVersion, optional);
  requireRule(
    result.treeSeed === 0 && result.mud === 0 && result.sapling === 0,
    '树种、树苗和泥土暂不能用于交易',
  );
  requireRule(stockTotal(result) <= capacity, '交易库存超过容量');
  return result;
}
export function importCommerce(
  raw: unknown,
  buildings: Building[],
  lastSeenAt: number,
  legacy = false,
  oldMaterials = false,
  sourceVersion: 8 | 9 | 10 = 10,
): CommerceState {
  requireRule(
    record(raw) &&
      integer(raw.offerId) &&
      raw.offerId > 0 &&
      integer(raw.shipmentId) &&
      raw.shipmentId > 0,
    '交易编号无效',
  );
  requireRule(
    record(raw.shopStock) && record(raw.dockCargo) && record(raw.shipments),
    '交易记录无效',
  );
  const result = emptyCommerce();
  result.offerId = raw.offerId;
  result.shipmentId = raw.shipmentId;
  const shops = buildings.filter((b) => b.kind === 'shop').map((b) => b.id);
  const docks = buildings.filter((b) => b.kind === 'dock').map((b) => b.id);
  requireRule(
    Object.keys(raw.shopStock).length === shops.length &&
      Object.keys(raw.dockCargo).length === docks.length,
    '交易设施记录不完整',
  );
  for (const id of shops) {
    const inventory = stock(
      raw.shopStock[id],
      COMMERCE.shopCapacity,
      legacy,
      oldMaterials,
      sourceVersion,
    );
    requireRule(
      inventory.vegetable <= 8 &&
        inventory.wheat <= 8 &&
        inventory.lettuce <= 8 &&
        inventory.chilledVegetable <= 4 &&
        inventory.rice <= 8 &&
        inventory.milledRice === 0 &&
        inventory.flour === 0 &&
        inventory.bread === 0 &&
        inventory.roastedCarrot === 0 &&
        inventory.wood === 0 &&
        inventory.stone === 0 &&
        inventory.soil === 0,
      '商店配额无效',
    );
    result.shopStock[id] = inventory;
  }
  for (const id of docks)
    result.dockCargo[id] = stock(
      raw.dockCargo[id],
      COMMERCE.dockCapacity,
      legacy,
      oldMaterials,
      sourceVersion,
    );
  const shipmentIds = new Set<number>();
  for (const [id, shipment] of Object.entries(raw.shipments)) {
    requireRule(docks.includes(id) && record(shipment), '运输设施不存在');
    requireRule(
      integer(shipment.id) &&
        shipment.id > 0 &&
        shipment.id < result.shipmentId &&
        !shipmentIds.has(shipment.id),
      '运输编号无效',
    );
    shipmentIds.add(shipment.id);
    const snapshot = shipment.durationMs !== undefined || shipment.unitPrices !== undefined;
    const durationMs = snapshot ? shipment.durationMs : LEGACY_SHIPPING_DURATION_MS;
    requireRule(integer(durationMs, MAX_CROP_DURATION) && durationMs > 0, '运输时长无效');
    const unitPrices = snapshot ? importStock(shipment.unitPrices, sourceVersion) : undefined;
    requireRule(
      integer(shipment.startedAt, MAX_TIME) &&
        integer(shipment.completeAt, MAX_TIME) &&
        shipment.startedAt <= lastSeenAt &&
        shipment.completeAt - shipment.startedAt === durationMs,
      '运输时间无效',
    );
    const cargo = stock(shipment.cargo, COMMERCE.dockCapacity, legacy, oldMaterials, sourceVersion);
    requireRule(stockTotal(cargo) > 0, '运输货物为空');
    if (unitPrices)
      requireRule(
        ITEM_KEYS.every((item) => cargo[item] === 0 || unitPrices[item] > 0),
        '运输价格无效',
      );
    const reward = shippingReward(cargo, unitPrices ?? legacyShippingPrices());
    requireRule(integer(reward) && reward > 0 && shipment.reward === reward, '运输货款无效');
    result.shipments[id] = {
      id: shipment.id,
      ...(unitPrices ? { durationMs, unitPrices } : {}),
      cargo,
      reward,
      startedAt: shipment.startedAt,
      completeAt: shipment.completeAt,
    };
  }
  return result;
}
