/** A lease owns one reference, and releasing it twice has no effect. */
export interface ResourceLease<T> {
  readonly value: T;
  release(): void;
}
/** Lazily creates one resource for all current users; the last release destroys it. */
export class SharedResource<T extends { dispose(): void }> {
  private current: { value: T; users: number } | null = null;
  constructor(private readonly create: () => T) {}
  acquire(): ResourceLease<T> {
    const entry = this.current ?? { value: this.create(), users: 0 };
    this.current = entry;
    entry.users++;
    let released = false;
    return {
      value: entry.value,
      release: () => {
        if (released) return;
        released = true;
        if (--entry.users !== 0) return;
        if (this.current === entry) this.current = null;
        entry.value.dispose();
      },
    };
  }
}
