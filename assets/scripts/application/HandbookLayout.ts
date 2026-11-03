/** Small non-modal folder and movable paper. All coordinates use the canvas center. */
export const RECIPE_PAPER = { width: 256, height: 258 };
export function handbookLayout(
  width: number,
  height: number,
  point?: { x: number; y: number },
  requestedScale = 1,
) {
  const fit = Math.min((width - 16) / RECIPE_PAPER.width, (height - 16) / RECIPE_PAPER.height);
  const scale = Math.max(0.1, Math.min(fit, Math.max(0.75, requestedScale)));
  const paperWidth = RECIPE_PAPER.width * scale;
  const paperHeight = RECIPE_PAPER.height * scale;
  const maxX = Math.max(0, (width - paperWidth) / 2 - 8);
  const maxY = Math.max(0, (height - paperHeight) / 2 - 8);
  return {
    width: paperWidth,
    height: paperHeight,
    scale,
    x: Math.max(-maxX, Math.min(maxX, point?.x ?? maxX)),
    y: Math.max(-maxY, Math.min(maxY, point?.y ?? -maxY)),
  };
}
export function handbookLauncher(width: number, height: number, bottom = 0) {
  return {
    x: Math.max(0, width / 2 - 38),
    // Extremely short portrait maps cannot fit both a stock row and this pocket.
    // The summary already reserves its rightmost 72 points, so use that empty pocket.
    y:
      height - bottom - 80 < 132
        ? height / 2 - 38
        : Math.min(height / 2 - 38, -height / 2 + bottom + 38),
  };
}
