import { ITEM_KEYS } from './crops';
import type { Item, Stock } from './types';
import { integer, requireRule } from './guards';

export const V9_ITEMS: readonly Item[] = ['rice', 'sapling', 'milledRice', 'flour', 'bread'];
const V8_ADDITIONS: readonly Item[] = ['soil', 'mud', 'treeSeed'];
/** New saves are complete. Only an identified older schema receives additive defaults. */
export function importStock(
  raw: unknown,
  sourceVersion: 8 | 9 | 10,
  optional: readonly Item[] = [],
): Stock {
  requireRule(raw !== null && typeof raw === 'object' && !Array.isArray(raw), '库存结构无效');
  const prototype: unknown = Object.getPrototypeOf(raw);
  requireRule(prototype === Object.prototype || prototype === null, '库存结构无效');
  requireRule(
    Reflect.ownKeys(raw).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      return typeof key === 'string' && descriptor && 'value' in descriptor;
    }),
    '库存包含无效字段',
  );
  const value = raw as Record<string, unknown>;
  requireRule(
    Object.keys(value).every((key) => ITEM_KEYS.includes(key as Item)),
    '未知库存产品',
  );
  const result = {} as Stock;
  for (const item of ITEM_KEYS) {
    const mayDefault =
      optional.includes(item) ||
      (sourceVersion < 10 && item === 'roastedCarrot') ||
      (sourceVersion === 8 && (V9_ITEMS.includes(item) || V8_ADDITIONS.includes(item)));
    const amount = value[item] === undefined && mayDefault ? 0 : value[item];
    requireRule(integer(amount), '产品库存无效');
    result[item] = amount;
  }
  return result;
}
