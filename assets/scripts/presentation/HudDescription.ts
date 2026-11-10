import { materialQuantity } from '../application/MaterialQuantity';
import { compostDescription } from './CompostControls';
import { farmCellCount, farmLabel } from '../domain/farming';
import { TRAY_LABELS } from './TrayIcons';
import { growthStage } from '../art/CropGrowth';
import {
  CONFIG,
  ITEM_KEYS,
  UNLIMITED_TOOL_DURABILITY,
  stackLimitFor,
  nurseryStage,
} from '../domain/game';
import type { GameSession } from '../application/GameSession';
import type { UiState } from './UiContracts';
import { commerceDescription } from './CommercePanel';
export function description(session: GameSession, ui: UiState, loading = false): string {
  if (ui.repurposeId) return '改建为公共订单板？原设施将消失';
  if (ui.resetArmed)
    return ui.profile === 'v5-bridge-demo'
      ? '只重置木桥演示；其他小镇和手动存档不变。'
      : ui.profile === 'v5-preview'
        ? '仅重置 v5 预览岛？正常小镇和演示岛不受影响，保留一份预览旧档'
        : ui.profile === 'demo'
          ? '恢复演示模板？正常小镇不受影响'
          : '重新开始？保留一份旧存档';
  if (ui.plantingTree) return '点一块空地种树 · 5币';
  if (ui.toolShopOpen) return UNLIMITED_TOOL_DURABILITY ? '工具无限耐久 · 无需补给' : '工具补给';
  if (ui.cropShopOpen) return '购买作物 · 拖到空格播种';
  if (ui.selectedResource && ui.tab === 'manage' && !ui.selected && !ui.selectedPile) {
    const selected = ui.selectedResource;
    const tree =
      selected.kind === 'tree'
        ? session.state.trees.find((entry) => entry.id === selected.id)
        : null;
    if (tree) {
      const left = Math.max(
        0,
        Math.ceil(((tree.readyAt ?? 0) - Math.max(Date.now(), session.state.lastSeenAt)) / 1000),
      );
      return left ? `树苗 · ${left}秒后长成` : '树木 · 斧子砍伐';
    }
    const drop =
      selected.kind === 'drop' && session.state.looseDrops.find((d) => d.id === selected.id);
    if (drop)
      return `${TRAY_LABELS[drop.item]} ×${materialQuantity(drop.amount)} · 长按移动 · 拾取入仓`;
    const resource = session.state.naturalResources.find((entry) => entry.id === selected.id);
    if (selected.kind === 'natural' && resource)
      return `${resource.kind === 'stone' ? '天然石矿' : '天然土壤'} · 剩余 ${materialQuantity(resource.amount)}`;
  }
  if (ui.selectedPile && ui.tab === 'manage') {
    const pile = session.state.groundStacks.find(
      (p) => p.x === ui.selectedPile!.x && p.z === ui.selectedPile!.z,
    );
    if (pile)
      return pile.item === 'mud'
        ? TRAY_LABELS[pile.item]
        : `${TRAY_LABELS[pile.item]} · ${materialQuantity(pile.amount)}/${stackLimitFor(pile.item)}`;
  }
  const b = session.state.buildings.find((item) => item.id === ui.selected);
  if (ui.tab === 'manage' && b) {
    const stock = session.state.fusion.attachments[b.id];
    const materials = stock
      ? ITEM_KEYS.filter((item) => stock[item] > 0)
          .map((item) => `${TRAY_LABELS[item]}${materialQuantity(stock[item])}`)
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
      return `${farmLabel(b)} · 空${farmCellCount(b) - growing - ready} 刚种${sprout} 青年${young} 成熟${ready}${b.collectionBox ? ` · 田箱${Object.values(b.collectionBox.stock).reduce((a, n) => a + n, 0)}/${b.collectionBox.capacity}` : ' · 镰刀收割后落地'}${suffix}`;
    }
    if (b.kind === 'compostBarrel') return compostDescription(session, b);
    if (b.kind === 'nursery') {
      const stage = nurseryStage(b, Math.max(Date.now(), session.state.lastSeenAt));
      const status = {
        empty: '放入树种',
        seeded: '等待浇水',
        growing: '正在育苗',
        ready: '树苗可领取',
      }[stage];
      return `育苗箱 · ${status}${suffix}`;
    }
    if (b.processingJob) {
      const left = Math.max(
        0,
        Math.ceil(
          (b.processingJob.readyAt - Math.max(Date.now(), session.state.lastSeenAt)) / 1000,
        ),
      );
      return `${CONFIG.buildings[b.kind].label} · ${left ? `${left}秒` : '加工完成，可领取'}${suffix}`;
    }
    if (b.kind === 'transportWarehouse') return `运输仓 · 选择货物与目的地${suffix}`;
    const left = b.job
      ? Math.max(
          0,
          Math.ceil((b.job.readyAt - Math.max(Date.now(), session.state.lastSeenAt)) / 1000),
        )
      : 0;
    const status = b.job ? (left ? `${left}秒` : '可收获') : '长按移动';
    return `${CONFIG.buildings[b.kind].label} · ${status}${suffix}`;
  }
  if (session.state.terrainVersion === 6 || session.state.terrainVersion === 7)
    return `${{ farm: '开田：保留旧农田工具', dig: '挖地：每次切下一层', fill: '填地：消耗真实土石' }[ui.terrainMode]} · 拖左侧挖掘工具${loading ? ' · 地形加载中' : ''}`;
  if (ui.tab === 'orders') return '交付订单';
  if (ui.tab === 'tools')
    return UNLIMITED_TOOL_DURABILITY ? '工具无限耐久 · 本机存档' : '双指 / 滚轮缩放 · 本机存档';
  return (ui.profile === 'v5-preview' || ui.profile === 'v5-bridge-demo') && loading
    ? '地形与树木细节加载中 · 可拖动/缩放视角'
    : '作物/镰刀划格 · 长按移动';
}
