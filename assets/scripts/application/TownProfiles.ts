import { createDemoGame, createGame, createBridgeDemo } from '../domain/game';
import { V5_GENERATOR_REVISION } from '../domain/v5-world';
import { SAVE_KEY, BACKUP_KEY } from '../domain/storage';
import type { KeyValueStorage } from '../domain/storage';
import { GameSession } from './GameSession';
export type TownProfile = 'demo' | 'normal' | 'v5-preview' | 'v5-bridge-demo';
export function profileLabel(profile: TownProfile): string {
  return profile === 'v5-bridge-demo'
    ? '木桥演示'
    : profile === 'v5-preview'
      ? 'v5 新岛预览'
      : profile === 'demo'
        ? '演示岛'
        : '我的小镇';
}
export const DEMO_REVISION = '2026-11-06-production-routes-8';
export const PROFILE_KEY = 'town-evolution.active-profile';
export const DEMO_REVISION_KEY = 'town-evolution.demo.revision';
const scopedKey = (profile: TownProfile, key: string) =>
  profile === 'v5-preview' || profile === 'v5-bridge-demo'
    ? `town-evolution.${profile}.${V5_GENERATOR_REVISION}.${key}`
    : `town-evolution.${profile}.${key}`;
export function profileStorage(storage: KeyValueStorage, profile: TownProfile): KeyValueStorage {
  if (profile === 'normal') return storage;
  return {
    getItem: (key) => storage.getItem(scopedKey(profile, key)),
    setItem: (key, value) => storage.setItem(scopedKey(profile, key), value),
    removeItem: (key) => storage.removeItem(scopedKey(profile, key)),
  };
}
export function activeProfile(storage: KeyValueStorage): TownProfile {
  try {
    const profile = storage.getItem(PROFILE_KEY);
    return profile === 'v5-preview' || profile === 'v5-bridge-demo'
      ? profile
      : profile === 'normal'
        ? 'normal'
        : 'demo';
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
  let templateChanged = false;
  const scoped = profileStorage(storage, profile);
  try {
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
    profile === 'v5-bridge-demo'
      ? () => createBridgeDemo(now())
      : profile === 'demo'
        ? () => createDemoGame(now())
        : profile === 'v5-preview'
          ? () => createGame(now(), 42173, 5)
          : undefined,
    profile === 'demo' ? () => storage.setItem(DEMO_REVISION_KEY, DEMO_REVISION) : undefined,
  );
  if (profile === 'v5-preview' && session.mode === 'normal')
    session.message = 'v5 实验地形预览；设备性能与最终美术仍在验证。正常小镇和演示岛不受影响。';
  if (profile === 'v5-bridge-demo' && session.mode === 'normal')
    session.message = '木桥演示 · 独立实验存档。长按一端栈桥，拖到另一端合成；原有小镇不受影响。';
  if (templateChanged && session.mode === 'normal')
    session.message = '演示模板已更新；可重置演示岛载入，当前进度未改动。';
  if (preparationError) {
    session.mode = 'corrupt';
    session.message = '无法初始化本机存档，尚未写入新进度。';
  }
  return session;
}
