import { importStock } from './stock-save';
import type { FarmCollectionBox } from './types';
import { parseLocalContainer } from './local-container-save';
import { ITEM_KEYS, isCrop } from './crops';
import { requireRule } from './guards';
/** The consumed crate identity stays reserved; saved contents are never inferred from town stock. */
export function parseFarmBox(
  value: unknown,
  acceptId: (id: unknown, prefix: string) => string,
  sourceVersion: 8 | 9 | 10 = 10,
): FarmCollectionBox {
  requireRule(value !== null && typeof value === 'object' && !Array.isArray(value), '田箱记录无效');
  const raw = value as Record<string, unknown>;
  requireRule(
    Object.keys(raw).length === 3 &&
      ['crateId', 'capacity', 'stock'].every((k) => Object.prototype.hasOwnProperty.call(raw, k)),
    '田箱结构无效',
  );
  const container = parseLocalContainer({
    capacity: raw.capacity,
    stock: sourceVersion === 10 ? raw.stock : importStock(raw.stock, sourceVersion),
  });
  requireRule(
    ITEM_KEYS.every((item) => isCrop(item) || container.stock[item] === 0),
    '田箱只能保存作物',
  );
  return { crateId: acceptId(raw.crateId, 'b'), ...container };
}
