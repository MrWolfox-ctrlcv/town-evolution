/** Full map with transparent bottom navigation and a contextual icon shelf. */
export function hudLayout(width: number, height: number, actionCount = 4, _hasMessage = false) {
  const panelWidth = Math.min(width - 24, 552);
  const actionColumns = width >= 640 || (width >= 480 && width > height * 1.25) ? 6 : 3;
  const actionRows = Math.ceil(Math.min(6, Math.max(0, actionCount)) / actionColumns);
  const panelHeight = 54 + actionRows * 82;
  return {
    width,
    height,
    right: 0,
    left: 0,
    sidebar: 0,
    trayWidth: 72,
    top: 52,
    bottom: 0,
    mapWidth: width,
    mapHeight: height,
    panelWidth,
    panelHeight,
    actionRows,
    actionColumns,
    actionWidth: panelWidth / Math.max(1, Math.min(actionColumns, actionCount)),
    detailY: panelHeight / 2 - 20,
    messageY: -height / 2 + 102,
    actionStartY: panelHeight / 2 - 85,
    tabsY: -height / 2 + 42,
    panelX: 0,
    panelY: -height / 2 + 92 + panelHeight / 2,
    summaryWidth: Math.min(width - 88, 320),
    summaryX: -36,
  };
}
