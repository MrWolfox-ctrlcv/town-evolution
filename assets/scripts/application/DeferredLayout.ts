/** Coalesce geometry changes while a drag uses the current screen-to-world transform. */
export class DeferredLayout {
  private pending = false;
  update(changed: boolean, locked: boolean): boolean {
    this.pending ||= changed;
    if (locked || !this.pending) return false;
    this.pending = false;
    return true;
  }
  clear(): void {
    this.pending = false;
  }
}
