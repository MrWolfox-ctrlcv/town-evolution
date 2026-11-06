import type { KeyValueStorage } from '../domain/storage';
export interface ExclusiveLockProvider {
  request(name: string, run: () => Promise<void>): Promise<void>;
}
export const GAME_WRITE_LOCK = 'town-evolution.local-saves.writer.v1';
export class StorageWriteLockError extends Error {}
/**
 * One browser page owns all game writes for its lifetime. Web Locks provides cross-page
 * exclusion; exact-byte revisions still detect stale state after ownership changes.
 * Missing lock support is deliberately read-only, never an unsafe fallback.
 */
export class ExclusiveGameStorage implements KeyValueStorage {
  private status: 'waiting' | 'ready' | 'unsupported' | 'failed' | 'disposed';
  private started = false;
  private release: (() => void) | null = null;
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly locks: ExclusiveLockProvider | null,
    private readonly changed: () => void = () => {},
  ) {
    this.status = locks ? 'waiting' : 'unsupported';
  }
  get writable(): boolean {
    return this.status === 'ready';
  }
  get warning(): string {
    switch (this.status) {
      case 'ready':
        return '';
      case 'waiting':
        return '正在取得安全存档锁；若持续等待，请关闭其他游戏页面。此页暂时只读。';
      case 'unsupported':
        return '当前浏览器不支持安全存档锁，已禁止写入。请使用支持 Web Locks 的现代浏览器。';
      case 'failed':
        return '无法取得安全存档锁，已禁止写入。请关闭其他游戏页面后重新打开。';
      case 'disposed':
        return '此页面已结束，禁止写入。';
    }
  }
  start(): void {
    if (this.started || !this.locks || this.status === 'disposed') return;
    this.started = true;
    void Promise.resolve()
      .then(() =>
        this.locks!.request(GAME_WRITE_LOCK, async () => {
          if (this.status === 'disposed') return;
          const held = new Promise<void>((resolve) => {
            this.release = resolve;
          });
          this.status = 'ready';
          this.changed();
          await held;
        }),
      )
      .catch(() => {
        if (this.status === 'disposed') return;
        this.status = 'failed';
        this.release = null;
        this.changed();
      });
  }
  getItem(key: string): string | null {
    return this.storage.getItem(key);
  }
  setItem(key: string, value: string): void {
    this.assertWritable();
    this.storage.setItem(key, value);
  }
  removeItem(key: string): void {
    this.assertWritable();
    this.storage.removeItem(key);
  }
  private assertWritable(): void {
    if (!this.writable) throw new StorageWriteLockError(this.warning);
  }
  dispose(): void {
    // Revoke synchronous writes before releasing the cross-page lock.
    this.status = 'disposed';
    this.release?.();
    this.release = null;
  }
}
