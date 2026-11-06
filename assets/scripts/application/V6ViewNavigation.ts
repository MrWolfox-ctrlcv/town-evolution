export interface V6NavigationPort {
  cancelInput(): void;
  closeDetails(): void;
  home(): void;
  overview(): void;
  zoom(delta: number): void;
}
/** View-only intent. A requested overview never exposes an unready distant surface. */
export class V6ViewNavigation {
  private pendingOverview = true;
  private overviewReady = false;
  private disposed = false;
  constructor(private readonly port: V6NavigationPort) {}
  update(overviewReady: boolean, userInteracting = false): void {
    if (this.disposed) return;
    this.overviewReady = overviewReady;
    if (userInteracting) this.pendingOverview = false;
    if (!this.pendingOverview || !overviewReady) return;
    this.pendingOverview = false;
    this.prepare();
    this.port.overview();
  }
  home(): void {
    if (this.disposed) return;
    this.pendingOverview = false;
    this.prepare();
    this.port.home();
  }
  overview(): void {
    if (this.disposed) return;
    this.pendingOverview = true;
    if (this.overviewReady) this.update(true);
    else this.prepare();
  }
  zoom(delta: number): void {
    if (this.disposed || !Number.isFinite(delta)) return;
    this.pendingOverview = false;
    this.prepare();
    this.port.zoom(delta);
  }
  get awaitingOverview(): boolean {
    return this.pendingOverview && !this.disposed;
  }
  private prepare(): void {
    this.port.cancelInput();
    this.port.closeDetails();
  }
  dispose(): void {
    this.disposed = true;
    this.pendingOverview = false;
  }
}
