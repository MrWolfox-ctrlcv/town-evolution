import { V6_VIEW_TOP } from '../application/CameraFraming';
import type { TerrainVersion } from '../domain/world';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
/** The legacy stream is unchanged. V6 receives actual clip and framebuffer error bounds. */
export function streamTownFrame(version: TerrainVersion, map: MapCamera, town: TownView): void {
  if (version === 5) town.frame(map.visibleBounds(64), map.visibleBounds(4));
  else if (version === 6 || version === 7) {
    const visible = map.visibleBounds(V6_VIEW_TOP),
      flat = map.visibleBounds(0);
    town.frame(
      visible,
      visible,
      Math.max(flat.maxX - flat.minX, flat.maxZ - flat.minZ),
      (min, max) => map.boxVisible(min, max),
      map.maxTerrainError(),
      map.maxOverviewError(),
    );
  }
}
