import { mapSeedFromTime, populateIslandTrees } from './island';
import { emptyFusion, cloneFusion } from './fusion-state';
import { initialTools, initialToolRecovery } from './foundation';
import type { GameState, Building } from './types';
import { emptyCommerce, cloneCommerce, stockTotal } from './commerce';
import { CONFIG, MAX_VALUE } from './config';
import { requireRule, time, integer } from './guards';
export function clone(state: GameState): GameState {
  return {
    ...state,
    fusion: cloneFusion(state.fusion),
    tools: { ...state.tools },
    toolRecoveryAvailable: { ...state.toolRecoveryAvailable },
    trees: state.trees.map((t) => ({ ...t })),
    groundStacks: state.groundStacks.map((p) => ({ ...p })),
    commerce: cloneCommerce(state.commerce),
    inventory: { ...state.inventory },
    buildings: state.buildings.map((b) => ({
      ...b,
      ...(b.job ? { job: { ...b.job } } : {}),
      ...(b.cropJobs ? { cropJobs: b.cropJobs.map((j) => (j ? { ...j } : null)) } : {}),
    })),
  };
}
export function createGame(now: number, seed = mapSeedFromTime(now)): GameState {
  time(now);
  requireRule(integer(seed) && seed > 0, '地图种子无效');
  const state: GameState = {
    schemaVersion: 8,
    fusion: emptyFusion(),
    mapSeed: seed,
    tools: initialTools(),
    toolRecoveryAvailable: initialToolRecovery(),
    trees: [],
    nextTreeId: 1,
    groundStacks: [],
    cropRecoveryAvailable: true,
    commerce: emptyCommerce(),
    coins: 120,
    inventory: { vegetable: 1, wheat: 0, lettuce: 0, wood: 0, stone: 0, chilledVegetable: 0 },
    nextId: 3,
    lastSeenAt: now,
    completedOrders: 0,
    buildings: [
      { id: 'b1', kind: 'warehouse', x: 3, z: 3, rotation: 0 },
      { id: 'b2', kind: 'farm', x: 6, z: 3, rotation: 0, cropJobs: Array(9).fill(null) },
    ],
  };
  populateIslandTrees(state);
  return state;
}
export function getCapacity(state: GameState): number {
  return state.buildings.reduce((sum, b) => sum + CONFIG.buildings[b.kind].capacity, 0);
}
export function getUsedStorage(state: GameState): number {
  return stockTotal(state.inventory);
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
