import { createDemoGame } from '../domain/game';
import { SAVE_KEY, BACKUP_KEY, clearLegacyTests } from '../domain/storage';
import type { KeyValueStorage } from '../domain/storage';
import { GameSession } from './GameSession';
export type TownProfile = 'demo' | 'normal';
export const DEMO_REVISION = '2026-11-03-natural-island-1';
export const PROFILE_KEY = 'town-evolution.active-profile';
export const DEMO_REVISION_KEY = 'town-evolution.demo.revision';
const demoKey = (key: string) => `town-evolution.demo.${key}`;
export function profileStorage(storage: KeyValueStorage, profile: TownProfile): KeyValueStorage {
  if (profile === 'normal') return storage;
  return {
    getItem: (key) => storage.getItem(demoKey(key)),
    setItem: (key, value) => storage.setItem(demoKey(key), value),
    removeItem: (key) => storage.removeItem(demoKey(key)),
  };
}
export function activeProfile(storage: KeyValueStorage): TownProfile {
  try {
    return storage.getItem(PROFILE_KEY) === 'normal' ? 'normal' : 'demo';
  } catch {
    return 'demo';
  }
}
/** Updated templates never overwrite an existing demonstration without explicit reset. */
export function townSession(
  storage: KeyValueStorage,
  profile: TownProfile,
  now: () => number,
): GameSession {
  let preparationError = false;
  let oldTestsCleared = false;
  let templateChanged = false;
  const scoped = profileStorage(storage, profile);
  try {
    oldTestsCleared = clearLegacyTests(storage);
    if (profile === 'demo' && storage.getItem(DEMO_REVISION_KEY) !== DEMO_REVISION) {
      if (scoped.getItem(SAVE_KEY) === null && scoped.getItem(BACKUP_KEY) === null)
        storage.setItem(DEMO_REVISION_KEY, DEMO_REVISION);
      else templateChanged = true;
    }
  } catch {
    preparationError = true;
  }
  const session = new GameSession(
    scoped,
    now,
    profile === 'demo' ? () => createDemoGame(now()) : undefined,
    profile === 'demo' ? () => storage.setItem(DEMO_REVISION_KEY, DEMO_REVISION) : undefined,
  );
  if (oldTestsCleared && session.mode === 'normal')
    session.message = '旧测试存档已清除，新的海岛已就绪。';
  if (templateChanged && session.mode === 'normal')
    session.message = '演示模板已更新；可重置演示岛载入，当前进度未改动。';
  if (preparationError) {
    session.mode = 'corrupt';
    session.message = '无法初始化本机存档，尚未写入新进度。';
  }
  return session;
}
