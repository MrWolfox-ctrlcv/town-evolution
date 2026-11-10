import { V7_GENERATOR_REVISION } from '../domain/v7-world';
import type { BuildProgress } from '../domain/v7-preparation';
import { V7WorldPreparation } from '../domain/v7-preparation';
import { peekTerrain7Save } from '../domain/v7-save-header';
import { SAVE_KEY, BACKUP_KEY } from '../domain/storage';
import type { KeyValueStorage } from '../domain/storage';
import { v7SlotHeader } from './V7SlotInspection';
import type { ManualSlot } from './ManualSaves';
import { SaveVersionError } from '../domain/save-version';
export interface V7PreparationOptions {
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
export class V7PreparationFlow {
  private generation = 0;
  identity: Readonly<{
    terrainVersion: 7;
    revision: string;
    requestId: number;
    seed: number;
  }> | null = null;
  private collect: (() => void) | null = null;
  private verify: (() => boolean) | null = null;
  private remaining: number[] = [];
  private job: V7WorldPreparation | null = null;
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
    options: V7PreparationOptions = {},
  ): void {
    this.cancel();
    this.finish = done;
    this.reject = fail;
    this.message = '准备随机海岸 · 尚未创建或写入进度';
    this.collect = () => {
      const expected = new Map<string, string | null>();
      const read = (key: string) => {
        const raw = storage.getItem(key);
        expected.set(key, raw);
        return raw;
      };
      this.verify = () => [...expected].every(([key, raw]) => storage.getItem(key) === raw);
      const seeds = new Set<number>();
      // Every entry path snapshots both auto-save bytes and rejects incompatible backup versions.
      for (const key of [SAVE_KEY, BACKUP_KEY]) {
        const raw = read(key);
        if (raw !== null)
          try {
            peekTerrain7Save(raw);
          } catch (error) {
            if (error instanceof SaveVersionError) throw error;
          }
      }
      if (options.fresh) seeds.add(42173);
      else if (options.slot) {
        const raw = read(`${SAVE_KEY}.manual.${options.slot}`);
        if (raw !== null) seeds.add(v7SlotHeader(raw).seed);
      } else {
        for (const key of options.source
          ? [options.source === 'primary' ? SAVE_KEY : BACKUP_KEY]
          : [SAVE_KEY, BACKUP_KEY]) {
          const raw = read(key);
          if (raw === null) continue;
          try {
            const header = peekTerrain7Save(raw);
            if (!header) throw new SaveVersionError('实验存档版本不匹配');
            seeds.add(header.mapSeed);
          } catch (error) {
            if (error instanceof SaveVersionError) throw error;
          }
        }
      }
      this.remaining = seeds.size ? [...seeds] : [42173];
    };
  }
  assertUnchanged(): void {
    if (this.verify && !this.verify()) throw Error('存档在准备期间已改变，尚未采用');
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
            if (token !== this.generation || (this.verify && !this.verify()))
              throw Error('存档已改变');
            const done = this.finish;
            this.finish = this.reject = null;
            done?.();
            return true;
          }
          this.identity = Object.freeze({
            terrainVersion: 7,
            revision: V7_GENERATOR_REVISION,
            requestId: token,
            seed,
          });
          this.job = new V7WorldPreparation(seed);
        }
        const progress = this.job.step(64);
        this.message = `分帧准备随机海岸 · ${STAGE_LABELS[progress.stage] ?? '地形准备'}\n独立存档 · 支持自然挖填；可取消，验证后才保存。设备性能尚未验证。`;
        if (progress.status === 'failed' || progress.status === 'cancelled')
          throw Error('地形准备未完成');
        if (progress.status === 'ready') {
          if (
            !this.identity ||
            this.identity.requestId !== this.generation ||
            this.identity.seed !== this.job.seed ||
            this.identity.terrainVersion !== 7 ||
            this.identity.revision !== V7_GENERATOR_REVISION
          )
            throw Error('过期准备结果');
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
    this.identity = null;
    this.job?.cancel();
    this.job = null;
    this.finish = this.reject = null;
    this.remaining = [];
    this.collect = null;
    this.verify = null;
    this.paintedFrames = 0;
  }
}
