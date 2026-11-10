import type { BuildProgress } from '../domain/v6-preparation';
import { createV6Preparation, type V6PreparationJob } from './V6WorkerPreparation';
import { peekTerrain6Save } from '../domain/v6-save-header';
import { SAVE_KEY, BACKUP_KEY } from '../domain/storage';
import type { KeyValueStorage } from '../domain/storage';
import { v6SlotHeader } from './V6SlotInspection';
import type { ManualSlot } from './ManualSaves';
import { SaveVersionError } from '../domain/save-version';
export interface V6PreparationOptions {
  slot?: ManualSlot;
  fresh?: boolean;
  source?: 'primary' | 'backup';
}
const STAGE_LABELS: Record<BuildProgress['stage'], string> = {
  hydrology: '河流与湖泊',
  'coast-candidates': '海岸候选',
  'coast-sort': '海岸排序',
  'coast-certify': '海岸验证',
  'starter-candidates': '起始区域',
  'starter-sort': '起始区域排序',
  'starter-trees': '起始树木',
  'reserve-bounds': '保留区域',
  'allocate-lattice': '地形网格',
  'clear-lattice': '初始化网格',
  'cell-vertices': '草坡与地表',
  'cell-strata': '土石地层',
  'cell-finalize': '地形校验',
  'initial-resources': '初始资源',
  'initial-trees': '初始树木',
  'transfer-validate': '验证与接收地形',
  'qualification-cells': '验证土地与资源',
  'qualification-connectivity': '验证岛屿连通',
  'qualification-border': '验证海岸边界',
  'qualification-water': '验证湖河海湾',
  complete: '完成准备，验证存档',
};
/** A cancellable UI-owned job. No session, save writes, timers or stale callbacks. */
export class V6PreparationFlow {
  private generation = 0;
  private collect: (() => void) | null = null;
  private verify: (() => boolean) | null = null;
  private remaining: number[] = [];
  private job: V6PreparationJob | null = null;
  private paintedFrames = 0;
  private finish: (() => void) | null = null;
  private reject: ((message: string) => void) | null = null;
  message = '';
  get active(): boolean {
    return this.finish !== null;
  }
  start(
    storage: KeyValueStorage,
    done: () => void,
    fail: (message: string) => void,
    options: V6PreparationOptions = {},
  ): void {
    this.cancel();
    this.finish = done;
    this.reject = fail;
    this.message = '准备自然地形 · 尚未创建或写入进度';
    this.collect = () => {
      const expected = new Map<string, string | null>();
      const read = (key: string) => {
        const raw = storage.getItem(key);
        expected.set(key, raw);
        return raw;
      };
      this.verify = () => [...expected].every(([key, raw]) => storage.getItem(key) === raw);
      const seeds = new Set<number>();
      if (options.fresh) seeds.add(42173);
      else if (options.slot) {
        const raw = read(`${SAVE_KEY}.manual.${options.slot}`);
        if (raw !== null) seeds.add(v6SlotHeader(raw).seed);
      } else {
        for (const key of options.source
          ? [options.source === 'primary' ? SAVE_KEY : BACKUP_KEY]
          : [SAVE_KEY, BACKUP_KEY]) {
          const raw = read(key);
          if (raw === null) continue;
          try {
            const header = peekTerrain6Save(raw);
            if (!header) throw new SaveVersionError('实验存档版本不匹配');
            seeds.add(header.mapSeed);
          } catch (error) {
            if (key === SAVE_KEY && error instanceof SaveVersionError) throw error;
          }
        }
      }
      this.remaining = seeds.size ? [...seeds] : [42173];
    };
  }
  /** Called once per displayed Cocos frame; several small steps share a soft 6ms budget. */
  tick(clock: () => number = () => performance.now()): boolean {
    if (!this.active) return false;
    if (++this.paintedFrames <= 2) return false;
    const token = this.generation,
      started = clock();
    try {
      const collect = this.collect;
      this.collect = null;
      collect?.();
      if (this.verify && !this.verify()) {
        this.failed('存档在准备期间已改变，请重新选择后准备。原始数据未更改。');
        return true;
      }
      do {
        if (!this.job) {
          const seed = this.remaining.shift();
          if (seed === undefined) {
            const done = this.finish;
            this.finish = this.reject = null;
            done?.();
            return true;
          }
          this.job = createV6Preparation(seed);
        }
        const progress = this.job.step(64);
        this.message = `${this.job.mode === 'fallback' ? '后台准备不可用，分帧准备' : '准备自然地形'} · ${STAGE_LABELS[progress.stage] ?? '地形准备'}\n可取消；完整验证后才保存。设备性能尚未验证。`;
        if (this.job.waiting) break;
        if (progress.status === 'failed' || progress.status === 'cancelled')
          throw Error('地形准备未完成');
        if (progress.status === 'ready') {
          this.job.takeResult();
          this.job = null;
        }
      } while (token === this.generation && this.active && clock() - started < 6);
    } catch (error) {
      if (error instanceof SaveVersionError) {
        this.failed(error.message);
        return true;
      }
      if (token === this.generation) this.failed('实验地形准备失败，原有存档未更改。可返回重试。');
    }
    return true;
  }
  private failed(message: string): void {
    const reject = this.reject;
    this.cancel();
    this.message = message;
    reject?.(message);
  }
  cancel(): void {
    this.generation++;
    this.job?.cancel();
    this.job = null;
    this.finish = this.reject = null;
    this.remaining = [];
    this.collect = null;
    this.verify = null;
    this.paintedFrames = 0;
  }
}
