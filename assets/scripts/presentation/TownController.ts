import { Node, geometry, sys } from 'cc';
import { getCapacity, getUsedStorage } from '../domain/game';
import type { Command } from '../domain/game';
import type { TownProfile } from '../application/TownProfiles';
import { bindCollections } from './CollectionBinding';
import { GameSession } from '../application/GameSession';
import { TownView } from './TownView';
import { TownHUD } from './TownHUD';
import type { HudTab } from './TownHUD';
import { ToolRouter } from './ToolRouter';
import { description } from './HudDescription';
import { DeferredLayout } from '../application/DeferredLayout';
import { nextQuantity, tradeItems } from '../application/CommerceSelection';
import { ObjectDrag } from './ObjectDrag';
import { MapCamera } from './MapCamera';
import { actions, rotationAction } from './HudActions';
import type { UiState, PlaceKind, UiHandlers } from './HudActions';
/** Thin coordinator. Rules, save operations, UI widgets and model generation live elsewhere. */
export class TownController {
  private readonly session: GameSession;
  private readonly ui: UiState = {
    profile: 'normal',
    tab: 'manage',
    selected: null,
    placing: null,
    preview: null,
    resetArmed: false,
    cropShopOpen: false,
    toolShopOpen: false,
    selectedPile: null,
    plantingTree: false,
    repurposeId: null,
    tradeItem: 'vegetable',
    quantity: 1,
  };
  private readonly hud: TownHUD;
  private readonly map: MapCamera;
  private readonly drag: ObjectDrag;
  private readonly tools: ToolRouter;
  private readonly town: TownView;
  private readonly handlers: UiHandlers;
  private elapsed = 0;
  private readonly deferredLayout = new DeferredLayout();
  constructor(
    parent: Node,
    session = new GameSession(sys.localStorage, () => Date.now()),
    profile: TownProfile = 'normal',
    switchProfile?: (profile: TownProfile) => void,
  ) {
    this.session = session;
    this.ui.profile = profile;
    this.hud = new TownHUD(
      parent,
      (text) => this.explain(text),
      (tab) => this.changeTab(tab),
    );
    this.town = new TownView(parent);
    this.drag = new ObjectDrag(
      parent,
      this.session,
      this.ui,
      this.town,
      () => this.refresh(),
      this.hud,
    );
    this.map = new MapCamera(parent, this.hud.mapInput, {
      covered: (point) => this.hud.coversMapPoint(point),
      tap: (point, ray) => this.pick(point.x, point.z, ray),
      candidate: (ray) => this.drag.candidate(ray),
      drag: (id, point, ray, screen) => this.drag.move(id, point, ray, screen),
      drop: (id, ray, screen) => this.drag.drop(id, ray, screen),
      cancel: () => this.drag.clear(),
    });
    this.tools = new ToolRouter(parent, this.session, this.map, this.town, this.ui, () =>
      this.refresh(),
    );
    this.hud.setToolHandlers(this.tools);
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
      switchTown: () => {
        if (this.session.mode === 'normal' && !this.session.save()) {
          this.refresh();
          return;
        }
        switchProfile?.(this.ui.profile === 'demo' ? 'normal' : 'demo');
      },
      openToolShop: () => {
        this.ui.toolShopOpen = true;
        this.refresh();
      },
      plantTree: () => {
        this.ui.plantingTree = true;
        this.refresh();
      },
      openCropShop: () => {
        this.ui.cropShopOpen = true;
        this.refresh();
      },
      repurpose: () => this.repurpose(),
      item: () => {
        const items = tradeItems(this.session.state);
        this.ui.tradeItem = items[(items.indexOf(this.ui.tradeItem) + 1) % items.length];
        this.refresh();
      },
      quantity: () => {
        this.ui.quantity = nextQuantity(this.ui.quantity);
        this.refresh();
      },
      select: (id) => {
        this.ui.selected = id;
        this.ui.tab = 'manage';
        this.refresh();
      },
    };
    this.layout();
    if (this.ui.profile === 'demo') this.map.overview();
    this.refresh(true);
    bindCollections(this.session, this.map, this.hud, () => this.refresh());
  }
  layout(cancelTools = true): void {
    this.deferredLayout.clear();
    if (cancelTools) this.hud.cancelTools();
    const v = this.hud.layout();
    this.map.layout(v.width, v.height, v.bottom, v.top, v.right, v.left);
  }
  tick(dt: number): void {
    this.map.tick();
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.elapsed = 0;
      this.refresh();
    }
  }
  suspend(): void {
    this.hud.cancelTools();
    this.tools.cancel();
    this.map.resetInput();
    this.hud.cancelGestures();
    this.session.suspend();
  }
  resume(): void {
    this.ui.repurposeId = null;
    this.hud.cancelTools();
    this.map.resetInput();
    this.hud.cancelGestures();
    this.session.resume();
    this.ui.resetArmed = false;
    this.refresh(true);
  }
  dispose(): void {
    this.session.setCollectionListener(null);
    this.hud.dispose();
    this.tools.dispose();
    this.map.dispose();
    this.drag.dispose();
    this.town.dispose();
  }
  private explain(text: string): void {
    this.session.message = text;
    this.ui.resetArmed = false;
    this.refresh();
  }
  private refresh(_models = false): void {
    const state = this.session.state;
    if (!tradeItems(state).includes(this.ui.tradeItem)) this.ui.tradeItem = 'vegetable';
    const layoutChanged = this.hud.render({
      inventory: state.inventory,
      tools: state.tools,
      summary: `${this.ui.profile === 'demo' ? '演示岛' : '我的小镇'} · 金币 ${state.coins}\n仓储 ${getUsedStorage(state)}/${getCapacity(state)}`,
      message: this.session.statusMessage,
      detail: description(this.session, this.ui),
      tab: this.ui.tab,
      actions: actions(this.session, this.ui, this.handlers),
      rotation: rotationAction(this.session, this.ui, this.handlers),
    });
    if (this.deferredLayout.update(layoutChanged, this.tools.active)) this.layout(false);
    this.town.sync(state, this.ui.selected, this.ui.preview);
  }
  private changeTab(tab: HudTab): void {
    this.ui.plantingTree = false;
    this.ui.cropShopOpen = false;
    this.ui.toolShopOpen = false;
    this.ui.selectedPile = null;
    this.ui.repurposeId = null;
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
    this.ui.plantingTree = false;
    this.ui.placing = kind;
    this.ui.preview = null;
    this.ui.selected = null;
    this.ui.resetArmed = false;
    this.session.message = '';
    this.refresh(true);
  }
  private cancel(): void {
    this.ui.plantingTree = false;
    this.ui.cropShopOpen = false;
    this.ui.toolShopOpen = false;
    this.ui.selectedPile = null;
    this.ui.repurposeId = null;
    this.ui.resetArmed = false;
    this.ui.placing = null;
    this.ui.preview = null;
    this.session.message = '已取消';
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
    this.ui.cropShopOpen = false;
    this.ui.toolShopOpen = false;
    this.ui.selectedPile = null;
    this.ui.repurposeId = null;
    this.ui.resetArmed = false;
    if (this.ui.plantingTree) {
      if (this.session.run({ type: 'placeTree', x, z })) this.ui.plantingTree = false;
      this.refresh();
      return;
    }
    if (this.ui.placing) {
      const reason = this.session.reason({ type: 'place', kind: this.ui.placing, x, z });
      this.ui.preview = { kind: this.ui.placing, x, z, valid: !reason };
      this.session.message = reason ?? '可建造';
    } else {
      const picked = this.town.pickBuilding(ray);
      const b = this.session.state.buildings.find((item) => item.id === picked);
      this.ui.selected = b?.id ?? null;
      const pile = this.town.pickStack(ray);
      if (!b && pile) this.ui.selectedPile = { x: pile.x, z: pile.z };
      this.ui.tab = 'manage';
      this.session.message = '';
    }
    this.refresh(true);
  }
  private save(): void {
    this.ui.resetArmed = false;
    if (this.session.mode === 'recovered') this.session.recover();
    else if (this.session.save()) this.session.message = '已保存';
    this.refresh();
  }
  private repurpose(): void {
    if (this.ui.repurposeId) {
      this.session.run({ type: 'repurposeToBoard', buildingId: this.ui.repurposeId });
      this.ui.repurposeId = null;
    } else this.ui.repurposeId = this.ui.selected;
    this.refresh();
  }
  private reset(): void {
    this.ui.repurposeId = null;
    if (!this.ui.resetArmed) {
      this.ui.resetArmed = true;
      this.ui.placing = null;
      this.ui.preview = null;
      this.session.message = '是否开始新小镇？';
      this.refresh(true);
      return;
    }
    if (this.session.reset()) {
      if (this.ui.profile === 'demo' && !this.session.message.includes('未保存'))
        this.session.message = '演示岛已恢复模板';
      this.ui.selected = null;
      this.ui.tab = 'manage';
      this.map.reset();
      if (this.ui.profile === 'demo') this.map.overview();
    }
    this.ui.resetArmed = false;
    this.refresh(true);
  }
}
