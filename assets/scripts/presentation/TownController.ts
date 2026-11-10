import { V6TownNavigation } from './V6TownNavigation';
import { terrainContact } from './TerrainInteraction';
import { streamTownFrame } from './TownStreamingFrame';
import { townUiActions } from './TownUiActions';
import { materialQuantity } from '../application/MaterialQuantity';
import { objectTarget, pickObject } from './ObjectContext';
import { boundsCorners, setObjectSelection } from '../application/ObjectSelection';
import { Node, geometry } from 'cc';
import { getCapacity, getUsedStorage, type Command } from '../domain/game';
import { profileLabel, type TownProfile } from '../application/TownProfiles';
import { bindCollections } from './CollectionBinding';
import type { GameSession } from '../application/GameSession';
import { TownView } from './TownView';
import { TownHUD, type HudTab } from './TownHUD';
import { ToolRouter } from './ToolRouter';
import { description } from './HudDescription';
import { DeferredLayout } from '../application/DeferredLayout';
import { profileFrame } from '../application/ProfileFraming';
import { tradeItems } from '../application/CommerceSelection';
import { ObjectDrag } from './ObjectDrag';
import { MapCamera } from './MapCamera';
import { actions, rotationAction, type UiHandlers } from './HudActions';
import { createUiState } from './UiContracts';
export class TownController {
  private readonly session: GameSession;
  private readonly ui = createUiState();
  private readonly hud: TownHUD;
  private readonly map: MapCamera;
  private readonly drag: ObjectDrag;
  private readonly tools: ToolRouter;
  private readonly town: TownView;
  private readonly handlers: UiHandlers;
  private elapsed = 0;
  private readonly v6Navigation: V6TownNavigation | null;
  private readonly deferredLayout = new DeferredLayout();
  constructor(
    parent: Node,
    session: GameSession,
    profile: TownProfile = 'normal',
    switchProfile?: (profile: TownProfile) => void,
    menu?: (action: 'settings' | 'saves' | 'exit') => void,
  ) {
    this.session = session;
    this.ui.profile = profile;
    this.hud = new TownHUD(
      parent,
      (text) => this.explain(text),
      (tab) => this.changeTab(tab),
      menu ? () => menu('settings') : undefined,
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
    this.map = new MapCamera(
      parent,
      this.hud.mapInput,
      {
        covered: (point) => this.hud.coversMapPoint(point),
        tap: (point, ray) => this.pick(point.x, point.z, ray),
        candidate: (ray) => this.drag.candidate(ray),
        drag: (id, point, ray, screen) => this.drag.move(id, point, ray, screen),
        drop: (id, ray, screen) => this.drag.drop(id, ray, screen),
        cancel: () => this.drag.clear(),
        ...(session.state.terrainVersion === 6 || session.state.terrainVersion === 7
          ? { ground: (ray: geometry.Ray) => terrainContact(this.town, ray) }
          : {}),
      },
      this.session.state.terrainVersion,
    );
    this.tools = new ToolRouter(parent, this.session, this.map, this.town, this.ui, () =>
      this.refresh(),
    );
    this.hud.setToolHandlers(this.tools);
    this.v6Navigation =
      session.state.terrainVersion === 6 || session.state.terrainVersion === 7
        ? new V6TownNavigation(
            this.hud,
            this.map,
            this.town,
            () => this.cancelInput(),
            () => this.tools.active,
          )
        : null;
    this.handlers = {
      command: (command) => this.run(command),
      cancel: () => this.cancel(),
      zoom: (delta) => {
        this.ui.resetArmed = false;
        this.map.zoomBy(delta);
        this.refresh();
      },
      overview: () => {
        if (this.v6Navigation) return this.v6Navigation.overview();
        this.cancelInput();
        this.hud.closeDetails();
        this.map.overview();
        this.refresh();
      },
      save: () => this.save(),
      reset: () => this.reset(),
      ...(menu ? { openSaves: () => menu('saves'), exitToTitle: () => menu('exit') } : {}),
      ...townUiActions(
        this.session,
        this.ui,
        this.hud,
        () => this.refresh(),
        () => this.cancelInput(),
        switchProfile,
      ),
      repurpose: () => this.repurpose(),
    };
    this.layout();
    this.map.reset(session.state.terrainVersion, profileFrame(profile, session.state));
    if (profile === 'v5-preview') this.map.overview();
    this.refresh(true);
    bindCollections(this.session, this.map, this.hud, () => this.refresh(), this.town);
  }
  layout(cancelTools = true): void {
    this.deferredLayout.clear();
    if (cancelTools) this.hud.cancelTools();
    const v = this.hud.layout();
    this.map.layout(v.width, v.height, v.bottom, 0, v.right, v.left);
  }
  tick(dt: number): void {
    this.hud.tick(dt);
    this.map.tick();
    streamTownFrame(this.session.state.terrainVersion, this.map, this.town);
    if (
      (this.session.state.terrainVersion === 6 || this.session.state.terrainVersion === 7) &&
      !this.tools.checkTerrainGesture()
    )
      this.cancelInput();
    this.v6Navigation?.tick();
    this.projectSelection();
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.elapsed = 0;
      this.tools.updateHint();
      this.refresh();
    }
  }
  setMenuOverlay(open: boolean): void {
    this.hud.setVisible(!open);
  }
  openTownActions(): void {
    this.hud.openDetails();
    this.changeTab('tools');
  }
  private projectSelection(): void {
    const target = objectTarget(this.session, this.ui);
    const bounds = target ? this.town.objectBounds(target) : null;
    this.hud.projectObject(
      bounds ? boundsCorners(bounds).map((point) => this.map.project(point)) : [],
      this.map.interacting || this.tools.active,
    );
  }
  cancelInput(): void {
    this.hud.cancelTools();
    this.tools.cancel();
    this.map.resetInput();
    this.hud.cancelGestures();
  }
  suspend(): void {
    this.cancelInput();
    this.session.suspend();
  }
  resume(): void {
    this.ui.repurposeId = null;
    this.cancelInput();
    this.session.resume();
    this.ui.resetArmed = false;
    this.refresh(true);
  }
  dispose(): void {
    this.v6Navigation?.dispose();
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
      state,
      inventory: state.inventory,
      tools: state.tools,
      summary: `${profileLabel(this.ui.profile)} · 金币 ${state.coins}\n仓储 ${materialQuantity(getUsedStorage(state))}/${getCapacity(state)}`,
      message: this.town.surfaceProblem ?? this.session.statusMessage,
      detail: description(this.session, this.ui, this.town.loading),
      contextHeading: this.ui.cropShopOpen || this.ui.toolShopOpen,
      tab: this.ui.tab,
      target: objectTarget(this.session, this.ui),
      actions: actions(this.session, this.ui, this.handlers),
      rotation: rotationAction(this.session, this.ui, this.handlers),
    });
    if (this.deferredLayout.update(layoutChanged, this.tools.active)) this.layout(false);
    this.town.sync(state, this.ui.selected, null);
    this.projectSelection();
  }
  private changeTab(tab: HudTab): void {
    this.ui.plantingTree = false;
    this.ui.cropShopOpen = false;
    this.ui.toolShopOpen = false;
    setObjectSelection(this.ui, null);
    this.ui.repurposeId = null;
    this.ui.moreBuildingActions = false;
    this.ui.tab = tab;
    this.ui.resetArmed = false;
    this.refresh(true);
  }
  private run(command: Command): void {
    this.ui.resetArmed = false;
    this.session.run(command);
    this.refresh(true);
  }
  private cancel(): void {
    this.ui.plantingTree = false;
    this.ui.cropShopOpen = false;
    this.ui.toolShopOpen = false;
    setObjectSelection(this.ui, null);
    this.ui.repurposeId = null;
    this.ui.resetArmed = false;
    this.session.message = '已取消';
    this.refresh(true);
  }
  private pick(x: number, z: number, ray: geometry.Ray): void {
    this.hud.openDetails();
    this.ui.cropShopOpen = false;
    this.ui.toolShopOpen = false;
    setObjectSelection(this.ui, null);
    this.ui.repurposeId = null;
    this.ui.resetArmed = false;
    if (this.ui.plantingTree) {
      if (this.session.run({ type: 'placeTree', x, z })) this.ui.plantingTree = false;
      this.refresh();
      return;
    }
    pickObject(this.ui, this.town, ray);
    this.ui.moreBuildingActions = false;
    this.ui.tab = 'manage';
    this.session.message = '';
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
      this.session.message = `是否重置${profileLabel(this.ui.profile)}？`;
      this.refresh(true);
      return;
    }
    if (this.session.reset()) {
      this.hud.clearCollections();
      if (this.ui.profile === 'demo' && !this.session.message.includes('未保存'))
        this.session.message = '演示岛已恢复模板';
      setObjectSelection(this.ui, null);
      this.ui.tab = 'manage';
      this.map.reset(
        this.session.state.terrainVersion,
        profileFrame(this.ui.profile, this.session.state),
      );
      if (this.ui.profile === 'v5-preview') this.map.overview();
      this.v6Navigation?.reset();
    }
    this.ui.resetArmed = false;
    this.refresh(true);
  }
}
