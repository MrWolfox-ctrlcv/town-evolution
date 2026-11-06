import { createCompostState, compostInputPlan } from './compost';
import { createLocalContainer } from './local-container';
import { cropDropAnchor, planLooseDrops } from './loose-drops';
import type { Building, BuildingKind, Crop, GameState, Item } from './types';
import { createGame } from './state';
import { CONFIG } from './config';
import { CROPS, cropSupportsField } from './crops';
import { emptyStock, initializeFacility, shippingReward } from './commerce';
import { isDockShore, isLandCell, populateIslandTrees } from './island';
import { touchesLand, blocksDockWater } from './expansion';
import { hasDockExit } from './merge-plan';
import { validatePlacement } from './geometry';
import { importSave } from './save';
export const DEMO_SEED = 42173;
/** A playable snapshot of supported content, never renderer-only props or legacy-only production. */
export function createDemoGame(now: number, seed = DEMO_SEED): GameState {
  const s = createGame(now, seed);
  s.trees = [];
  s.nextTreeId = 1;
  s.coins = 1000;
  s.tools.sickle = 90;
  s.tools.axe = 50;
  s.tools.saw = 50;
  s.buildings[0]!.kind = 'expandedWarehouse';
  const reservations = new Set<string>();
  function add(
    kind: BuildingKind,
    nearX: number,
    nearZ: number,
    extra: Pick<Building, 'farmSize' | 'irrigated' | 'dockStyle' | 'collectionBox'> = {},
  ): Building {
    const candidates: Building[] = [];
    for (let z = 0; z < CONFIG.gridSize; z++)
      for (let x = 0; x < CONFIG.gridSize; x++)
        for (const rotation of kind === 'dock' ? ([0, 1, 2, 3] as const) : ([0] as const))
          candidates.push({ id: `b${s.nextId}`, kind, x, z, rotation, ...extra });
    candidates.sort(
      (a, b) =>
        (a.x - nearX) ** 2 + (a.z - nearZ) ** 2 - ((b.x - nearX) ** 2 + (b.z - nearZ) ** 2) ||
        a.z - b.z ||
        a.x - b.x ||
        a.rotation - b.rotation,
    );
    for (const b of candidates) {
      if (
        kind === 'dock' &&
        !(b.dockStyle === 'simple'
          ? hasDockExit(s, b)
          : isDockShore(b, s.mapSeed, s.terrainVersion, s.landExtensions))
      )
        continue;
      try {
        validatePlacement(s, b);
      } catch {
        continue;
      }
      s.nextId++;
      if (kind === 'farm') b.cropJobs = Array(b.farmSize === 6 ? 36 : 9).fill(null);
      s.buildings.push(b);
      initializeFacility(s.commerce, b);
      return b;
    }
    throw new Error(`演示岛缺少${kind}可用位置`);
  }
  function reserve(kind: BuildingKind, x: number, z: number): Building {
    const b = add(kind, x, z);
    reservations.add(b.id);
    return b;
  }
  function pile(item: Item, amount: number, x: number, z: number, buildSpace = false): void {
    // Saw recipes retain their entire future footprint; other products need just one clear cell.
    const b = reserve(buildSpace ? 'warehouse' : 'crate', x, z);
    s.groundStacks.push({ x: b.x, z: b.z, item, amount });
  }
  function crops(b: Building, stages: readonly number[]): void {
    const kinds: Crop[] = b.irrigated ? ['rice'] : ['vegetable', 'wheat', 'lettuce'];
    for (let cell = 0; cell < stages.length; cell++) {
      const crop = kinds[cell % kinds.length]!;
      if (!cropSupportsField(crop, b.irrigated)) continue;
      const durationMs = CROPS[crop].durationMs;
      const startedAt = Math.max(0, now - Math.floor(durationMs * stages[cell]!));
      b.cropJobs![cell] = {
        id: `j${s.nextId++}`,
        crop,
        startedAt,
        readyAt: startedAt + durationMs,
        durationMs,
        yield: CROPS[crop].yield,
      };
    }
  }
  function trio(x: number, z: number, irrigated: boolean): void {
    // Reserve a legal 4×4 first, including the reward quadrant, before any trees are generated.
    const anchor = add('farm', x, z, { farmSize: 6 });
    s.buildings = s.buildings.filter((b) => b.id !== anchor.id);
    for (const [dx, dz] of [
      [0, 0],
      [2, 0],
      [0, 2],
    ] as const) {
      const b = add('farm', anchor.x + dx, anchor.z + dz, irrigated ? { irrigated: true } : {});
      if (!irrigated) crops(b, [1, 0.5, 0]);
    }
    reserve('warehouse', anchor.x + 2, anchor.z + 2);
  }
  add('shop', 10, 6);
  add('orderBoard', 9, 6);
  const dock = add('dock', 14, 18);
  add('warehouse', 5, 7);
  add('expandedWarehouse', 3, 9);
  add('house', 6, 12);
  add('house', 9, 12);
  add('house', 6, 15);
  add('crate', 8, 12);
  add('residence', 9, 15);
  pile('wood', 4, 7, 10, true);
  pile('wood', 2, 13, 10, true);
  pile('wood', 1, 16, 10, true);
  const farm = s.buildings.find((b) => b.id === 'b2')!;
  crops(farm, [1, 1, 1, 0, 0, 0]);
  const large = add('farm', 12, 5, { farmSize: 6 });
  crops(large, [1, 1, 1, 0.5, 0.5, 0.5, 0, 0, 0]);
  const largeWater = add('farm', 8, 20, { farmSize: 6, irrigated: true });
  crops(largeWater, [1, 1, 1, 0.5, 0.5, 0.5, 0, 0, 0]);
  trio(3, 17, false);
  trio(24, 7, true);
  // Nearby 5+4 soil and separate 1/9 mud support both conversions without setup grinding.
  pile('soil', 5, 6, 8);
  pile('soil', 4, 7, 8);
  pile('mud', 1, 7, 14);
  pile('mud', 9, 4, 12);
  pile('stone', 6, 9, 9);
  pile('treeSeed', 5, 5, 10);
  pile('vegetable', 10, 10, 3);
  pile('wheat', 10, 10, 4);
  pile('lettuce', 10, 10, 5);
  // The new workshop quarter is additive; the established starter practice spaces stay reserved.
  add('nursery', 18, 11);
  add('stoneMill', 19, 11);
  add('mill', 21, 11);
  add('stoneOven', 19, 14);
  add('bakery', 21, 14);
  add('handcart', 18, 16);
  add('transportWarehouse', 21, 17);
  add('woodenPier', 24, 19);
  add('boat', 26, 19);
  add('dock', 2, 7, { dockStyle: 'simple' });
  pile('rice', 10, 10, 6);
  pile('sapling', 2, 19, 9);
  pile('milledRice', 2, 20, 9);
  pile('flour', 2, 21, 9);
  pile('bread', 2, 22, 9);
  // Reserve one empty 2×2 practice plot for the digging tool and building relocation.
  reserve('warehouse', 5, 5);
  // A separate showcase never replaces starter fields or the reserved merge/digging lessons.
  const collectionBox = { crateId: `b${s.nextId++}`, ...createLocalContainer() };
  collectionBox.stock.vegetable = 2;
  collectionBox.stock.wheat = 2;
  const boxFarm = add('farm', 18, 20, { collectionBox });
  crops(boxFarm, [1, 0.5, 0]);
  // Two genuine, independently selectable drops support pickup and direct stacking practice.
  // Their completed jobs are historical identities; the visible cells stay empty and usable.
  for (const cell of [6, 8]) {
    const jobId = `j${s.nextId++}`;
    const plan = planLooseDrops(s, 'vegetable', 2, cropDropAnchor(boxFarm, cell), {
      type: 'crop',
      buildingId: boxFarm.id,
      cell,
      jobId,
    });
    s.looseDrops = plan.drops;
    s.nextId = plan.nextId;
  }

  // New templates show the next routes without replacing any established practice objects.
  const barrel = add('compostBarrel', 18, 18);
  barrel.compost = compostInputPlan(createCompostState(), 'treeSeed', 1, now);
  pile('roastedCarrot', 2, 22, 10);

  // Show an actual reclaimed tile, leaving other shore cells available for the nine-mud test.
  outer: for (let z = 1; z < CONFIG.gridSize - 1; z++)
    for (let x = 1; x < CONFIG.gridSize - 1; x++) {
      const p = { x, z };
      if (
        !isLandCell(x, z, s.mapSeed, s.terrainVersion) &&
        touchesLand(p, s.mapSeed, s.terrainVersion, []) &&
        !blocksDockWater(p, s.buildings)
      ) {
        s.landExtensions.push(p);
        break outer;
      }
    }
  // Fixture stock is explicit; planted crops, ground piles and shipments are already separate stock.
  s.inventory = {
    ...emptyStock(),
    rice: 4,
    sapling: 1,
    milledRice: 2,
    flour: 2,
    bread: 2,
    roastedCarrot: 2,
    vegetable: 8,
    wheat: 4,
    lettuce: 4,
    wood: 5,
    stone: 4,
    soil: 5,
    mud: 2,
    treeSeed: 2,
    chilledVegetable: 0,
  };
  s.commerce.dockCargo[dock.id] = { ...emptyStock(), vegetable: 2, wheat: 2 };
  const cargo = { ...emptyStock(), lettuce: 2 };
  const startedAt = Math.max(0, now - 30000);
  s.commerce.shipments[dock.id] = {
    id: 1,
    cargo,
    reward: shippingReward(cargo),
    startedAt,
    completeAt: startedAt + 30000,
  };
  s.commerce.shipmentId = 2;
  populateIslandTrees(s);
  s.buildings = s.buildings.filter((b) => !reservations.has(b.id));
  return importSave(JSON.stringify(s), now);
}
