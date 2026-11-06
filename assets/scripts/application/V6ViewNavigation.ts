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
  private overviewVisible = false;
  private disposed = false;
  constructor(private readonly port: V6NavigationPort) {}
  update(overviewVisible: boolean, userInteracting = false): void {
    if (this.disposed) return;
    this.overviewVisible = overviewVisible;
    if (userInteracting) this.pendingOverview = false;
    if (!this.pendingOverview || !overviewVisible) return;
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
    if (this.overviewVisible) this.update(true);
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
