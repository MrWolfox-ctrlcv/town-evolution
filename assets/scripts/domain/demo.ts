import type { Building, BuildingKind, Crop, GameState, Item } from './types';
import { createGame } from './state';
import { CONFIG } from './config';
import { emptyStock, initializeFacility, shippingReward } from './commerce';
import { isDockShore, populateIslandTrees } from './island';
import { validatePlacement } from './geometry';
import { importSave } from './save';
export const DEMO_SEED = 42173;
/** A source-controlled, playable fixture. No renderer-only props pretend to be usable features. */
export function createDemoGame(now: number): GameState {
  const s = createGame(now, DEMO_SEED);
  s.trees = [];
  s.nextTreeId = 1;
  s.coins = 1000;
  s.tools.sickle = 90;
  s.tools.axe = 50;
  s.tools.saw = 50;
  s.buildings[0]!.kind = 'expandedWarehouse';
  function add(kind: BuildingKind, nearX: number, nearZ: number): Building {
    const candidates: Building[] = [];
    for (let z = 0; z < CONFIG.gridSize; z++)
      for (let x = 0; x < CONFIG.gridSize; x++)
        candidates.push({ id: `b${s.nextId}`, kind, x, z, rotation: 0 });
    candidates.sort(
      (a, b) =>
        (a.x - nearX) ** 2 + (a.z - nearZ) ** 2 - ((b.x - nearX) ** 2 + (b.z - nearZ) ** 2) ||
        a.z - b.z ||
        a.x - b.x,
    );
    for (const b of candidates) {
      if (kind === 'dock' && !isDockShore(b, s.mapSeed)) continue;
      try {
        validatePlacement(s, b);
      } catch {
        continue;
      }
      s.nextId++;
      if (kind === 'farm') b.cropJobs = Array(9).fill(null);
      s.buildings.push(b);
      initializeFacility(s.commerce, b);
      return b;
    }
    throw new Error(`演示岛缺少${kind}可用位置`);
  }
  add('shop', 10, 6);
  add('orderBoard', 9, 6);
  const dock = add('dock', 14, 18);
  add('farm', 10, 10);
  add('warehouse', 5, 7);
  s.inventory = { vegetable: 12, wheat: 8, lettuce: 8, wood: 12, stone: 4, chilledVegetable: 0 };
  const blueprints: string[] = [];
  function pile(item: Item, amount: number, x: number, z: number): void {
    // A temporary footprint reserves nearby build space for the two real saw recipes.
    const reserve = add('warehouse', x, z);
    blueprints.push(reserve.id);
    s.groundStacks.push({ x: reserve.x, z: reserve.z, item, amount });
    s.inventory[item] -= amount;
  }
  pile('wood', 3, 7, 10);
  pile('wood', 5, 13, 10);
  const farm = s.buildings.find((b) => b.id === 'b2')!;
  const crops: Crop[] = ['vegetable', 'wheat', 'lettuce'];
  for (let cell = 0; cell < 6; cell++) {
    const crop = crops[cell % 3]!;
    const startedAt = cell < 3 ? Math.max(0, now - CONFIG.cropDurationMs) : now;
    farm.cropJobs![cell] = {
      id: `j${s.nextId++}`,
      crop,
      startedAt,
      readyAt: startedAt + CONFIG.cropDurationMs,
    };
    s.inventory[crop]--;
  }
  s.commerce.dockCargo[dock.id] = { ...emptyStock(), vegetable: 2, wheat: 2 };
  s.inventory.vegetable -= 2;
  s.inventory.wheat -= 2;
  const cargo = { ...emptyStock(), lettuce: 2 };
  s.inventory.lettuce -= 2;
  const startedAt = Math.max(0, now - 30000);
  s.commerce.shipments[dock.id] = {
    id: 1,
    cargo,
    reward: shippingReward(cargo),
    startedAt,
    completeAt: startedAt + 30000,
  };
  s.commerce.shipmentId = 2;
  populateIslandTrees(s, 18);
  s.buildings = s.buildings.filter((b) => !blueprints.includes(b.id));
  return importSave(JSON.stringify(s), now);
}
