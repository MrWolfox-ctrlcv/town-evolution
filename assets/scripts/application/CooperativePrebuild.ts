/** CPU-only work between render frames. One completed transaction is the backpressure limit. */
export class CooperativePrebuild {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private error: unknown = null;
  constructor(private readonly advance: () => boolean) {}
  start(): void {
    if (this.timer !== null || this.error) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        if (!this.advance()) this.start();
      } catch (error) {
        this.error = error;
      }
    }, 4);
  }
  check(): void {
    if (this.error) {
      const error = this.error;
      this.error = null;
      throw error;
    }
  }
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.error = null;
  }
}
