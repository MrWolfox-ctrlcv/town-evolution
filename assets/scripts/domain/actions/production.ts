import type { GameState, Command, Item, Job } from '../types';
import { useDurability } from '../foundation';
import { CROPS, isCrop, cropJobYield, MAX_CROP_DURATION, MAX_CROP_YIELD } from '../crops';
import { CONFIG, MAX_TIME } from '../config';
import { requireRule, integer } from '../guards';
import { find, nextId, getCapacity, getUsedStorage } from '../state';
export function start(
  s: GameState,
  command: Extract<Command, { type: 'start' }>,
  effectiveNow: number,
): string[] {
  const b = find(s, command.buildingId);
  requireRule(b.kind === 'farm', '冷藏生产已停用，已有任务仍可领取');
  return plantCell(s, { ...command, type: 'plantCell', cell: 0 }, effectiveNow);
}

export function collect(
  s: GameState,
  command: Extract<Command, { type: 'collect' }>,
  effectiveNow: number,
): string[] {
  const events: string[] = [];
  const b = find(s, command.buildingId);
  if (b.kind === 'farm')
    return harvestCell(s, { ...command, type: 'harvestCell', cell: 0 }, effectiveNow);
  const job = b.job;
  requireRule(job, '没有可领取的任务');
  requireRule(effectiveNow >= job.readyAt, '生产尚未完成');
  const item: Item = 'chilledVegetable';
  const amount = CONFIG.coldInput;
  requireRule(getUsedStorage(s) + amount <= getCapacity(s), '仓库已满，请交付订单或扩建');
  s.inventory[item] += amount;
  delete b.job;
  events.push(`领取了 ${amount} 份冷藏蔬菜`);
  return events;
}

function cells(s: GameState, id: string, cell: number): (Job | null)[] {
  const farm = find(s, id);
  requireRule(farm.kind === 'farm' && farm.cropJobs?.length === 9, '请选择菜地小格');
  requireRule(integer(cell, 8), '菜地小格编号无效');
  return farm.cropJobs;
}
export function plantCell(
  s: GameState,
  c: Extract<Command, { type: 'plantCell' }>,
  now: number,
): string[] {
  const jobs = cells(s, c.buildingId, c.cell);
  requireRule(!jobs[c.cell], '此小格已经种植');
  const crop = c.crop ?? 'vegetable';
  requireRule(isCrop(crop), '此作物不能种植');
  requireRule(
    integer(CROPS[crop].durationMs, MAX_CROP_DURATION) &&
      CROPS[crop].durationMs > 0 &&
      integer(CROPS[crop].yield, MAX_CROP_YIELD) &&
      CROPS[crop].yield > 0,
    '作物配置无效',
  );
  requireRule(s.inventory[crop] >= 1, `${CROPS[crop].label}不足，可直接购买`);
  requireRule(now + CROPS[crop].durationMs <= MAX_TIME, '时间超出范围');
  const id = nextId(s, 'j');
  s.inventory[crop]--;
  jobs[c.cell] = {
    id,
    startedAt: now,
    readyAt: now + CROPS[crop].durationMs,
    crop,
    durationMs: CROPS[crop].durationMs,
    yield: CROPS[crop].yield,
  };
  return [`已种下1份${CROPS[crop].label}`];
}
export function harvestCell(
  s: GameState,
  c: Extract<Command, { type: 'harvestCell' }>,
  now: number,
): string[] {
  const jobs = cells(s, c.buildingId, c.cell),
    job = jobs[c.cell];
  requireRule(job, '此小格没有作物');
  requireRule(now >= job.readyAt, '此小格作物尚未成熟');
  const amount = cropJobYield(job);
  requireRule(
    getUsedStorage(s) + amount <= getCapacity(s),
    `仓储空间不足：剩${getCapacity(s) - getUsedStorage(s)}，收获需${amount}；请先出售或扩建`,
  );
  useDurability(s, 'sickle');
  const crop = job.crop ?? 'vegetable';
  s.inventory[crop] += amount;
  jobs[c.cell] = null;
  return [`收获${amount}份${CROPS[crop].label}`];
}
