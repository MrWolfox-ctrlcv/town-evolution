/** One-pointer gesture gate. Secondary fingers cannot reset or complete the primary gesture. */
export class TapGesture {
  private active: number | null = null;
  private origin = { x: 0, y: 0 };
  private dragging = false;

  begin(id: number, point: { x: number; y: number }): boolean {
    if (this.active !== null) return false;
    this.active = id;
    this.origin = { ...point };
    this.dragging = false;
    return true;
  }

  move(id: number, point: { x: number; y: number }): boolean {
    if (id !== this.active) return false;
    if (Math.hypot(point.x - this.origin.x, point.y - this.origin.y) > 12) this.dragging = true;
    return this.dragging;
  }

  end(id: number): boolean {
    if (id !== this.active) return false;
    const isTap = !this.dragging;
    this.cancel();
    return isTap;
  }

  cancel(id?: number): void {
    if (id !== undefined && id !== this.active) return;
    this.active = null;
    this.dragging = false;
  }
}
