import { V6Terrain } from '../domain/v6-terrain';
import { V6Samples } from '../domain/v6-samples';
import type { V3 } from './AssetTypes';
import type { V6SurfaceWorld } from './V6SurfaceContracts';
const normal = V6Terrain.prototype.normal;
const groundHeight = V6Samples.prototype.groundHeight;
const naturalHeight = V6Samples.prototype.naturalHeight;
const vertex = V6Samples.prototype.vertex;
const at = V6Terrain.prototype.at;
export function v6PreparedSamples(world: V6SurfaceWorld): world is V6Terrain {
  return (
    world instanceof V6Terrain &&
    world.vertex === vertex &&
    world.at === at &&
    world.groundHeight === groundHeight &&
    world.naturalHeight === naturalHeight
  );
}
function dry(world: V6SurfaceWorld, x: number, z: number): boolean {
  const cell = world.at(Math.floor(x), Math.floor(z));
  return !!cell && !cell.reserved;
}
function value(world: V6Terrain, x: number, z: number, ground: boolean): number {
  const p = world.vertex(x, z);
  return ground ? p.ground : Math.fround(p.ground + Math.max(p.stone, p.soil));
}
/** Only original prepared V6 methods qualify. Fakes, overridden methods and
 * non-quarter points preserve the original public query, including coastal rules. */
export function v6WorldHeight(
  world: V6SurfaceWorld,
  x: number,
  z: number,
  ground: boolean,
): number {
  if (
    v6PreparedSamples(world) &&
    Number.isInteger(x * 4) &&
    Number.isInteger(z * 4) &&
    dry(world, x, z)
  ) {
    const h = value(world, x * 4, z * 4, ground);
    // Match the original interpolator's additions, including a possible signed zero.
    return h * 1 + 0 + 0;
  }
  return ground ? world.groundHeight(x, z) : world.naturalHeight(x, z);
}
/** Four midpoint evaluations of the original F32 lattice. Preserve multiply/add
 * order rather than cancelling the center, so every normal component stays exact. */
export function v6WorldNormal(world: V6SurfaceWorld, x: number, z: number, ground: boolean): V3 {
  const gx = x * 4,
    gz = z * 4;
  if (
    !v6PreparedSamples(world) ||
    world.normal !== normal ||
    !Number.isInteger(gx) ||
    !Number.isInteger(gz) ||
    gx < 1 ||
    gz < 1 ||
    gx >= world.size * 4 ||
    gz >= world.size * 4 ||
    !dry(world, x - 0.125, z) ||
    !dry(world, x + 0.125, z) ||
    !dry(world, x, z - 0.125) ||
    !dry(world, x, z + 0.125)
  )
    return world.normal(x, z, ground);
  const c = value(world, gx, gz, ground),
    l = value(world, gx - 1, gz, ground),
    r = value(world, gx + 1, gz, ground),
    a = value(world, gx, gz - 1, ground),
    b = value(world, gx, gz + 1, ground);
  const left = l * 0.5 + c * 0.5,
    right = c * 0.5 + r * 0.5,
    top = a * 0.5 + c * 0.5,
    bottom = c * 0.5 + b * 0.5;
  const dx = (left - right) / 0.25,
    dz = (top - bottom) / 0.25,
    d = Math.hypot(dx, 1, dz);
  return [dx / d, 1 / d, dz / d];
}
