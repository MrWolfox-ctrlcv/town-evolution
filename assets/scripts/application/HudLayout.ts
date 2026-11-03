/** Pure screen-layout math: testable without a renderer or device. Units are UI points. */
export function hudLayout(width: number, height: number, actionCount = 4, _hasMessage = false) {
  const landscape = width >= 480 && width > height * 1.25;
  const trayWidth = 72;
  const sidebar = landscape ? Math.min(340, Math.max(260, width * 0.43)) : 0;
  const panelWidth = landscape ? sidebar - 16 : Math.min(width - 16, 720);
  const actionRows = Math.ceil(Math.min(6, Math.max(0, actionCount)) / 2);
  // Reserve status space so drag feedback never resizes the map mid-gesture.
  const messageHeight = 24;
  const panelHeight = 116 + actionRows * 56 + messageHeight;
  const half = panelHeight / 2;
  const top = 80;
  const bottom = landscape ? 8 : panelHeight + 16;
  const mapWidth = Math.max(1, width - sidebar);
  const mapHeight = Math.max(1, height - bottom - top);
  return {
    width,
    height,
    right: 0,
    left: sidebar,
    sidebar,
    trayWidth,
    top,
    bottom,
    mapWidth,
    mapHeight,
    panelWidth,
    panelHeight,
    actionRows,
    detailY: half - 20,
    messageY: half - 44,
    actionStartY: half - 64 - messageHeight,
    tabsY: -half + 32,
    panelX: landscape ? -(width - sidebar) / 2 : 0,
    panelY: landscape ? 0 : -height / 2 + panelHeight / 2 + 8,
    summaryWidth: Math.min(mapWidth - trayWidth - 16, 720),
    summaryX: (sidebar - trayWidth) / 2,
  };
}
