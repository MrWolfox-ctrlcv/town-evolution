import { TRAY_LABELS } from './TrayIcons';
import { growthStage } from '../art/CropGrowth';
import { CONFIG, ITEM_KEYS } from '../domain/game';
import type { GameSession } from '../application/GameSession';
import type { UiState } from './UiContracts';
import { commerceDescription } from './CommercePanel';
export function description(session: GameSession, ui: UiState): string {
  if (ui.plantingTree) return '点一块空地种树 · 5币';
  if (ui.toolShopOpen) return '工具补给';
  if (ui.selectedPile && ui.tab === 'manage') {
    const pile = session.state.groundStacks.find(
      (p) => p.x === ui.selectedPile!.x && p.z === ui.selectedPile!.z,
    );
    if (pile) return `${TRAY_LABELS[pile.item]} · ${pile.amount}/5`;
  }
  if (ui.repurposeId) return '改建为公共订单板？原设施将消失';
  if (ui.resetArmed)
    return ui.profile === 'demo' ? '恢复演示模板？正常小镇不受影响' : '重新开始？保留一份旧存档';
  if (ui.cropShopOpen) return '购买作物 · 拖到空格播种';
  if (ui.placing === 'dock') return '船坞 · 放在临水海岸';
  if (ui.placing) return `${CONFIG.buildings[ui.placing].label} · 点地图预览`;
  const b = session.state.buildings.find((item) => item.id === ui.selected);
  if (ui.tab === 'manage' && b) {
    const stock = session.state.fusion.attachments[b.id];
    const materials = stock
      ? ITEM_KEYS.filter((item) => stock[item] > 0)
          .map((item) => `${TRAY_LABELS[item]}${stock[item]}`)
          .join(' ')
      : '';
    const suffix = materials ? ` · 挂载 ${materials}` : '';
    const commerce = commerceDescription(session, ui);
    if (commerce) return commerce + suffix;
    if (b.kind === 'farm') {
      const now = Math.max(Date.now(), session.state.lastSeenAt);
      const jobs = b.cropJobs ?? [];
      const sprout = jobs.filter((job) => growthStage(job, now) === 'seedling').length;
      const young = jobs.filter((job) => growthStage(job, now) === 'young').length;
      const growing = sprout + young;
      const ready = jobs.filter((job) => job && job.readyAt <= now).length;
      return `菜地 · 空${9 - growing - ready} 刚种${sprout} 青年${young} 成熟${ready}${suffix}`;
    }
    const left = b.job
      ? Math.max(
          0,
          Math.ceil((b.job.readyAt - Math.max(Date.now(), session.state.lastSeenAt)) / 1000),
        )
      : 0;
    const status = b.job ? (left ? `${left}秒` : '可收获') : '长按移动';
    return `${CONFIG.buildings[b.kind].label} · ${status}${suffix}${b.kind === 'warehouse' ? ' · 可尝试锤子改造' : ''}`;
  }
  if (ui.tab === 'orders') return '交付订单';
  if (ui.tab === 'build') return '选择建筑';
  if (ui.tab === 'tools') return '双指 / 滚轮缩放 · 本机存档';
  return '作物/镰刀划格 · 长按移动';
}
