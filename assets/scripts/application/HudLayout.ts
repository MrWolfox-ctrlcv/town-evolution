/** Pure screen-layout math: testable without a renderer or device. Units are UI points. */
export function hudLayout(width: number, height: number) {
  const landscape = width >= 480 && width > height * 1.25;
  const sidebar = landscape ? Math.min(340, Math.max(260, width * 0.43)) : 0;
  const panelWidth = landscape ? sidebar - 16 : Math.min(width - 16, 720);
  const panelHeight = 292;
  const top = 96;
  const bottom = landscape ? 8 : panelHeight + 16;
  const mapWidth = Math.max(1, width - sidebar);
  const mapHeight = Math.max(1, height - bottom - top);
  return {
    width,
    height,
    right: sidebar,
    top,
    bottom,
    mapWidth,
    mapHeight,
    panelWidth,
    panelHeight,
    panelX: landscape ? (width - sidebar) / 2 : 0,
    panelY: landscape ? 0 : -height / 2 + panelHeight / 2 + 8,
    summaryWidth: Math.min(mapWidth - 16, 720),
    summaryX: -sidebar / 2,
  };
}
