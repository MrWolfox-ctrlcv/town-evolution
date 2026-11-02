/** Conservative projected bounds for the island and its perimeter foliage.
 * Camera direction is (15, 20, 18); half-height includes roofs and bank depth.
 * Unlike aspect clamping, this guarantees horizontal fit on narrow phones.
 */
export function fittedOrthoHeight(aspect: number): number {
  return Math.max(8.3, 10.4 / Math.max(0.01, aspect));
}
