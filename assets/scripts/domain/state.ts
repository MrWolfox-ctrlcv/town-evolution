import type { GameState, Building } from './types';
import { CONFIG, MAX_VALUE } from './config';
import { requireRule, time } from './guards';
export function clone(state: GameState): GameState {
  return {
    ...state,
    inventory: { ...state.inventory },
    buildings: state.buildings.map((b) => (b.job ? { ...b, job: { ...b.job } } : { ...b })),
  };
}
export function createGame(now: number): GameState {
  time(now);
  return {
    schemaVersion: 1,
    coins: 120,
    inventory: { vegetable: 0, chilledVegetable: 0 },
    nextId: 3,
    lastSeenAt: now,
    completedOrders: 0,
    buildings: [
      { id: 'b1', kind: 'warehouse', x: 3, z: 3, rotation: 0 },
      { id: 'b2', kind: 'farm', x: 6, z: 3, rotation: 0 },
    ],
  };
}
export function getCapacity(state: GameState): number {
  return state.buildings.reduce((sum, b) => sum + CONFIG.buildings[b.kind].capacity, 0);
}
export function getUsedStorage(state: GameState): number {
  return state.inventory.vegetable + state.inventory.chilledVegetable;
}
export function find(state: GameState, id: string): Building {
  const b = state.buildings.find((item) => item.id === id);
  requireRule(b, '找不到建筑');
  return b;
}
export function spend(state: GameState, cost: number): void {
  requireRule(state.coins >= cost, '金币不足');
  state.coins -= cost;
}
export function nextId(state: GameState, prefix: string): string {
  requireRule(state.nextId < MAX_VALUE, '编号达到上限');
  return `${prefix}${state.nextId++}`;
}
export function advance(state: GameState, now: number): GameState {
  time(now);
  return { ...state, lastSeenAt: Math.max(now, state.lastSeenAt) };
}
