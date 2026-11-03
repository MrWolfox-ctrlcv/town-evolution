/** Conservative projected bounds for the island and its perimeter foliage.
 * Camera direction is (15, 20, 18); half-height includes roofs and bank depth.
 * Unlike aspect clamping, this guarantees horizontal fit on narrow phones.
 */
export function fittedOrthoHeight(aspect: number, gridSize = 12): number {
  return Math.max(8.3, 10.4 / Math.max(0.01, aspect)) * Math.max(1, gridSize / 12);
}

export function homeZoom(gridSize: number): number {
  return Math.min(1, 12 / Math.max(1, gridSize));
}
