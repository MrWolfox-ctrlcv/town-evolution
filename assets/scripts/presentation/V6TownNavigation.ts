import { V6ViewNavigation } from '../application/V6ViewNavigation';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
import type { TownHUD } from './TownHUD';
/** All-island startup is gated by a real published distant surface, never a placeholder. */
export class V6TownNavigation {
  private readonly navigation: V6ViewNavigation;
  private lastPhase = '';
  private lastProblem: string | null = null;
  constructor(
    private readonly hud: TownHUD,
    private readonly map: MapCamera,
    private readonly town: TownView,
    private readonly cancelInput: () => void,
    private readonly toolActive: () => boolean,
  ) {
    this.navigation = new V6ViewNavigation({
      cancelInput,
      closeDetails: () => hud.closeDetails(),
      home: () => map.reset(6),
      overview: () => map.overview(),
      zoom: (delta) => map.zoomBy(delta),
    });
    hud.setTerrainNavigation({
      home: () => this.navigation.home(),
      overview: () => this.navigation.overview(),
      zoom: (delta) => this.navigation.zoom(delta),
    });
  }
  tick(): void {
    const status = this.town.surfaceStatus,
      problem = this.town.surfaceProblem;
    if (
      (problem !== null && problem !== this.lastProblem) ||
      (this.lastPhase && status?.phase === 'overview' && this.lastPhase !== 'overview')
    )
      this.cancelInput();
    this.lastPhase = status?.phase ?? '';
    this.lastProblem = problem;
    this.navigation.update(
      !problem && !!status?.overviewVisible,
      this.map.interacting || this.toolActive(),
    );
    this.hud.terrainStatus(
      problem
        ? '地形暂不可操作 · 可回家或缩放后重试'
        : !status?.overviewVisible
          ? '正在准备真实全岛远景 · 可回家或调整视角'
          : status.phase === 'overview'
            ? `${status.overviewComplete ? '远景浏览' : '正在绘制全岛'} ${status.readyChunks}/${status.requestedChunks} · 拉近或回家后操作`
            : status.phase === 'detail'
              ? `地形细化中 · 当前区域 ${status.readyChunks}/${status.requestedChunks} 块已就绪`
              : '当前区域已就绪 · 可开田、挖地或填地',
    );
  }
  overview(): void {
    this.navigation.overview();
  }
  reset(): void {
    this.navigation.update(false);
    this.navigation.overview();
  }
  dispose(): void {
    this.navigation.dispose();
  }
}
