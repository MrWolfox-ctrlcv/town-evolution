import { setActiveV6World } from '../domain/v6-world';
import { setActiveV7World } from '../domain/v7-world';
import { exportSave } from '../domain/save';
import { loadGame, type KeyValueStorage, type LoadResult } from '../domain/storage';
import { townSession, profileStorage, profileLabel, type TownProfile } from './TownProfiles';
import { inspectV7Slot, v7BackupPending } from './V7SlotInspection';
import { inspectV6Slot, v6BackupPending, type StartSlotInfo } from './V6SlotInspection';
import { inspectSlot, type ManualSlot } from './ManualSaves';
import type { GameSession } from './GameSession';
import type { StartPage } from './StartNavigation';
import type { V7PreparationFlow } from './V7PreparationFlow';
interface ProfileHost {
  page: StartPage;
  profile: TownProfile;
  session: GameSession | null;
  message: string;
}
export function profileBackupPending(storage: KeyValueStorage, profile: TownProfile): boolean {
  return (
    (profile === 'v6-preview' || profile === 'v7-preview') &&
    (profile === 'v7-preview' ? v7BackupPending : v6BackupPending)(profileStorage(storage, profile))
  );
}
export function inspectProfile(
  storage: KeyValueStorage,
  profile: TownProfile,
  now: number,
): LoadResult {
  const saved = loadGame(profileStorage(storage, profile), now);
  return saved.state &&
    ((profile === 'v6-preview' && saved.state.terrainVersion !== 6) ||
      (profile === 'v7-preview' && saved.state.terrainVersion !== 7))
    ? {
        status: 'corrupt',
        state: null,
        warning: '实验存档版本不匹配，原始数据未更改。',
        ...(saved.revision ? { revision: saved.revision } : {}),
      }
    : saved;
}
export function inspectProfileSlot(
  storage: KeyValueStorage,
  profile: TownProfile,
  slot: ManualSlot,
  now: number,
): StartSlotInfo {
  return (
    profile === 'v7-preview'
      ? inspectV7Slot
      : profile === 'v6-preview'
        ? inspectV6Slot
        : inspectSlot
  )(profileStorage(storage, profile), slot, now);
}
/** Keep the live session pinned until both namespaces have passed their final save gates. */
export function switchToSeededCoast(
  host: ProfileHost,
  storage: KeyValueStorage,
  now: () => number,
  preparation: V7PreparationFlow,
  activate: (session: GameSession) => void,
): void {
  const oldSession = host.session;
  if (!oldSession) return;
  if (host.profile === 'v7-preview') {
    host.page = 'game';
    return;
  }
  const oldProfile = host.profile,
    back = host.page;
  host.page = 'preparing';
  preparation.start(
    profileStorage(storage, 'v7-preview'),
    () => {
      try {
        const candidate = townSession(storage, 'v7-preview', now);
        preparation.assertUnchanged();
        if (candidate.mode !== 'normal') throw Error(candidate.statusMessage);
        // Storage writes cannot be dry-run atomically. Validate serialization first,
        // then persist the live town before attempting the candidate namespace.
        exportSave(candidate.state);
        if (host.session !== oldSession || host.profile !== oldProfile)
          throw Error('小镇已改变，尚未切换');
        if (!oldSession.save()) throw Error(oldSession.statusMessage);
        preparation.assertUnchanged();
        if (!candidate.save()) throw Error(candidate.statusMessage);
        host.profile = 'v7-preview';
        activate(candidate);
      } catch (error) {
        host.profile = oldProfile;
        host.page = back;
        host.message = String(error);
      }
    },
    (message) => {
      host.page = back;
      host.message = message;
    },
  );
}

/** Reset confirmation captures the original revision and retains the old session on failure. */
export function resetProfileTown(
  host: ProfileHost & { inspect(): LoadResult },
  storage: KeyValueStorage,
  now: () => number,
  ask: (text: string, run: () => void) => void,
  activate: (session: GameSession) => void,
): void {
  const expected = host.inspect().revision;
  ask(
    `重新开始${profileLabel(host.profile)}？当前自动存档会替换，重置前原始数据会另存保留；手动存档不变。`,
    () => {
      if (host.session && !host.session.save()) {
        host.message = host.session.statusMessage;
        return;
      }
      if (!expected) {
        host.message = '无法核对存档，尚未重置。请重新打开存档页。';
        return;
      }
      const session = townSession(storage, host.profile, now);
      if (!session.reset(host.session?.saveRevision ?? expected)) {
        host.message = session.statusMessage;
        return;
      }
      activate(session);
    },
  );
}

/** Saving and releasing a profile belongs to the same transactional navigation boundary. */
export function exitProfileTown(
  host: ProfileHost,
  ask: (text: string, run: () => void) => void,
): void {
  if (!host.session) {
    host.page = 'exit';
    host.message = '已停留在标题页。网页版请关闭此标签页即可退出。';
    return;
  }
  ask('保存进度并退出到标题？网页版不会自动关闭浏览器。', () => {
    if (!host.session) return;
    host.session.resume();
    if (!host.session.save()) {
      host.message = host.session.statusMessage;
      return;
    }
    host.session = null;
    setActiveV6World(null);
    setActiveV7World(null);
    host.profile = 'normal';
    host.page = 'title';
    host.message = '进度已保存，可随时继续。';
  });
}
