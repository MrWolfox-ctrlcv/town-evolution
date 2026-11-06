import { Node, Mesh, MeshRenderer, Mat4, Vec3, geometry, gfx } from 'cc';
import { MeshSurface } from '../application/MeshSurface';
import { nearProjectedBounds } from './TouchPicking';
import type { TouchPickContext } from './TouchPicking';

const surfaces = new WeakMap<Mesh, readonly MeshSurface[]>();
function meshSurfaces(mesh: Mesh): readonly MeshSurface[] {
  let cached = surfaces.get(mesh);
  if (!cached) {
    cached = mesh.struct.primitives.flatMap((primitive, index) => {
      // All town assets and ModelFactory primitives are indexed triangle lists.
      if (primitive.primitiveMode !== gfx.PrimitiveMode.TRIANGLE_LIST) return [];
      const positions = mesh.readAttribute(index, gfx.AttributeName.ATTR_POSITION);
      const indices = mesh.readIndices(index);
      return positions && indices ? [new MeshSurface(positions, indices)] : [];
    });
    surfaces.set(mesh, cached);
  }
  return cached;
}
/** One cached component list per rendered building; no footprint or guessed-height hit box. */
export class ModelPicking {
  private readonly renderers: MeshRenderer[];
  private readonly inverse = new Mat4();
  private readonly localRay = new geometry.Ray();
  constructor(root: Node) {
    this.renderers = root.getComponentsInChildren(MeshRenderer).filter((renderer) => {
      // New v5 foot continuations are behind opaque water. Keep the original
      // visible posts/platform pickable, rather than selecting hidden seabed supports.
      for (let node: Node | null = renderer.node; node; node = node.parent)
        if (node.name?.startsWith('V5PierFooting') || node.name?.startsWith('BridgeFooting'))
          return false;
      return true;
    });
  }
  distance(ray: geometry.Ray, limit = Infinity): number | null {
    return this.hit(ray, limit)?.distance ?? null;
  }
  /** Screen bounds reject distant models once per contact, before any neighbor rays. */
  nearScreen(context: TouchPickContext): boolean {
    for (const renderer of this.renderers) {
      if (!renderer.enabled || !renderer.node.activeInHierarchy || !renderer.mesh) continue;
      renderer.node.getWorldMatrix(this.inverse);
      if (Math.abs(Mat4.determinant(this.inverse)) < 1e-12) continue;
      for (const surface of meshSurfaces(renderer.mesh))
        if (
          nearProjectedBounds(surface.bounds, context, (point) =>
            Vec3.transformMat4(this.localRay.o, point, this.inverse),
          )
        )
          return true;
    }
    return false;
  }
  /** Return the actual rendered node too, so a caller need not raycast again for its identity. */
  hit(ray: geometry.Ray, limit = Infinity, prefer?: (node: Node) => boolean) {
    let closest: { node: Node; distance: number } | null = null;
    for (const renderer of this.renderers) {
      if (!renderer.enabled || !renderer.node.activeInHierarchy || !renderer.mesh) continue;
      // Read current transforms, including construction scale, crop sway, attachments and piers.
      renderer.node.getWorldMatrix(this.inverse);
      if (Math.abs(Mat4.determinant(this.inverse)) < 1e-12) continue;
      Mat4.invert(this.inverse, this.inverse);
      Vec3.transformMat4(this.localRay.o, ray.o, this.inverse);
      Vec3.transformMat4Normal(this.localRay.d, ray.d, this.inverse);
      for (const surface of meshSurfaces(renderer.mesh)) {
        const hit = surface.distance(this.localRay, closest?.distance ?? limit);
        if (
          hit !== null &&
          (!closest ||
            hit < closest.distance ||
            (hit === closest.distance && prefer?.(renderer.node) && !prefer(closest.node)))
        )
          closest = { node: renderer.node, distance: hit };
      }
    }
    return closest;
  }
}
