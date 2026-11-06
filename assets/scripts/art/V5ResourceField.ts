import { ContinuousField } from './ContinuousField';
import type { CurvedResource } from './ContinuousField';
import type { V3 } from './AssetTypes';
import { getV5World } from '../domain/v5-world';
import { v5DisplayNormal, v5DisplayColor } from './V5SurfaceStyle';
/** V5 alone uses the canonical continuous recipe and its saved-column cut levels. */
export class V5ResourceField extends ContinuousField {
  readonly recipe;
  constructor(seed: number) {
    const world = getV5World(seed);
    super(192, seed, (x, z) => {
      const c = world.at(x, z);
      return c ? { biome: c.biome, elevation: c.surfaceHeight } : null;
    });
    this.recipe = world.recipe;
  }
  override naturalHeight(x: number, z: number): number {
    return this.recipe.naturalHeight(x, z);
  }
  override cutHeight(resource: CurvedResource): number {
    return this.recipe.cutHeight(resource);
  }
  /** Display normals follow the actual quarter-cell mesh, not sub-grid noise. */
  override normal(x: number, z: number): V3 {
    return v5DisplayNormal((xx, zz) => this.naturalHeight(xx, zz), x, z);
  }
  /** ResourcePatch separately gives excavation caps and walls their exposed material. */
  override color(resource: CurvedResource, x: number, z: number, h: number, n: V3): number[] {
    return v5DisplayColor(this.seed, resource, x, z, h, n);
  }
}
