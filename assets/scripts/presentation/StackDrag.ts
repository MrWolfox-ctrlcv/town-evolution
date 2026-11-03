import { Node, Vec3, geometry } from 'cc';
import type { Command } from '../domain/game';
import type { Point } from '../application/MapGesture';
import type { ProductDropSurface } from '../application/StackDrop';
import { stackDropCommand, stackDropHint, stackDropMarker } from '../application/StackDrop';
import type { GameSession } from '../application/GameSession';
import type { UiState } from './UiContracts';
import type { TownView } from './TownView';
import { ModelFactory } from './ModelFactory';
import { pileModel } from './PileModel';
/** A lifted pile remains in the authoritative save until release commits one atomic move. */
export class StackDrag {
  private readonly factory = new ModelFactory();
  private ghost: Node | null = null;
  private ring: Node | null = null;
  private source: { id: string; x: number; z: number } | null = null;
  private offset = { x: 0, z: 0 };
  private targetKey = '';
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
      this.ui.placing ||
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
    if (!pile) return;
    if (this.source?.id !== id) {
      this.clear(true);
      this.source = { id, x, z };
      this.ghost = pileModel(this.factory, pile, 'StackLift');
      this.parent.addChild(this.ghost);
      this.town.setLiftedStack(id);
    }
    this.ghost!.setPosition(point.x + this.offset.x, 0.12, point.z + this.offset.z);
    const command = this.command(ray, screen),
      reason = command ? this.session.reason(command) : '位置不可用';
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
        0.09,
        marker.z,
        marker.width,
        0.025,
        marker.depth,
        reason ? '#D87163' : '#EFD377',
      );
    this.session.message = reason ?? stackDropHint(this.session.state, command!);
    this.refresh();
  }
  drop(_id: string, ray: geometry.Ray | null, screen: Point): void {
    const command = this.command(ray, screen);
    if (command && this.session.run(command)) {
      this.ui.selected = null;
      this.ui.selectedPile = command.type === 'moveStack' ? { x: command.x, z: command.z } : null;
    } else if (!command) this.session.message = '已取消';
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
    this.targetKey = '';
    if (active && !silent) {
      this.session.message = '已取消';
      this.refresh();
    }
  }
  private command(ray: geometry.Ray | null, screen: Point): Command | null {
    if (!this.source) return null;
    if (this.products.acceptsProductDrop(screen))
      return stackDropCommand(this.source, { kind: 'products' });
    if (!ray) return null;
    const id = this.town.pickBuilding(ray);
    const building = this.session.state.buildings.find((b) => b.id === id);
    if (building) return stackDropCommand(this.source, { kind: 'building', building });
    if (this.town.pickTree(ray)) return null;
    const pile = this.town.pickStack(ray, this.source.id),
      point = this.ground(ray);
    return point
      ? stackDropCommand(this.source, {
          kind: 'ground',
          x: pile?.x ?? Math.round(point.x + this.offset.x - 0.5),
          z: pile?.z ?? Math.round(point.z + this.offset.z - 0.5),
        })
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
