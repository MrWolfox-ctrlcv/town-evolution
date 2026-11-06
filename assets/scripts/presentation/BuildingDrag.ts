import { terrainContact, buildingPreview } from './TerrainInteraction';
import { BuildingDragSelection } from '../application/BuildingDragSelection';
import { buildingMergePreview } from '../application/BuildingMergePreview';
import { buildingOutline } from './BuildingOutline';
import { Node, Vec3, geometry } from 'cc';
import type { Building, Command } from '../domain/game';
import { footprint, canMergeBuildings } from '../domain/game';
import type { GameSession } from '../application/GameSession';
import type { UiState } from './HudActions';
import type { TownView } from './TownView';
import { ModelFactory } from './ModelFactory';
import { focusObject } from './UiContracts';
/** Long-press lift is visual only. Movement or compatible merge commits on valid release. */
export class BuildingDrag {
  private readonly factory = new ModelFactory();
  private readonly selection = new BuildingDragSelection();
  private mergedGhost: Node | null = null;
  private ghost: Node | null = null;
  private ring: Node | null = null;
  private source: string | null = null;
  private offset = { x: 0, z: 0 };
  private targetKey = '';
  constructor(
    private readonly parent: Node,
    private readonly session: GameSession,
    private readonly ui: UiState,
    private readonly town: TownView,
    private readonly refresh: () => void,
  ) {}
  candidate(ray: geometry.Ray): string | null {
    if (
      this.ui.plantingTree ||
      this.ui.resetArmed ||
      this.ui.repurposeId ||
      this.session.mode !== 'normal'
    )
      return null;
    const id = this.town.pickBuilding(ray),
      b = this.session.state.buildings.find((item) => item.id === id);
    const p = this.ground(ray);
    if (!b || !p) return null;
    this.selection.begin(b);
    const f = footprint(b);
    this.offset = { x: b.x + f.width / 2 - p.x, z: b.z + f.depth / 2 - p.z };
    return b.id;
  }
  move(id: string, point: Vec3, ray: geometry.Ray | null): void {
    const b = this.session.state.buildings.find((item) => item.id === id);
    if (!b) {
      this.selection.check(this.session.state);
      this.mergedGhost?.destroy();
      this.ring?.destroy();
      this.mergedGhost = this.ring = null;
      if (this.ghost) this.ghost.active = false;
      this.session.message = '位置不可用';
      this.refresh();
      return;
    }
    if (this.source !== id) {
      const prepared = this.selection.sourceId === id;
      this.clear(true, true);
      if (!prepared) this.selection.begin(b);
      this.source = id;
      this.ghost = this.factory.building(
        b,
        Math.max(Date.now(), this.session.state.lastSeenAt),
        this.session.state.mapSeed,
        this.session.state.terrainVersion,
        this.session.state.landExtensions,
        b.baseElevation ?? 0,
      );
      this.ghost.name = 'BuildingLift';
      this.parent.addChild(this.ghost);
      this.town.setLifted(id);
    }
    this.ghost!.setPosition(
      point.x + this.offset.x,
      (this.session.state.terrainVersion === 6 ? point.y : 0) + 0.45,
      point.z + this.offset.z,
    );
    // Covered UI and off-map motion still move the lifted model, but cannot retain
    // a previous valid target or commit a command on release.
    const command = ray ? this.command(b, ray) : null;
    const reason = command ? this.session.reason(command) : '位置不可用';
    let plan: ReturnType<typeof buildingMergePreview> | null = null;
    if (command?.type === 'dragMerge' && !reason) {
      try {
        plan = buildingMergePreview(this.session.state, command);
      } catch {
        /* Invalid result has no ghost. */
      }
    }
    const key = JSON.stringify([command, reason]);
    if (key === this.targetKey) return;
    this.targetKey = key;
    this.ring?.destroy();
    this.ring = null;
    if (command?.type === 'moveBuilding')
      this.highlight(
        buildingPreview(this.session.state, { ...b, x: command.x, z: command.z }),
        reason ? '#D87163' : '#EFD377',
      );
    else if (command?.type === 'dragMerge') {
      const target = this.session.state.buildings.find((item) => item.id === command.targetId);
      if (target) this.highlight(plan?.building ?? target, reason ? '#D87163' : '#EFD377');
    }
    this.mergedGhost?.destroy();
    this.mergedGhost = null;
    this.ghost!.active = true;
    if (plan?.building.kind === 'woodenBridge') {
      this.mergedGhost = this.factory.building(
        plan.building,
        Math.max(Date.now(), this.session.state.lastSeenAt),
        this.session.state.mapSeed,
        this.session.state.terrainVersion,
        this.session.state.landExtensions,
        plan.building.baseElevation ?? 0,
      );
      this.mergedGhost.name = 'BridgeMergePreview';
      this.parent.addChild(this.mergedGhost);
      this.ghost!.active = false;
    }
    this.session.message =
      reason ?? (plan ? (plan.cost ? `松手合体 · ${plan.cost}币` : '松手合成') : '松手移动');
    this.refresh();
  }
  drop(id: string, ray: geometry.Ray | null): void {
    if (this.source !== id) return;
    const b = this.session.state.buildings.find((item) => item.id === id);
    const command = b && ray ? this.command(b, ray) : null;
    if (command) {
      let retainedId = id;
      if (command.type === 'dragMerge') {
        try {
          retainedId = buildingMergePreview(this.session.state, command).retainedId;
        } catch {
          /* run reports rejection. */
        }
      }
      if (this.session.run(command)) focusObject(this.ui, { kind: 'building', id: retainedId });
    } else this.session.message = '已取消';
    this.clear(true);
    this.refresh();
  }
  clear(silent = false, preserveSelection = false): void {
    const wasActive = this.source !== null;
    this.town.setLifted(null);
    this.ghost?.destroy();
    this.mergedGhost?.destroy();
    this.mergedGhost = null;
    if (!preserveSelection) this.selection.clear();
    this.ring?.destroy();
    this.ghost = this.ring = null;
    this.source = null;
    this.targetKey = '';
    if (wasActive && !silent) {
      this.session.message = '已取消';
      this.refresh();
    }
  }
  private command(b: Building, ray: geometry.Ray): Command | null {
    if (!this.selection.check(this.session.state)) return null;
    const targetId = this.town.pickBuilding(ray, b.id),
      target = this.session.state.buildings.find((item) => item.id === targetId);
    if (b.kind === 'woodenPier' && target?.kind === 'woodenPier') {
      const sources = this.selection.pair(this.session.state, target);
      return sources ? { type: 'dragMerge', sourceId: b.id, targetId: target.id, sources } : null;
    }
    if (this.selection.hasTarget) return null;
    if (target && canMergeBuildings(b.kind, target.kind))
      return { type: 'dragMerge', sourceId: b.id, targetId: target.id };
    if (this.town.pickTree(ray) || this.town.pickNatural(ray) || this.town.pickDrop?.(ray))
      return null;
    const p = this.ground(ray);
    if (!p) return null;
    const f = footprint(b);
    return {
      type: 'moveBuilding',
      buildingId: b.id,
      ...(b.kind === 'woodenBridge'
        ? { source: this.selection.movement(this.session.state)! }
        : {}),
      x: Math.round(p.x + this.offset.x - f.width / 2),
      z: Math.round(p.z + this.offset.z - f.depth / 2),
    };
  }
  private ground(ray: geometry.Ray): Vec3 | null {
    if (this.session.state.terrainVersion === 6) return terrainContact(this.town, ray);
    if (Math.abs(ray.d.y) < 0.00001) return null;
    const t = -ray.o.y / ray.d.y;
    return t < 0 ? null : new Vec3(ray.o.x + ray.d.x * t, 0, ray.o.z + ray.d.z * t);
  }
  private highlight(b: Building, shade: string): void {
    this.ring = buildingOutline(
      this.parent,
      this.factory,
      b,
      shade,
      'BuildingDropTarget',
      (b.baseElevation ?? 0) + 0.12,
    );
  }
  dispose(): void {
    this.clear(true);
    this.factory.dispose();
  }
}
