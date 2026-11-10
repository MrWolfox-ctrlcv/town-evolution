import { assertSaveFits, SaveSizeError } from './save-limits';
import { validateTownPlacements } from './geometry';
import { cloneTerrain6 } from './v6-edit-types';
import { createV6Foundation } from './v6-foundation';
import { V7_GENERATOR_REVISION } from './v7-contracts';
import { V6_GENERATOR_REVISION } from './v6-world';
import { cloneCompostState } from './compost';
import { cloneLooseDrop } from './loose-drops';
import type { TerrainVersion } from './world';
import { mapSeedFromTime, populateIslandTrees } from './island';
import { populateNaturalResources } from './terrain';
import { createV5Foundation } from './v5-foundation';
import { V5_GENERATOR_REVISION } from './v5-world';
import { buildingOccupiedCells } from './building-cells';
import { emptyFusion, cloneFusion } from './fusion-state';
import { initialTools, initialToolRecovery } from './foundation';
import type { GameState, Building } from './types';
import { emptyCommerce, cloneCommerce, stockTotal } from './commerce';
import { CONFIG, MAX_VALUE } from './config';
import { requireRule, time, integer } from './guards';
export function clone(state: GameState): GameState {
  return {
    ...state,
    ...(state.terrain6 ? { terrain6: cloneTerrain6(state.terrain6) } : {}),
    fusion: cloneFusion(state.fusion),
    tools: { ...state.tools },
    toolRecoveryAvailable: { ...state.toolRecoveryAvailable },
    trees: state.trees.map((t) => ({ ...t })),
    naturalResources: state.naturalResources.map((p) => ({ ...p })),
    groundStacks: state.groundStacks.map((p) => ({ ...p })),
    looseDrops: state.looseDrops.map(cloneLooseDrop),
    landExtensions: state.landExtensions.map((p) => ({ ...p })),
    commerce: cloneCommerce(state.commerce),
    inventory: { ...state.inventory },
    buildings: state.buildings.map((b) => ({
      ...b,
      ...(b.bridge
        ? {
            bridge: {
              length: b.bridge.length,
              piers: b.bridge.piers.map((p) => ({ ...p })) as [
                (typeof b.bridge.piers)[0],
                (typeof b.bridge.piers)[1],
              ],
            },
          }
        : {}),
      ...(b.compost ? { compost: cloneCompostState(b.compost) } : {}),
      ...(b.collectionBox
        ? { collectionBox: { ...b.collectionBox, stock: { ...b.collectionBox.stock } } }
        : {}),
      ...(b.processingJob
        ? {
            processingJob: {
              ...b.processingJob,
              inputs: b.processingJob.inputs.map((v) => ({ ...v })),
              outputs: b.processingJob.outputs.map((v) => ({ ...v })),
            },
          }
        : {}),
      ...(b.job ? { job: { ...b.job } } : {}),
      ...(b.cropJobs ? { cropJobs: b.cropJobs.map((j) => (j ? { ...j } : null)) } : {}),
    })),
  };
}
export function createGame(
  now: number,
  seed = mapSeedFromTime(now),
  terrainVersion: TerrainVersion = 4,
): GameState {
  time(now);
  requireRule(integer(seed) && seed > 0, '地图种子无效');
  requireRule(
    terrainVersion === 1 ||
      terrainVersion === 2 ||
      terrainVersion === 3 ||
      terrainVersion === 4 ||
      terrainVersion === 5 ||
      terrainVersion === 6 ||
      terrainVersion === 7,
    '地图版本无效',
  );
  const state: GameState = {
    schemaVersion: 10,
    fusion: emptyFusion(),
    mapSeed: seed,
    terrainVersion,
    ...(terrainVersion === 5 ? { terrainRevision: V5_GENERATOR_REVISION } : {}),
    ...(terrainVersion === 6 || terrainVersion === 7
      ? {
          terrainRevision: terrainVersion === 7 ? V7_GENERATOR_REVISION : V6_GENERATOR_REVISION,
          terrain6: { format: 1 as const, nextOperation: 1, cells: [] },
        }
      : {}),
    landExtensions: [],
    tools: initialTools(),
    toolRecoveryAvailable: initialToolRecovery(),
    trees: [],
    naturalResources: [],
    nextTreeId: 1,
    groundStacks: [],
    looseDrops: [],
    cropRecoveryAvailable: true,
    commerce: emptyCommerce(),
    coins: 120,
    inventory: {
      rice: 0,
      sapling: 0,
      milledRice: 0,
      flour: 0,
      bread: 0,
      roastedCarrot: 0,
      vegetable: 1,
      wheat: 0,
      lettuce: 0,
      wood: 0,
      stone: 0,
      soil: 0,
      mud: 0,
      treeSeed: 0,
      chilledVegetable: 0,
    },
    nextId: 3,
    lastSeenAt: now,
    completedOrders: 0,
    buildings: [
      { id: 'b1', kind: 'warehouse', x: 3, z: 3, rotation: 0 },
      { id: 'b2', kind: 'farm', x: 6, z: 3, rotation: 0, cropJobs: Array(9).fill(null) },
    ],
  };
  if (terrainVersion === 5 || terrainVersion === 6 || terrainVersion === 7) {
    const blocked: { x: number; z: number }[] = [];
    for (const b of state.buildings)
      for (const p of buildingOccupiedCells(b))
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) blocked.push({ x: p.x + dx, z: p.z + dz });
    Object.assign(
      state,
      terrainVersion === 6 || terrainVersion === 7
        ? createV6Foundation(seed, blocked, 1, terrainVersion)
        : createV5Foundation(seed, blocked),
    );
  } else {
    populateNaturalResources(state);
    populateIslandTrees(state);
  }
  if (terrainVersion === 6 || terrainVersion === 7) validateTownPlacements(state);
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
  const lastSeenAt = Math.max(now, state.lastSeenAt);
  if (state.terrainVersion !== 6 && state.terrainVersion !== 7) return { ...state, lastSeenAt };
  if (lastSeenAt === state.lastSeenAt) return state;
  const next = { ...state, lastSeenAt };
  try {
    assertSaveFits(next);
  } catch (error) {
    // A clock-only digit increase must not turn a valid existing save into corrupt data.
    // Keep the original snapshot; the next real command checks its entire final result.
    if (error instanceof SaveSizeError) return state;
    throw error;
  }
  return next;
}
