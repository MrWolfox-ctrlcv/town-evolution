import { v5PierFootings, V5_PIER_BED_LOWER, V5_PIER_EMBED } from './V5PierFootings';
/** V6 root elevation lifts the original post, but must not lift its embedded world bottom.
 * Keep the local top unchanged so the same reusable unit still overlaps the post. */
export function v6PierFootings(simple: boolean, depth: number, baseElevation: number) {
  if (!Number.isFinite(baseElevation)) throw Error('Invalid pier base elevation');
  return v5PierFootings(simple, depth).map((foot) => {
    const top = foot.y + foot.height / 2;
    const bottom = V5_PIER_BED_LOWER - V5_PIER_EMBED - baseElevation;
    return { ...foot, y: (top + bottom) / 2, height: top - bottom };
  });
}
