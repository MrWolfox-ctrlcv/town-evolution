import { Node, Vec3, geometry } from 'cc';
import type { Building, Command } from '../domain/game';
import { footprint, CONFIG } from '../domain/game';
import type { GameSession } from '../application/GameSession';
import type { UiState } from './HudActions';
import type { TownView } from './TownView';
import { ModelFactory } from './ModelFactory';
/** Long-press lift is visual only. Movement or compatible merge commits on valid release. */
export class BuildingDrag {
  private readonly factory = new ModelFactory();
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
      this.ui.placing ||
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
    const f = footprint(b);
    this.offset = { x: b.x + f.width / 2 - p.x, z: b.z + f.depth / 2 - p.z };
    return b.id;
  }
  move(id: string, point: Vec3, ray: geometry.Ray): void {
    const b = this.session.state.buildings.find((item) => item.id === id);
    if (!b) return;
    if (this.source !== id) {
      this.clear(true);
      this.source = id;
      this.ghost = this.factory.building(
        b,
        Math.max(Date.now(), this.session.state.lastSeenAt),
        this.session.state.mapSeed,
      );
      this.ghost.name = 'BuildingLift';
      this.parent.addChild(this.ghost);
      this.town.setLifted(id);
    }
    this.ghost!.setPosition(point.x + this.offset.x, 0.45, point.z + this.offset.z);
    const command = this.command(b, ray);
    const reason = command ? this.session.reason(command) : '位置不可用';
    const key = JSON.stringify([command, reason]);
    if (key === this.targetKey) return;
    this.targetKey = key;
    this.ring?.destroy();
    this.ring = null;
    if (command?.type === 'moveBuilding')
      this.highlight({ ...b, x: command.x, z: command.z }, reason ? '#D87163' : '#EFD377');
    else if (command?.type === 'dragMerge') {
      const target = this.session.state.buildings.find((item) => item.id === command.targetId);
      if (target) this.highlight(target, reason ? '#D87163' : '#EFD377');
    }
    this.session.message =
      reason ?? (command?.type === 'dragMerge' ? `松手合体 · ${CONFIG.combineCost}币` : '松手移动');
    this.refresh();
  }
  drop(id: string, ray: geometry.Ray | null): void {
    const b = this.session.state.buildings.find((item) => item.id === id);
    const command = b && ray ? this.command(b, ray) : null;
    if (command) {
      const warehouse =
        command.type === 'dragMerge'
          ? this.session.state.buildings.find(
              (item) =>
                (item.id === id || item.id === command.targetId) && item.kind === 'warehouse',
            )
          : null;
      if (this.session.run(command)) this.ui.selected = warehouse?.id ?? id;
    } else this.session.message = '已取消';
    this.clear(true);
    this.refresh();
  }
  clear(silent = false): void {
    const wasActive = this.source !== null;
    this.town.setLifted(null);
    this.ghost?.destroy();
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
    const targetId = this.town.pickBuilding(ray, b.id),
      target = this.session.state.buildings.find((item) => item.id === targetId);
    if (
      target &&
      ((b.kind === 'cooler' && target.kind === 'warehouse') ||
        (b.kind === 'warehouse' && target.kind === 'cooler'))
    )
      return { type: 'dragMerge', sourceId: b.id, targetId: target.id };
    const p = this.ground(ray);
    if (!p) return null;
    const f = footprint(b);
    return {
      type: 'moveBuilding',
      buildingId: b.id,
      x: Math.round(p.x + this.offset.x - f.width / 2),
      z: Math.round(p.z + this.offset.z - f.depth / 2),
    };
  }
  private ground(ray: geometry.Ray): Vec3 | null {
    if (Math.abs(ray.d.y) < 0.00001) return null;
    const t = -ray.o.y / ray.d.y;
    return t < 0 ? null : new Vec3(ray.o.x + ray.d.x * t, 0, ray.o.z + ray.d.z * t);
  }
  private highlight(b: Building, shade: string): void {
    const { width: w, depth: d } = footprint(b);
    this.ring = new Node('BuildingDropTarget');
    this.parent.addChild(this.ring);
    this.ring.setPosition(b.x + w / 2, 0.12, b.z + d / 2);
    for (const side of [-1, 1]) {
      this.factory.shape(this.ring, 'Edge', 0, 0, (side * d) / 2, w + 0.1, 0.08, 0.1, shade);
      this.factory.shape(this.ring, 'Edge', (side * w) / 2, 0, 0, 0.1, 0.08, d, shade);
    }
  }
  dispose(): void {
    this.clear(true);
    this.factory.dispose();
  }
}
