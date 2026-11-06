import { createGame } from './state';
import { bridgeSpanCells, validateBridgeTerrain } from './bridge-terrain';
import { bridgeCrossingPlan } from './bridge-crossing';
import { importSave } from './save';
import type { GameState } from './types';
export const BRIDGE_DEMO_SEED = 1;
/** New, isolated teaching fixture only. No existing profile or world generator is changed. */
export function createBridgeDemo(now: number): GameState {
  const state = createGame(now, BRIDGE_DEMO_SEED, 5),
    span = { x: 133, z: 135, rotation: 1 as const, length: 15 },
    cells = bridgeSpanCells(span),
    corridor = new Set(cells.map((p) => `${p.x},${p.z}`));
  validateBridgeTerrain(state, span);
  // The fixture starts after this narrow construction corridor has been cleared.
  // Every riverbed/shore sample stays generated; all other resources and trees are unchanged.
  state.trees = state.trees.filter((p) => !corridor.has(`${p.x},${p.z}`));
  state.naturalResources = state.naturalResources.filter((p) => !corridor.has(`${p.x},${p.z}`));
  const near = {
      id: `b${state.nextId++}`,
      kind: 'woodenPier' as const,
      x: 133,
      z: 135,
      rotation: 0 as const,
    },
    far = {
      id: `b${state.nextId++}`,
      kind: 'woodenPier' as const,
      x: 146,
      z: 135,
      rotation: 0 as const,
    };
  state.buildings.push(near, far);
  bridgeCrossingPlan(state, [near, far]);
  return importSave(JSON.stringify(state), now);
}
