import { Node, UITransform, Vec3, Tween, tween, view } from 'cc';
import { uiNode } from './Widgets';
import { TrayIcons } from './TrayIcons';
import type { TrayKind } from './TrayIcons';
import {
  collectionSource,
  collectionPoint,
  startCollectionEffect,
} from '../application/CollectionPath';
import type { Point } from '../application/CollectionPath';
interface Flight {
  node: Node;
  clock: { progress: number; pulse: number };
  kind: TrayKind;
  source: Point;
  running: boolean;
}
/** Purely visual feedback: one icon per committed quantity batch; no business state writes. */
export class CollectionFlights {
  private readonly root: Node;
  private readonly icons = new TrayIcons();
  private readonly pool: Flight[] = [];
  private disposed = false;
  constructor(
    private readonly canvas: Node,
    private readonly destination: (kind: TrayKind) => Node | null,
  ) {
    this.root = uiNode('CollectionFlights', canvas);
  }
  collect(kind: TrayKind, amount: number, physical: Point): void {
    if (
      this.disposed ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(physical.x) ||
      !Number.isFinite(physical.y)
    )
      return;
    if (!this.destination(kind)) return;
    const viewport = view.getViewportRect();
    const size = this.canvas.getComponent(UITransform)!.contentSize;
    const source = collectionSource(
      physical,
      viewport,
      { x: view.getScaleX(), y: view.getScaleY() },
      { x: size.width, y: size.height },
    );
    const flight = this.acquire(kind, source);
    startCollectionEffect(
      () => {
        this.icons.draw(flight.node, kind, 30);
        flight.node.setPosition(source.x, source.y);
        flight.node.setScale(0.8, 0.8, 1);
        flight.node.active = true;
        this.root.setSiblingIndex(this.canvas.children.length - 1);
        tween(flight.clock)
          .to(0.52, { progress: 1 }, { onUpdate: () => this.position(flight) })
          .to(0.1, { pulse: 1 }, { onUpdate: () => this.pulse(flight) })
          .to(0.14, { pulse: 0 }, { onUpdate: () => this.pulse(flight) })
          .call(() => this.release(flight))
          .start();
      },
      () => {
        Tween?.stopAllByTarget(flight.clock);
        this.release(flight);
      },
    );
  }
  dispose(): void {
    this.disposed = true;
    for (const flight of this.pool) Tween?.stopAllByTarget(flight.clock);
    this.pool.length = 0;
    this.icons.dispose();
    this.root.destroy();
  }
  private acquire(kind: TrayKind, source: Point): Flight {
    let flight = this.pool.find((entry) => !entry.running);
    if (!flight && this.pool.length < 24) {
      const node = uiNode('CollectedItem', this.root);
      node.getComponent(UITransform)!.setContentSize(32, 32);
      flight = { node, clock: { progress: 0, pulse: 0 }, kind, source, running: false };
      this.pool.push(flight);
    }
    if (!flight) {
      // Rapid sweeps are bounded: recycle the icon already closest to its destination.
      flight = this.pool.reduce((a, b) => (a.clock.progress > b.clock.progress ? a : b));
      Tween?.stopAllByTarget(flight.clock);
    }
    flight.kind = kind;
    flight.source = source;
    flight.running = true;
    flight.clock.progress = 0;
    flight.clock.pulse = 0;
    return flight;
  }
  private target(flight: Flight): Vec3 | null {
    const node = this.destination(flight.kind);
    return node?.activeInHierarchy
      ? this.canvas.getComponent(UITransform)!.convertToNodeSpaceAR(node.worldPosition)
      : null;
  }
  private position(flight: Flight): void {
    const target = this.target(flight);
    if (!target) {
      flight.node.active = false;
      return;
    }
    flight.node.active = true;
    const point = collectionPoint(flight.source, target, flight.clock.progress);
    flight.node.setPosition(point.x, point.y);
    const scale = 0.8 + flight.clock.progress * 0.2;
    flight.node.setScale(scale, scale, 1);
  }
  private pulse(flight: Flight): void {
    this.position(flight);
    const scale = 1 + flight.clock.pulse * 0.28;
    flight.node.setScale(scale, scale, 1);
  }
  private release(flight: Flight): void {
    flight.running = false;
    flight.node.active = false;
  }
}
