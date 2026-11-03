import { Node, geometry, sys } from 'cc';
import { CONFIG, getCapacity, getUsedStorage } from '../domain/game';
import type { Command } from '../domain/game';
import { GameSession } from '../application/GameSession';
import { TownView } from './TownView';
import { TownHUD } from './TownHUD';
import type { HudTab } from './TownHUD';
import { MapCamera } from './MapCamera';
import { actions } from './HudActions';
import type { UiState, PlaceKind, UiHandlers } from './HudActions';
/** Thin coordinator. Rules, save operations, UI widgets and model generation live elsewhere. */
export class TownController {
  private readonly session = new GameSession(sys.localStorage, () => Date.now());
  private readonly ui: UiState = {
    tab: 'manage',
    selected: null,
    placing: null,
    preview: null,
    resetArmed: false,
  };
  private readonly hud: TownHUD;
  private readonly map: MapCamera;
  private readonly town: TownView;
  private readonly handlers: UiHandlers;
  private elapsed = 0;
  constructor(parent: Node) {
    this.hud = new TownHUD(
      parent,
      (text) => this.explain(text),
      (tab) => this.changeTab(tab),
    );
    this.map = new MapCamera(parent, this.hud.mapInput, (point, ray) =>
      this.pick(point.x, point.z, ray),
    );
    this.town = new TownView(parent);
    this.handlers = {
      command: (command) => this.run(command),
      build: (kind) => this.beginBuild(kind),
      cancel: () => this.cancel(),
      confirm: () => this.confirmPlacement(),
      zoom: (delta) => {
        this.ui.resetArmed = false;
        this.map.zoomBy(delta);
        this.refresh();
      },
      save: () => this.save(),
      reset: () => this.reset(),
    };
    this.layout();
    this.refresh(true);
  }
  layout(): void {
    const v = this.hud.layout();
    this.map.layout(v.width, v.height, v.bottom, v.top, v.right);
  }
  tick(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.elapsed = 0;
      this.refresh();
    }
  }
  suspend(): void {
    this.map.cancelGesture();
    this.hud.cancelGestures();
    this.session.suspend();
  }
  resume(): void {
    this.map.cancelGesture();
    this.hud.cancelGestures();
    this.session.resume();
    this.ui.resetArmed = false;
    this.refresh(true);
  }
  dispose(): void {
    this.map.dispose();
    this.town.dispose();
  }
  private explain(text: string): void {
    this.session.message = text;
    this.ui.resetArmed = false;
    this.refresh();
  }
  private refresh(_models = false): void {
    const state = this.session.state;
    const layoutChanged = this.hud.render({
      summary: `小镇进化 · 金币 ${state.coins}\n蔬菜 ${state.inventory.vegetable} · 冷藏菜 ${state.inventory.chilledVegetable} · 仓储 ${getUsedStorage(state)}/${getCapacity(state)}`,
      message: this.session.message,
      detail: this.description(),
      tab: this.ui.tab,
      actions: actions(this.session, this.ui, this.handlers),
    });
    if (layoutChanged) this.layout();
    this.town.sync(state, this.ui.selected, this.ui.preview);
  }
  private description(): string {
    if (this.ui.resetArmed)
      return '将开始新小镇。最近一次重置前的主存档会另存保留；不会永久累计所有历史。';
    if (this.ui.placing) {
      const cfg = CONFIG.buildings[this.ui.placing];
      const p = this.ui.preview;
      return `${cfg.label} · 占地 ${cfg.width}×${cfg.depth}\n${p ? `位置 (${p.x}, ${p.z}) · ${p.valid ? '可建造' : '不可建造'}` : '点地图显示预览框，再确认建造'}；拖动移动地图。`;
    }
    const b = this.session.state.buildings.find((item) => item.id === this.ui.selected);
    if (this.ui.tab === 'manage' && b) {
      const left = b.job
        ? Math.max(
            0,
            Math.ceil((b.job.readyAt - Math.max(Date.now(), this.session.state.lastSeenAt)) / 1000),
          )
        : 0;
      const job = b.job ? (left ? `生产中，剩余 ${left} 秒` : '生产完成，等待领取') : '空闲';
      return `${CONFIG.buildings[b.kind].label} (${b.x}, ${b.z}) · ${job}\n${b.kind === 'coldWarehouse' ? `${CONFIG.coldInput}蔬菜加工成${CONFIG.coldInput}冷藏菜。` : b.kind === 'cooler' ? '选择相邻基础仓房，可组合为冷藏库。' : '点其他建筑切换，拖动地图移动视角。'}`;
    }
    if (this.ui.tab === 'orders')
      return '提交指定货物即可获得金币。\n订单可重复完成，无需付费或观看广告。';
    if (this.ui.tab === 'build')
      return '选择建筑类型 → 点地图预览 → 确认建造。\n制冷设施应与基础仓房边缘相邻。';
    if (this.ui.tab === 'tools')
      return '进度保存在当前设备，尚不支持跨设备同步。\n放大查看建筑；重新开始需要再次确认。';
    return '点菜地种植，收获后交订单。\n拖动地图移动视角。';
  }
  private changeTab(tab: HudTab): void {
    this.ui.tab = tab;
    this.ui.resetArmed = false;
    this.ui.placing = null;
    this.ui.preview = null;
    this.refresh(true);
  }
  private run(command: Command): void {
    this.ui.resetArmed = false;
    this.session.run(command);
    this.refresh(true);
  }
  private beginBuild(kind: PlaceKind): void {
    this.ui.placing = kind;
    this.ui.preview = null;
    this.ui.selected = null;
    this.ui.resetArmed = false;
    this.session.message = '点地图选择位置，黄色边框可建造，红色表示冲突。';
    this.refresh(true);
  }
  private cancel(): void {
    this.ui.resetArmed = false;
    this.ui.placing = null;
    this.ui.preview = null;
    this.session.message = '已取消，进度未改变。';
    this.refresh(true);
  }
  private confirmPlacement(): void {
    const p = this.ui.preview;
    if (!p || !this.ui.placing) return;
    if (this.session.run({ type: 'place', kind: this.ui.placing, x: p.x, z: p.z })) {
      this.ui.selected =
        this.session.state.buildings[this.session.state.buildings.length - 1]?.id ?? null;
      this.ui.placing = null;
      this.ui.preview = null;
      this.ui.tab = 'manage';
    }
    this.refresh(true);
  }
  private pick(x: number, z: number, ray: geometry.Ray): void {
    this.ui.resetArmed = false;
    if (this.ui.placing) {
      const reason = this.session.reason({ type: 'place', kind: this.ui.placing, x, z });
      this.ui.preview = { kind: this.ui.placing, x, z, valid: !reason };
      this.session.message = reason ?? '位置可用，确认后才会扣除金币。';
    } else {
      const picked = this.town.pickBuilding(ray);
      const b = this.session.state.buildings.find((item) => item.id === picked);
      this.ui.selected = b?.id ?? null;
      this.ui.tab = 'manage';
      this.session.message = b
        ? `已选择 ${CONFIG.buildings[b.kind].label}`
        : '点选建筑，或切换建造页添加新设施。';
    }
    this.refresh(true);
  }
  private save(): void {
    this.ui.resetArmed = false;
    if (this.session.mode === 'recovered') this.session.recover();
    else if (this.session.save()) this.session.message = '进度已保存到当前设备。';
    this.refresh();
  }
  private reset(): void {
    if (!this.ui.resetArmed) {
      this.ui.resetArmed = true;
      this.ui.placing = null;
      this.ui.preview = null;
      this.session.message = '是否开始新小镇？';
      this.refresh(true);
      return;
    }
    if (this.session.reset()) {
      this.ui.selected = null;
      this.ui.tab = 'manage';
      this.map.reset();
    }
    this.ui.resetArmed = false;
    this.refresh(true);
  }
}
