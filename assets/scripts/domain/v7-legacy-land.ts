import { fractalNoise } from './noise';
function legacyLandCell(x: number, z: number, seed: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(z) || x < 1 || z < 1 || x >= 23 || z >= 23)
    return false;
  const phase = (seed % 6283) / 1000;
  const dx = x + 0.5 - (11.7 + 0.55 * Math.sin(phase)),
    dz = z + 0.5 - (11.8 + 0.55 * Math.cos(phase));
  const angle = Math.atan2(dz, dx);
  const radius =
    8.8 +
    1.35 * Math.sin(3 * angle + phase) +
    0.85 * Math.sin(5 * angle - phase * 1.3) +
    0.35 * Math.cos(9 * angle + phase);
  const starterLobe = ((x + 0.5 - 6) / 4.8) ** 2 + ((z + 0.5 - 5.5) / 4.4) ** 2 <= 1;
  return starterLobe || Math.hypot(dx, dz) <= radius;
}
/** Frozen terrain3 predicate, copied without arithmetic changes for cooperative qualification.
 * No import of island/world caches: creating a candidate must not recursively request itself. */
export function v7LegacyV3LandCell(x: number, z: number, seed: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(z) || x < 1 || z < 1 || x >= 39 || z >= 39)
    return false;
  if (legacyLandCell(x, z, seed)) return true;
  const phase = (seed % 6283) / 1000;
  const dx = (x + 0.5 - 20) / 16,
    dz = (z + 0.5 - 19) / 16;
  const angle = Math.atan2(dz, dx);
  const coast =
    1 +
    Math.sin(angle * 3 + phase) * 0.065 +
    Math.cos(angle * 5 - phase) * 0.045 +
    (fractalNoise(x / 7, z / 7, seed) - 0.5) * 0.22;
  return Math.hypot(dx, dz) <= coast;
}
