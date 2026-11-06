export type { LocalContainer } from './types';
import { ITEM_KEYS } from './crops';
import { integer, requireRule } from './guards';
import type { Item, Stock, LocalContainer } from './types';

export const LOCAL_CONTAINER = { farmCapacity: 16 };

function exactRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Record<string, unknown> {
  requireRule(value !== null && typeof value === 'object' && !Array.isArray(value), message);
  const prototype: unknown = Object.getPrototypeOf(value);
  requireRule(prototype === Object.prototype || prototype === null, message);
  const ownKeys = Reflect.ownKeys(value);
  requireRule(
    ownKeys.length === keys.length &&
      ownKeys.every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return typeof key === 'string' && keys.includes(key) && descriptor && 'value' in descriptor;
      }),
    message,
  );
  return value as Record<string, unknown>;
}

/** Shared runtime guard for commands and saves; no partial or inherited stock is accepted. */
export function validateLocalContainer(value: unknown): asserts value is LocalContainer {
  const container = exactRecord(value, ['capacity', 'stock'], '本地容器结构无效');
  requireRule(integer(container.capacity) && container.capacity > 0, '本地容器容量无效');
  const stock = exactRecord(container.stock, ITEM_KEYS, '本地容器库存结构无效');
  let total = 0;
  for (const item of ITEM_KEYS) {
    const amount = stock[item];
    requireRule(integer(amount), '本地容器库存数量无效');
    requireRule(amount <= container.capacity - total, '本地容器库存超出容量');
    total += amount;
  }
}

export function cloneLocalContainer(container: LocalContainer): LocalContainer {
  validateLocalContainer(container);
  return {
    capacity: container.capacity,
    stock: Object.fromEntries(ITEM_KEYS.map((item) => [item, container.stock[item]])) as Stock,
  };
}

/** A container has no connection to town inventory or warehouse capacity. */
export function createLocalContainer(capacity = LOCAL_CONTAINER.farmCapacity): LocalContainer {
  const container = {
    capacity,
    stock: Object.fromEntries(ITEM_KEYS.map((item) => [item, 0])) as Stock,
  };
  validateLocalContainer(container);
  return container;
}

export function localContainerTotal(container: LocalContainer): number {
  validateLocalContainer(container);
  return ITEM_KEYS.reduce((total, item) => total + container.stock[item], 0);
}

export function localContainerFreeSpace(container: LocalContainer): number {
  const total = localContainerTotal(container);
  return container.capacity - total;
}

function validateTransfer(item: Item, amount: number): void {
  requireRule(ITEM_KEYS.includes(item), '本地容器产品无效');
  requireRule(integer(amount) && amount > 0, '本地容器转移数量无效');
}

/** Full success or an error. Callers commit their source deduction only after success. */
export function depositLocalContainer(
  container: LocalContainer,
  item: Item,
  amount: number,
): LocalContainer {
  validateTransfer(item, amount);
  const free = localContainerFreeSpace(container);
  requireRule(amount <= free, '本地容器空间不足');
  const next = cloneLocalContainer(container);
  next.stock[item] += amount;
  return next;
}

/** Full success or an error. The input container is never changed. */
export function withdrawLocalContainer(
  container: LocalContainer,
  item: Item,
  amount: number,
): LocalContainer {
  validateTransfer(item, amount);
  validateLocalContainer(container);
  requireRule(container.stock[item] >= amount, '本地容器产品不足');
  const next = cloneLocalContainer(container);
  next.stock[item] -= amount;
  return next;
}
