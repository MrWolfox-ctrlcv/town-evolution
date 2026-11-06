import { importSave, SaveVersionError } from '../domain/save';
import { SAVE_KEY, BACKUP_KEY, assertSaveRevision } from '../domain/storage';
import type { KeyValueStorage, SaveRevision } from '../domain/storage';
import { peekTerrain6Save } from '../domain/v6-save-header';
import { hasPreparedV6World } from '../domain/v6-world';
import { townSession, profileStorage } from './TownProfiles';
import type { TownProfile } from './TownProfiles';
import type { GameSession } from './GameSession';
import type { V6PreparationOptions } from './V6PreparationFlow';
interface Host {
  profile: TownProfile;
  session: GameSession | null;
  message: string;
}
export class StartRecoveryActions {
  constructor(
    private readonly host: Host,
    private readonly storage: KeyValueStorage,
    private readonly now: () => number,
    private readonly ask: (text: string, run: () => void) => void,
    private readonly activate: (session: GameSession) => void,
    private readonly prepare: (run: () => void, options: V6PreparationOptions) => void,
  ) {}
  recover(): void {
    if (this.host.profile === 'v6-preview') {
      this.recoverV6();
      return;
    }
    const session = townSession(this.storage, this.host.profile, this.now);
    this.ask('采用自动备份？无法读取的主存档会另存保留。', () => {
      if (session.mode !== 'recovered') {
        this.host.message = '备份状态已改变，请重新检查存档。';
        return;
      }
      const recovered = session.recover();
      this.host.message = session.statusMessage;
      if (recovered) this.activate(session);
    });
  }
  reload(): void {
    if (!this.host.session?.hasSaveConflict) return;
    this.ask('读取其他页面的最新自动进度？本页未保存进度将被替换，请先存入空手动栏位。', () => {
      const load = () => {
        if (this.host.profile === 'v6-preview') {
          const raw = profileStorage(this.storage, this.host.profile).getItem(SAVE_KEY);
          try {
            if (!raw) throw Error('主存档不存在');
            importSave(raw, this.now());
          } catch {
            this.host.message = '最新主存档未通过验证，当前小镇与原始数据仍保留。';
            return;
          }
        }
        const latest = townSession(this.storage, this.host.profile, this.now);
        if (latest.mode !== 'normal') {
          this.host.message = latest.statusMessage;
          return;
        }
        this.activate(latest);
      };
      if (this.host.profile === 'v6-preview') this.prepare(load, { source: 'primary' });
      else load();
    });
  }
  private recoverV6(): void {
    const scoped = profileStorage(this.storage, this.host.profile);
    let expected: SaveRevision;
    try {
      expected = { primary: scoped.getItem(SAVE_KEY), backup: scoped.getItem(BACKUP_KEY) };
    } catch {
      this.host.message = '无法读取本机存档，尚未恢复。';
      return;
    }
    this.ask('采用自动备份？无法读取的主存档会另存保留。', () => {
      const validatePrimary = () => {
        try {
          assertSaveRevision(scoped, expected);
          if (expected.primary !== null) {
            try {
              importSave(expected.primary, this.now());
              this.host.message = '主存档可正常读取，尚未用备份覆盖。请继续最新自动进度。';
              return;
            } catch (error) {
              if (error instanceof SaveVersionError) throw error;
            }
          }
        } catch {
          this.host.message = '主存档版本或内容已改变，尚未恢复。';
          return;
        }
        this.prepare(
          () => {
            try {
              assertSaveRevision(scoped, expected);
              if (!expected.backup) throw Error('没有备份');
              importSave(expected.backup, this.now());
              const session = townSession(this.storage, this.host.profile, this.now);
              if (session.mode !== 'recovered') throw Error('备份状态已改变');
              if (session.recover()) this.activate(session);
              else this.host.message = session.statusMessage;
            } catch {
              this.host.message = '备份未通过验证或已改变，当前小镇与原始数据仍保留。';
            }
          },
          { source: 'backup' },
        );
      };
      try {
        const header = expected.primary === null ? null : peekTerrain6Save(expected.primary);
        if (header && !hasPreparedV6World(header.mapSeed)) {
          this.prepare(validatePrimary, { source: 'primary' });
          return;
        }
      } catch (error) {
        if (error instanceof SaveVersionError) {
          this.host.message = error.message;
          return;
        }
      }
      validatePrimary();
    });
  }
}
