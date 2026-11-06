import { dropSnapshot } from '../application/DropSnapshot';
import { Node, Vec3 } from 'cc';
import type { geometry } from 'cc';
import { dropPosition, dropMovePlan, isCompostItem, footprint } from '../domain/game';
import type { Command, DropSnapshot } from '../domain/game';
import { dropShape } from '../application/DropGeometry';
import type { ProductDropSurface } from '../application/StackDrop';
import type { Point } from '../application/MapGesture';
import type { GameSession } from '../application/GameSession';
import type { UiState } from './UiContracts';
import type { TownView } from './TownView';
import { focusObject } from './UiContracts';
import { ModelFactory } from './ModelFactory';
/** Ground drops are movable physical goods, never forced through inventory. */
export class DropDrag {
  private readonly factory = new ModelFactory();
  private source: DropSnapshot | null = null;
  private invalid = false;
  private targets = new Map<string, string>();
  private ghost: Node | null = null;
  private marker: Node | null = null;
  private offset = { x: 0, z: 0 };
  private height = 0.45;
  constructor(
    private readonly parent: Node,
    private readonly session: GameSession,
    private readonly ui: UiState,
    private readonly town: TownView,
    private readonly refresh: () => void,
    private readonly products: ProductDropSurface,
  ) {}
  candidate(ray: geometry.Ray): string | null {
    if (
      this.ui.plantingTree ||
      this.ui.resetArmed ||
      this.ui.repurposeId ||
      this.session.mode !== 'normal'
    )
      return null;
    const id = this.town.pickDrop?.(ray),
      d = (this.session.state.looseDrops ?? []).find((d) => d.id === id),
      p = this.ground(ray);
    if (!d || !p) return null;
    const at = dropPosition(d);
    this.offset = { x: at.x - p.x, z: at.z - p.z };
    return `drop:${d.id}`;
  }
  move(key: string, point: Vec3, ray: geometry.Ray | null, screen: Point): void {
    const id = key.slice(5),
      d = (this.session.state.looseDrops ?? []).find((d) => d.id === id);
    if (this.source?.id !== id) {
      if (!d) return;
      this.clear(true);
      this.source = dropSnapshot(d);
      const shape = dropShape(d);
      this.ghost = new Node('LooseDropLift');
      const model = this.factory.asset(shape.asset, 'DroppedGoods');
      model.setScale(shape.scale, shape.scale, shape.scale);
      model.setPosition(-shape.x * shape.scale, 0, -shape.z * shape.scale);
      this.ghost.addChild(model);
      this.parent.addChild(this.ghost);
      this.height = Math.max(0.45, (this.town.dropOrigin(id)?.y ?? 0) + 0.25);
      this.town.setLiftedDrop(id);
    }
    this.ghost!.setPosition(point.x + this.offset.x, this.height, point.z + this.offset.z);
    const command = this.command(ray, screen),
      reason = this.invalid
        ? '地上物品已变化，请重新拖动'
        : command
          ? this.session.reason(command)
          : '位置不可用';
    this.products.highlightProductDrop(
      this.products.acceptsProductDrop(screen) ? screen : null,
      !reason,
    );
    this.marker?.destroy();
    this.marker = null;
    if (command?.type === 'moveDrop') {
      const target = command.target,
        at =
          target.type === 'ground'
            ? { x: target.x + 0.5, z: target.z + 0.5, y: 0.09 }
            : { ...dropPosition(target.drop), y: this.town.dropOrigin(target.drop.id)?.y ?? 0.09 };
      const span = target.type === 'ground' ? 0.95 : 0.3;
      this.marker = this.factory.shape(
        this.parent,
        'LooseDropTarget',
        at.x,
        at.y + 0.04,
        at.z,
        span,
        0.025,
        span,
        reason ? '#D87163' : '#EFD377',
      );
    }
    if (command?.type === 'depositCompost') {
      const b = this.session.state.buildings.find((b) => b.id === command.buildingId);
      if (b) {
        const size = footprint(b);
        this.marker = this.factory.shape(
          this.parent,
          'CompostDropTarget',
          b.x + size.width / 2,
          0.12,
          b.z + size.depth / 2,
          size.width,
          0.025,
          size.depth,
          reason ? '#D87163' : '#EFD377',
        );
      }
    }
    this.session.message = reason ?? this.hint(command!);
    this.refresh();
  }
  drop(key: string, ray: geometry.Ray | null, screen: Point): void {
    if (this.source?.id !== key.slice(5)) return;
    const command = this.command(ray, screen);
    if (command && !this.invalid && this.session.run(command)) {
      const target = command.type === 'moveDrop' ? command.target : null;
      focusObject(
        this.ui,
        target?.type === 'ground'
          ? { kind: 'pile', x: target.x, z: target.z }
          : target?.type === 'drop'
            ? { kind: 'drop', id: target.drop.id }
            : null,
      );
    } else if (!command)
      this.session.message = this.invalid ? '地上物品已变化，请重新拖动' : '已取消';
    this.clear(true);
    this.refresh();
  }
  private changed(): boolean {
    if (!this.source) return false;
    const d = (this.session.state.looseDrops ?? []).find((d) => d.id === this.source!.id);
    this.invalid ||= !d || JSON.stringify(dropSnapshot(d)) !== JSON.stringify(this.source);
    return this.invalid;
  }
  private observeTarget(key: string, snapshot: unknown): boolean {
    const encoded = JSON.stringify(snapshot),
      old = this.targets.get(key);
    if (old !== undefined && old !== encoded) this.invalid = true;
    this.targets.set(key, encoded);
    return !this.invalid;
  }
  private command(ray: geometry.Ray | null, screen: Point): Command | null {
    if (!this.source || this.changed()) return null;
    if (this.products.acceptsProductDrop(screen))
      return { type: 'pickupDrop', dropId: this.source.id };
    if (!ray) return null;
    const buildingId = this.town.pickBuilding(ray),
      b = this.session.state.buildings.find((b) => b.id === buildingId);
    if (b?.kind === 'compostBarrel' && isCompostItem(this.source.item))
      return {
        type: 'depositCompost',
        buildingId: b.id,
        quantity: this.source.amount,
        source: { type: 'drop', drop: { ...this.source } },
      };
    if (b)
      return ['warehouse', 'expandedWarehouse', 'coldWarehouse', 'transportWarehouse'].includes(
        b.kind,
      )
        ? { type: 'pickupDrop', dropId: this.source.id }
        : null;
    const id = this.town.pickDrop(ray),
      d = (this.session.state.looseDrops ?? []).find((d) => d.id === id);
    if (d) {
      const target = dropSnapshot(d);
      return d.id !== this.source.id && this.observeTarget(`drop:${d.id}`, target)
        ? { type: 'moveDrop', source: { ...this.source }, target: { type: 'drop', drop: target } }
        : null;
    }
    if (this.town.pickTree(ray) || this.town.pickNatural(ray)) return null;
    const pile = this.town.pickStack(ray),
      p = this.ground(ray);
    if (!p) return null;
    const x = pile?.x ?? Math.floor(p.x + this.offset.x),
      z = pile?.z ?? Math.floor(p.z + this.offset.z);
    const stack = this.session.state.groundStacks.find((s) => s.x === x && s.z === z);
    if (!this.observeTarget(`ground:${x}:${z}`, stack ?? null)) return null;
    return {
      type: 'moveDrop',
      source: { ...this.source },
      target: { type: 'ground', x, z, ...(stack ? { stack: { ...stack } } : {}) },
    };
  }
  private hint(c: Command): string {
    if (c.type === 'depositCompost') return `松手投入${c.quantity}份`;
    if (c.type === 'pickupDrop') return '松手收回仓库';
    if (c.type !== 'moveDrop') return '';
    const target = c.target.type === 'drop' ? c.target.drop : c.target.stack;
    if (!target) return '松手放到地上';
    const { transferAmount: amount, remaining: left } = dropMovePlan(this.session.state, c);
    return left ? `合并${amount}份 · 余下${left}份留原地` : `松手合并${amount}份`;
  }
  private ground(ray: geometry.Ray): Vec3 | null {
    if (Math.abs(ray.d.y) < 0.00001) return null;
    const t = -ray.o.y / ray.d.y;
    return t < 0 ? null : new Vec3(ray.o.x + ray.d.x * t, 0, ray.o.z + ray.d.z * t);
  }
  clear(silent = false): void {
    const active = !!this.source;
    this.town.setLiftedDrop?.(null);
    this.products.highlightProductDrop(null, false);
    this.ghost?.destroy();
    this.marker?.destroy();
    this.ghost = this.marker = null;
    this.source = null;
    this.invalid = false;
    this.targets.clear();
    if (active && !silent) {
      this.session.message = '已取消';
      this.refresh();
    }
  }
  dispose(): void {
    this.clear(true);
    this.factory.dispose();
  }
}
