import type { Building, CommerceState, Stock } from './types';
import { COMMERCE, emptyCommerce, stockTotal, shippingReward } from './commerce';
import { integer, requireRule } from './guards';
import { MAX_TIME } from './config';
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stock(value: unknown, capacity: number, legacy: boolean, oldMaterials: boolean): Stock {
  requireRule(
    record(value) && integer(value.vegetable) && integer(value.chilledVegetable),
    '交易库存无效',
  );
  const wheat = legacy ? 0 : value.wheat,
    lettuce = legacy ? 0 : value.lettuce;
  requireRule(integer(wheat) && integer(lettuce), '交易作物库存无效');
  const wood = oldMaterials ? 0 : value.wood,
    stone = oldMaterials ? 0 : value.stone;
  requireRule(integer(wood) && integer(stone), '建材库存无效');
  const result = {
    wood,
    stone,
    vegetable: value.vegetable,
    wheat,
    lettuce,
    chilledVegetable: value.chilledVegetable,
  };
  requireRule(stockTotal(result) <= capacity, '交易库存超过容量');
  return result;
}
export function importCommerce(
  raw: unknown,
  buildings: Building[],
  lastSeenAt: number,
  legacy = false,
  oldMaterials = false,
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
    const inventory = stock(raw.shopStock[id], COMMERCE.shopCapacity, legacy, oldMaterials);
    requireRule(
      inventory.vegetable <= 8 &&
        inventory.wheat <= 8 &&
        inventory.lettuce <= 8 &&
        inventory.chilledVegetable <= 4 &&
        inventory.wood === 0 &&
        inventory.stone === 0,
      '商店配额无效',
    );
    result.shopStock[id] = inventory;
  }
  for (const id of docks)
    result.dockCargo[id] = stock(raw.dockCargo[id], COMMERCE.dockCapacity, legacy, oldMaterials);
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
    requireRule(
      integer(shipment.startedAt, MAX_TIME) &&
        integer(shipment.completeAt, MAX_TIME) &&
        shipment.startedAt <= lastSeenAt &&
        shipment.completeAt - shipment.startedAt === COMMERCE.shippingDurationMs,
      '运输时间无效',
    );
    const cargo = stock(shipment.cargo, COMMERCE.dockCapacity, legacy, oldMaterials);
    requireRule(stockTotal(cargo) > 0, '运输货物为空');
    const reward = shippingReward(cargo);
    requireRule(shipment.reward === reward, '运输货款无效');
    result.shipments[id] = {
      id: shipment.id,
      cargo,
      reward,
      startedAt: shipment.startedAt,
      completeAt: shipment.completeAt,
    };
  }
  return result;
}
