import { Node, UITransform, Vec3, view } from 'cc';
import { uiNode } from './Widgets';
import { TrayIcons } from './TrayIcons';
import type { TrayKind } from './TrayIcons';
import {
  collectionSource,
  collectionPoint,
  startCollectionEffect,
} from '../application/CollectionPath';
import type { Point } from '../application/CollectionPath';
interface Reward {
  kind: TrayKind;
  source: Point;
  elapsed: number;
  unavailable: number;
}
interface Flight extends Reward {
  node: Node;
  running: boolean;
}
interface Target {
  point: Vec3 | null;
  available: boolean;
  failed: boolean;
}
const MAX_PENDING = 96;
const MAX_FLIGHTS = 24;
const UNAVAILABLE_SECONDS = 30;
/** Bounded visual-only batches wait for real targets, independently of committed inventory. */
export class CollectionFlights {
  private readonly root: Node;
  private readonly icons = new TrayIcons();
  private readonly pool: Flight[] = [];
  private readonly pending: Reward[] = [];
  private readonly served = new Map<TrayKind, number>();
  private turn = 0;
  private disposed = false;
  constructor(
    private readonly canvas: Node,
    private readonly destination: (kind: TrayKind) => Node | null,
    private readonly canShow: (kind: TrayKind) => boolean = () => false,
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
    const size = this.canvas.getComponent(UITransform)!.contentSize;
    // Capture the actual event origin once. A later layout must not reinterpret old pixels.
    const source = collectionSource(
      physical,
      view.getViewportRect(),
      { x: view.getScaleX(), y: view.getScaleY() },
      { x: size.width, y: size.height },
    );
    if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) return;
    this.enqueue({ kind, source, elapsed: 0, unavailable: 0 });
    this.flush(new Map());
  }
  update(dt: number): void {
    if (this.disposed || !Number.isFinite(dt) || dt < 0) return;
    // Resuming a hidden tab must not skip a newly visible reward in one large frame.
    const step = Math.min(dt, 0.1);
    const targets = new Map<TrayKind, Target>();
    for (let i = this.pending.length - 1; i >= 0; i--)
      if (this.expired(this.pending[i]!, targets, step)) this.pending.splice(i, 1);
    for (const flight of this.pool) {
      if (!flight.running) continue;
      try {
        const target = this.target(flight.kind, targets);
        flight.node.active = Boolean(target.point);
        if (this.expired(flight, targets, step)) this.release(flight);
        else if (target.point) {
          flight.elapsed += step;
          this.position(flight, target.point);
          if (flight.elapsed >= 0.76) this.release(flight);
        }
      } catch {
        // Delayed visual errors cannot interrupt the game or retain a poisoned pool slot.
        this.release(flight);
      }
    }
    this.flush(targets);
  }
  clear(): void {
    this.pending.length = 0;
    this.served.clear();
    this.turn = 0;
    for (const flight of this.pool) this.release(flight);
  }
  dispose(): void {
    this.clear();
    this.disposed = true;
    this.pool.length = 0;
    this.icons.dispose();
    this.root.destroy();
  }
  private enqueue(reward: Reward): void {
    if (this.pending.length >= MAX_PENDING) {
      // Under pressure merge visual batches of this kind, retaining the latest real source.
      // No quantity or gameplay event is modified; ordinary bursts remain distinct.
      let merge = this.pending.findIndex((entry) => entry.kind === reward.kind);
      if (merge < 0) {
        const counts = new Map<TrayKind, number>();
        for (const entry of this.pending) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
        // A newly arriving kind must not erase another kind's only retained feedback.
        merge = this.pending.findIndex((entry) => counts.get(entry.kind)! > 1);
      }
      this.pending.splice(Math.max(0, merge), 1);
    }
    this.pending.push(reward);
  }
  private expired(reward: Reward, targets: Map<TrayKind, Target>, step: number): boolean {
    const target = this.target(reward.kind, targets);
    // A hidden tray is temporary. Only a kind removed from its display list ages out.
    reward.unavailable = target.point || target.available ? 0 : reward.unavailable + step;
    return target.failed || reward.unavailable >= UNAVAILABLE_SECONDS;
  }
  private next(targets: Map<TrayKind, Target>): number {
    let next = -1;
    let oldest = Infinity;
    for (let i = 0; i < this.pending.length; ) {
      const reward = this.pending[i]!;
      const target = this.target(reward.kind, targets);
      if (target.failed) {
        this.pending.splice(i, 1);
        continue;
      }
      const turn = this.served.get(reward.kind) ?? 0;
      if (target.point && turn < oldest) {
        next = i;
        oldest = turn;
      }
      i++;
    }
    return next;
  }
  private flush(targets: Map<TrayKind, Target>): void {
    for (let i = this.next(targets); i >= 0; i = this.next(targets)) {
      const reward = this.pending.splice(i, 1)[0]!;
      let flight: Flight | null;
      try {
        flight = this.acquire(targets);
      } catch {
        // A failed allocation drops only this visual batch, never the game frame.
        continue;
      }
      if (!flight) {
        this.pending.unshift(reward);
        return;
      }
      Object.assign(flight, reward, { running: true });
      this.served.set(reward.kind, ++this.turn);
      try {
        startCollectionEffect(
          () => {
            this.icons.draw(flight.node, reward.kind, 30);
            this.position(flight, this.target(reward.kind, targets).point!);
            flight.node.active = true;
            this.root.setSiblingIndex(this.canvas.children.length - 1);
          },
          () => this.release(flight),
        );
      } catch {
        /* A failed visual batch is released, not retried each frame. */
      }
    }
  }
  private acquire(targets: Map<TrayKind, Target>): Flight | null {
    let flight = this.pool.find((entry) => !entry.running);
    if (!flight && this.pool.length < MAX_FLIGHTS) {
      const node = new Node('CollectedItem');
      try {
        node.layer = this.root.layer;
        this.root.addChild(node);
        node.addComponent(UITransform).setContentSize(32, 32);
      } catch (error) {
        node.destroy();
        throw error;
      }
      flight = {
        node,
        elapsed: 0,
        unavailable: 0,
        kind: 'vegetable',
        source: { x: 0, y: 0 },
        running: false,
      };
      this.pool.push(flight);
    }
    if (!flight) {
      flight = this.pool.find((entry) => !this.target(entry.kind, targets).point);
      if (flight) {
        // Hidden flights yield their slot without losing their actual source or progress.
        const { kind, source, elapsed, unavailable } = flight;
        this.enqueue({ kind, source, elapsed, unavailable });
        this.release(flight);
      }
    }
    return flight ?? null;
  }
  private target(kind: TrayKind, targets: Map<TrayKind, Target>): Target {
    if (!targets.has(kind)) {
      try {
        const node = this.destination(kind);
        const point = node?.activeInHierarchy
          ? this.canvas.getComponent(UITransform)!.convertToNodeSpaceAR(node.worldPosition)
          : null;
        targets.set(kind, {
          point,
          available: Boolean(point) || this.canShow(kind),
          failed: false,
        });
      } catch {
        targets.set(kind, { point: null, available: false, failed: true });
      }
    }
    return targets.get(kind)!;
  }
  private position(flight: Flight, target: Vec3): void {
    const progress = Math.min(1, flight.elapsed / 0.52);
    const point = collectionPoint(flight.source, target, progress);
    flight.node.setPosition(point.x, point.y);
    const pulse =
      flight.elapsed < 0.52
        ? 0
        : flight.elapsed < 0.62
          ? (flight.elapsed - 0.52) / 0.1
          : Math.max(0, (0.76 - flight.elapsed) / 0.14);
    const scale = progress < 1 ? 0.8 + progress * 0.2 : 1 + pulse * 0.28;
    flight.node.setScale(scale, scale, 1);
  }
  private release(flight: Flight): void {
    flight.running = false;
    flight.node.active = false;
  }
}
