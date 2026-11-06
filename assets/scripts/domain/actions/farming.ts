import type { Command, GameState, Building } from '../types';
import { farmCellCount, farmLabel, farmMergePreview } from '../farming';
import { cropSupportsField } from '../crops';
import { useDurability } from '../foundation';
import { mergeAttachments } from '../fusion-state';
import { validatePlacement, preserveTradeTile } from '../geometry';
import { requireRule } from '../guards';
import { find, nextId } from '../state';
export function digFarm(s: GameState, c: Extract<Command, { tool: 'diggingTool' }>): string[] {
  const farm: Building = {
    id: nextId(s, 'b'),
    kind: 'farm',
    x: c.x,
    z: c.z,
    rotation: 0,
    cropJobs: Array(9).fill(null),
  };
  validatePlacement(s, farm);
  useDurability(s, 'diggingTool');
  s.buildings.push(farm);
  preserveTradeTile(s);
  return ['已开垦田地'];
}
export function irrigateFarm(s: GameState, buildingId: string): string[] {
  const farm = find(s, buildingId);
  requireRule(farm.kind === 'farm' && farm.cropJobs?.length === farmCellCount(farm), '暂不可用');
  requireRule(!farm.irrigated, '此田已经灌水');
  requireRule(
    farm.cropJobs.every((job) => !job || cropSupportsField(job.crop ?? 'vegetable', true)),
    '请先收获田里的旱作物，再灌成水田',
  );
  useDurability(s, 'wateringCan');
  farm.irrigated = true;
  return [`已灌成${farmLabel(farm)}`];
}
export function mergeFarms(s: GameState, sourceId: string, targetId: string): string[] {
  const plan = farmMergePreview(s, sourceId, targetId);
  for (const id of plan.consumed) mergeAttachments(s, targetId, id);
  s.buildings = s.buildings.filter((b) => !plan.consumed.includes(b.id));
  Object.assign(find(s, targetId), plan.building);
  preserveTradeTile(s);
  return [`合成完成：${farmLabel(plan.building)}，增加9个空种植格`];
}
