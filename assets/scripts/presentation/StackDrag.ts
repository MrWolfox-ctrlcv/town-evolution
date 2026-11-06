import { dropSnapshot } from '../application/DropSnapshot';
import { Node, Vec3, geometry } from 'cc';
import type { Command, GroundStack } from '../domain/game';
import type { Point } from '../application/MapGesture';
import type { ProductDropSurface } from '../application/StackDrop';
import { stackDropCommand, stackDropHint, stackDropMarker } from '../application/StackDrop';
import type { GameSession } from '../application/GameSession';
import type { UiState } from './UiContracts';
import type { TownView } from './TownView';
import { ModelFactory } from './ModelFactory';
import { pileModel } from './PileModel';
import { focusObject } from './UiContracts';
/** A lifted pile remains in the authoritative save until release commits one atomic move. */
export class StackDrag {
  private readonly factory = new ModelFactory();
  private ghost: Node | null = null;
  private ring: Node | null = null;
  private source: (GroundStack & { id: string }) | null = null;
  private sourceInvalid = false;
  private offset = { x: 0, z: 0 };
  private targetKey = '';
  private dropTargets = new Map<string, string>();
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
    const pile = this.town.pickStack(ray),
      p = this.ground(ray);
    if (!pile || !p) return null;
    this.offset = { x: pile.x + 0.5 - p.x, z: pile.z + 0.5 - p.z };
    return pile.id;
  }
  move(id: string, point: Vec3, ray: geometry.Ray | null, screen: Point): void {
    const parts = id.split(':'),
      x = Number(parts[1]),
      z = Number(parts[2]);
    const pile = this.session.state.groundStacks.find((p) => p.x === x && p.z === z);
    if (this.source?.id !== id) {
      if (!pile) return;
      this.clear(true);
      this.source = { id, ...pile };
      this.ghost = pileModel(this.factory, pile, 'StackLift');
      this.parent.addChild(this.ghost);
      this.town.setLiftedStack(id);
    }
    this.ghost!.setPosition(point.x + this.offset.x, 0.12, point.z + this.offset.z);
    const changed = this.changedSource();
    const command = this.command(ray, screen),
      reason = changed
        ? '产品堆已变化，请重新拖动'
        : command
          ? this.session.reason(command)
          : '位置不可用';
    this.products.highlightProductDrop(
      this.products.acceptsProductDrop(screen) ? screen : null,
      !reason,
    );
    const key = JSON.stringify([command, reason]);
    if (key === this.targetKey) return;
    this.targetKey = key;
    this.ring?.destroy();
    this.ring = null;
    const marker = command ? stackDropMarker(this.session.state, command) : null;
    if (marker)
      this.ring = this.factory.shape(
        this.parent,
        'StackDropTarget',
        marker.x,
        command?.type === 'mergeStackIntoDrop'
          ? (this.town.dropOrigin(command.target.id)?.y ?? 0.09) + 0.04
          : 0.09,
        marker.z,
        marker.width,
        0.025,
        marker.depth,
        reason ? '#D87163' : '#EFD377',
      );
    this.session.message =
      this.source.item === 'mud' && !changed
        ? reason
          ? '暂不可用'
          : ''
        : (reason ?? stackDropHint(this.session.state, command!));
    if (command?.type === 'expandLand' && !reason && this.ring) {
      const preview = this.factory.asset('natural-block-grass', 'ReclaimedLandPreview');
      preview.setScale(1 / marker!.width, 1 / 0.025, 1 / marker!.depth);
      preview.setPosition(0, -40, 0);
      this.ring.addChild(preview);
    }
    this.refresh();
  }
  drop(id: string, ray: geometry.Ray | null, screen: Point): void {
    if (this.source?.id !== id) return;
    if (this.changedSource()) {
      this.session.message = '产品堆已变化，请重新拖动';
      this.clear(true);
      this.refresh();
      return;
    }
    const command = this.command(ray, screen);
    const mud =
      this.source &&
      this.session.state.groundStacks.some(
        (p) => p.x === this.source!.x && p.z === this.source!.z && p.item === 'mud',
      );
    if (command && this.session.run(command)) {
      focusObject(
        this.ui,
        command.type === 'moveStack'
          ? { kind: 'pile', x: command.x, z: command.z }
          : command.type === 'mergeStackIntoDrop'
            ? { kind: 'drop', id: command.target.id }
            : null,
      );
    } else if (!command) this.session.message = '已取消';
    else if (mud) this.session.message = '暂不可用';
    this.clear(true);
    this.refresh();
  }
  clear(silent = false): void {
    const active = this.source !== null;
    this.products.highlightProductDrop(null, false);
    this.town.setLiftedStack(null);
    this.ghost?.destroy();
    this.ring?.destroy();
    this.ghost = this.ring = null;
    this.source = null;
    this.sourceInvalid = false;
    this.targetKey = '';
    this.dropTargets.clear();
    if (active && !silent) {
      this.session.message = '已取消';
      this.refresh();
    }
  }
  /** An observed change invalidates this gesture even if the old quantity is later restored. */
  private changedSource(): boolean {
    if (!this.source) return false;
    const source = this.source;
    const pile = this.session.state.groundStacks.find((p) => p.x === source.x && p.z === source.z);
    this.sourceInvalid =
      this.sourceInvalid || !pile || pile.item !== source.item || pile.amount !== source.amount;
    return this.sourceInvalid;
  }
  private command(ray: geometry.Ray | null, screen: Point): Command | null {
    if (!this.source || this.changedSource()) return null;
    const source = { x: this.source.x, z: this.source.z };
    if (this.products.acceptsProductDrop(screen))
      return stackDropCommand(source, { kind: 'products' }, this.session.state);
    if (!ray) return null;
    const id = this.town.pickBuilding(ray);
    const building = this.session.state.buildings.find((b) => b.id === id);
    if (building)
      return stackDropCommand(source, { kind: 'building', building }, this.session.state);
    const dropId = this.town.pickDrop?.(ray),
      drop = (this.session.state.looseDrops ?? []).find((d) => d.id === dropId);
    if (drop) {
      const target = dropSnapshot(drop),
        key = JSON.stringify(target),
        previous = this.dropTargets.get(drop.id);
      this.dropTargets.set(drop.id, key);
      if (previous !== undefined && previous !== key) {
        this.sourceInvalid = true;
        return null;
      }
      return {
        type: 'mergeStackIntoDrop',
        source: {
          x: this.source.x,
          z: this.source.z,
          item: this.source.item,
          amount: this.source.amount,
        },
        target,
      };
    }
    if (this.town.pickTree(ray) || this.town.pickNatural(ray)) return null;
    const pile = this.town.pickStack(ray, this.source.id),
      point = this.ground(ray);
    return point
      ? stackDropCommand(
          source,
          {
            kind: 'ground',
            x: pile?.x ?? Math.round(point.x + this.offset.x - 0.5),
            z: pile?.z ?? Math.round(point.z + this.offset.z - 0.5),
          },
          this.session.state,
        )
      : null;
  }
  private ground(ray: geometry.Ray): Vec3 | null {
    if (Math.abs(ray.d.y) < 0.00001) return null;
    const t = -ray.o.y / ray.d.y;
    return t < 0 ? null : new Vec3(ray.o.x + ray.d.x * t, 0, ray.o.z + ray.d.z * t);
  }
  dispose(): void {
    this.clear(true);
    this.factory.dispose();
  }
}
