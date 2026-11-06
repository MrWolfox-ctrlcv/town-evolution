import type { Building, GameState, Job } from './types';
import { requireRule } from './guards';
import { validatePlacement } from './geometry';
export function farmGridSize(b: Pick<Building, 'farmSize'>): 3 | 6 {
  return b.farmSize === 6 ? 6 : 3;
}
export function farmCellCount(b: Pick<Building, 'farmSize'>): number {
  return farmGridSize(b) ** 2;
}
export function farmLabel(b: Pick<Building, 'farmSize' | 'irrigated'>): string {
  return `${b.farmSize === 6 ? '大' : ''}${b.irrigated ? '水田' : '田地'}`;
}
export interface FarmMergePlan {
  building: Building;
  consumed: string[];
}
/** Three 2×2 fields form three quadrants of one 4×4 footprint. No remote field is consumed. */
export function farmMergePreview(s: GameState, sourceId: string, targetId: string): FarmMergePlan {
  const source = s.buildings.find((b) => b.id === sourceId);
  const target = s.buildings.find((b) => b.id === targetId);
  requireRule(
    source && target && source.id !== target.id && source.kind === 'farm' && target.kind === 'farm',
    '请选择不同的田地',
  );
  requireRule(!source.collectionBox && !target.collectionBox, '请先保留带箱田地，暂不能合成大田');
  requireRule(!source.farmSize && !target.farmSize, '大田不能继续合成');
  const candidates = s.buildings
    .filter(
      (b) =>
        b.kind === 'farm' &&
        !b.farmSize &&
        !b.collectionBox &&
        b.id !== sourceId &&
        b.id !== targetId,
    )
    .sort((a, b) => a.z - b.z || a.x - b.x || a.id.localeCompare(b.id));
  let lastError = '暂不可用';
  for (const third of candidates) {
    const farms = [target, source, third];
    const x = Math.min(...farms.map((b) => b.x));
    const z = Math.min(...farms.map((b) => b.z));
    if (!farms.every((b) => (b.x === x || b.x === x + 2) && (b.z === z || b.z === z + 2))) continue;
    if (new Set(farms.map((b) => `${b.x}:${b.z}`)).size !== 3) continue;
    if (!farms.every((b) => Boolean(b.irrigated) === Boolean(target.irrigated))) continue;
    const cropJobs: (Job | null)[] = Array(36).fill(null);
    for (const b of farms) {
      requireRule(!b.job && b.cropJobs?.length === 9, '田地作物状态无效');
      for (let cell = 0; cell < 9; cell++) {
        const col = cell % 3,
          row = Math.floor(cell / 3);
        const worldCol = [col, row, 2 - col, 2 - row][b.rotation]!;
        const worldRow = [row, 2 - col, 2 - row, col][b.rotation]!;
        const destination = (((b.z - z) / 2) * 3 + worldRow) * 6 + ((b.x - x) / 2) * 3 + worldCol;
        cropJobs[destination] = b.cropJobs[cell] ? { ...b.cropJobs[cell]! } : null;
      }
    }
    const building: Building = { ...target, x, z, rotation: 0, farmSize: 6, cropJobs };
    const consumed = [source.id, third.id];
    try {
      requireRule(
        !s.looseDrops.some(
          (d) => d.x6 >= x * 6 && d.x6 < (x + 4) * 6 && d.z6 >= z * 6 && d.z6 < (z + 4) * 6,
        ),
        '请先拾取合成区域的掉落物',
      );
      validatePlacement(
        { ...s, buildings: s.buildings.filter((b) => !consumed.includes(b.id)) },
        building,
      );
      return { building, consumed };
    } catch (error) {
      lastError = error instanceof Error ? error.message : '位置不可用';
    }
  }
  throw new Error(lastError);
}
