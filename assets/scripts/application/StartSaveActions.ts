import { resetSave, SaveConflictError, assertSaveRevision } from '../domain/storage';
import type { KeyValueStorage } from '../domain/storage';
import type { GameSession } from './GameSession';
import type { TownProfile } from './TownProfiles';
import type { ManualSlot } from './ManualSaves';
import type { LoadResult } from '../domain/storage';
import type { StartSlotInfo } from './V6SlotInspection';
import { profileStorage, townSession } from './TownProfiles';
import { writeSlot } from './ManualSaves';
interface Host {
  session: GameSession | null;
  profile: TownProfile;
  slot: ManualSlot;
  message: string;
  inspect(): LoadResult;
  inspectSlot(): StartSlotInfo;
}
type Ask = (text: string, run: () => void) => void;
export function saveStartSlot(
  host: Host,
  storage: KeyValueStorage,
  now: () => number,
  ask: Ask,
): void {
  if (!host.session) return;
  const snapshot = host.inspectSlot();
  const write = () => {
    if (!host.session) return;
    try {
      if (snapshot.revision === undefined) throw new Error('无法核对此栏位');
      host.session.resume();
      writeSlot(
        profileStorage(storage, host.profile),
        host.slot,
        host.session.state,
        now(),
        snapshot.revision,
      );
      host.message = `已保存到手动存档 ${host.slot}。`;
    } catch (error) {
      host.message =
        error instanceof SaveConflictError
          ? '另一页面已更新此手动栏位，尚未覆盖。请重新选择空栏位。'
          : '手动保存失败，请保留当前游戏并重试。';
    }
  };
  if (snapshot.status === 'empty') write();
  else ask(`覆盖手动存档 ${host.slot}？旧栏位会另存保留。`, write);
}
export function loadStartSlot(
  host: Host,
  storage: KeyValueStorage,
  now: () => number,
  ask: Ask,
  activate: (session: GameSession) => void,
): void {
  const original = host.inspectSlot();
  const expected = host.inspect().revision;
  if (original.status !== 'ready') {
    host.message = '此栏位不可读取，原始数据未更改。';
    return;
  }
  ask(`读取手动存档 ${host.slot}？当前自动进度会替换，读取前的主存档会另存保留。`, () => {
    const slot = host.inspectSlot();
    if (slot.status !== 'ready') {
      host.message = '此栏位已无法读取，原始数据未更改。';
      return;
    }
    if (slot.revision !== original.revision || !expected) {
      host.message = '存档已被另一页面更改，尚未读取。请重新选择。';
      return;
    }
    // A failed autosave must not lose the live in-memory town when loading an older slot.
    if (host.session && !host.session.save()) {
      host.message = host.session.statusMessage;
      return;
    }
    let restoredPrimary = false;
    try {
      const scoped = profileStorage(storage, host.profile);
      const revision = resetSave(scoped, slot.state, host.session?.saveRevision ?? expected);
      restoredPrimary = true;
      const restored = townSession(storage, host.profile, now, { initializeMetadata: false });
      // Empty storage creates a normal fresh session too: activate only our restored bytes.
      if (restored.mode !== 'normal' || restored.saveRevision.primary !== revision.primary)
        throw new SaveConflictError();
      assertSaveRevision(scoped, revision);
      activate(restored);
    } catch (error) {
      host.message = restoredPrimary
        ? `读取后校验失败，尚未切换小镇。${host.session ? '当前游戏仍保留；' : ''}手动栏位未更改，请重新检查自动存档。`
        : error instanceof SaveConflictError
          ? '另一页面已更新自动存档，尚未替换。请重新检查存档。'
          : `读取失败，${host.session ? '当前游戏仍保留。' : '尚未进入小镇。'}请检查本机存储后重试。`;
    }
  });
}
