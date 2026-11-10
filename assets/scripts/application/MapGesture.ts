export interface Point {
  x: number;
  y: number;
  touch?: boolean;
}
interface Pointer {
  point: Point;
  ui: Point;
}
export interface MapGestureHandlers {
  candidate(point: Point): string | null;
  tap(point: Point): void;
  pan(from: Point, to: Point): void;
  pinch(from: Point, to: Point, ratio: number): void;
  drag(id: string, point: Point): void;
  drop(id: string, point: Point): void;
  cancel(): void;
}
/** Exclusive map gestures. A multi-touch sequence cannot become a tap or drop. */
export class MapGesture {
  private pointers = new Map<number, Pointer>();
  private mode: 'pending' | 'pan' | 'drag' | 'pinch' | 'blocked' = 'pending';
  private origin: Pointer | null = null;
  private candidate: string | null = null;
  private startedAt = 0;
  constructor(
    private readonly handlers: MapGestureHandlers,
    private readonly now: () => number = () => Date.now(),
  ) {}
  begin(id: number, point: Point, ui: Point): void {
    if (this.pointers.has(id)) return;
    this.pointers.set(id, { point: { ...point }, ui: { ...ui } });
    if (this.pointers.size === 1) {
      this.mode = 'pending';
      this.startedAt = this.now();
      this.origin = { point: { ...point }, ui: { ...ui } };
      this.candidate = this.handlers.candidate(point);
    } else {
      this.handlers.cancel();
      this.candidate = null;
      this.mode = this.pointers.size === 2 ? 'pinch' : 'blocked';
    }
  }
  get navigating(): boolean {
    return (
      this.pointers.size > 0 &&
      (this.mode === 'pan' || this.mode === 'pinch' || (this.mode === 'pending' && !this.candidate))
    );
  }
  get interacting(): boolean {
    return this.pointers.size > 0;
  }
  has(id: number): boolean {
    return this.pointers.has(id);
  }
  interrupt(): void {
    this.handlers.cancel();
    this.candidate = null;
    this.mode = 'blocked';
  }
  /** A missed release is cancellation, never a tap/drop. Held partners stay blocked. */
  discard(id: number): void {
    if (!this.pointers.delete(id)) return;
    this.handlers.cancel();
    this.candidate = null;
    this.origin = null;
    this.mode = this.pointers.size ? 'blocked' : 'pending';
  }
  move(id: number, point: Point, ui: Point): void {
    const old = this.pointers.get(id);
    if (!old) return;
    const before = [...this.pointers.values()].map((p) => p.point);
    this.pointers.set(id, { point: { ...point }, ui: { ...ui } });
    if (this.mode === 'blocked') return;
    if (this.mode === 'pinch') {
      const after = [...this.pointers.values()].map((p) => p.point);
      if (before.length !== 2 || after.length !== 2) return;
      const distance = (p: Point[]) => Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
      const center = (p: Point[]) => ({ x: (p[0]!.x + p[1]!.x) / 2, y: (p[0]!.y + p[1]!.y) / 2 });
      if (distance(before) > 1 && distance(after) > 1)
        this.handlers.pinch(center(before), center(after), distance(before) / distance(after));
      return;
    }
    let from = old.point;
    if (this.mode === 'pending') {
      if (!this.origin) return;
      const distance = Math.hypot(ui.x - this.origin.ui.x, ui.y - this.origin.ui.y);
      // A slow swipe must not become a long press while waiting for the next frame.
      // Cancel only the lift candidate; retain the existing 12px pan/tap threshold.
      if (distance > 4 && this.now() - this.startedAt < 400) this.candidate = null;
      if (distance <= 12) return;
      this.mode = this.candidate && this.now() - this.startedAt >= 400 ? 'drag' : 'pan';
      from = this.origin.point;
    }
    if (this.mode === 'drag' && this.candidate) this.handlers.drag(this.candidate, point);
    else if (this.mode === 'pan') this.handlers.pan(from, point);
  }
  poll(): void {
    if (
      this.mode !== 'pending' ||
      !this.candidate ||
      this.pointers.size !== 1 ||
      this.now() - this.startedAt < 400
    )
      return;
    this.mode = 'drag';
    this.handlers.drag(this.candidate, [...this.pointers.values()][0]!.point);
  }
  end(id: number, point: Point, ui: Point = point): void {
    if (!this.pointers.has(id)) return;
    // A delayed release must not turn an unobserved swipe into a tap or a new
    // long-press drop. Already-established drags keep their normal release path.
    if (
      this.mode === 'pending' &&
      this.origin &&
      Math.hypot(ui.x - this.origin.ui.x, ui.y - this.origin.ui.y) > 12
    )
      this.interrupt();
    this.poll();
    if (this.pointers.size === 1) {
      if (this.mode === 'pending') this.handlers.tap(point);
      else if (this.mode === 'drag' && this.candidate) this.handlers.drop(this.candidate, point);
    }
    this.pointers.delete(id);
    if (this.pointers.size) this.mode = 'blocked';
    else this.clear();
  }
  clear(): void {
    this.handlers.cancel();
    this.pointers.clear();
    this.origin = null;
    this.candidate = null;
    this.mode = 'pending';
  }
}
