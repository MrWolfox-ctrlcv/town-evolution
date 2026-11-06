import { Mesh, MeshRenderer, Node, Vec3, gfx } from 'cc';
import type { ObjectBounds } from '../application/ObjectSelection';
const cache = new WeakMap<Mesh, ObjectBounds>();
function meshBounds(mesh: Mesh): ObjectBounds | null {
  const stored = cache.get(mesh);
  if (stored) return stored;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  // createMesh does not calculate bounds by default. The authored assets keep
  // only their real vertex positions, so cache an exact local extent once.
  for (let i = 0; i < mesh.struct.primitives.length; i++) {
    const positions = mesh.readAttribute(i, gfx.AttributeName.ATTR_POSITION);
    if (!positions) continue;
    for (let j = 0; j < positions.length; j++) {
      const axis = j % 3;
      min[axis] = Math.min(min[axis]!, positions[j]!);
      max[axis] = Math.max(max[axis]!, positions[j]!);
    }
  }
  if (!Number.isFinite(min[0])) return null;
  const result = { min, max };
  cache.set(mesh, result);
  return result;
}
/** Read the rendered mesh extents, including transforms, rather than guessing a model height. */
export function modelBounds(root: Node): ObjectBounds | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const point = new Vec3();
  for (const renderer of root.getComponentsInChildren(MeshRenderer)) {
    if (!renderer.enabled || !renderer.node.activeInHierarchy) continue;
    const mesh = renderer.mesh ? meshBounds(renderer.mesh) : null;
    if (!mesh) continue;
    for (const x of [mesh.min[0], mesh.max[0]])
      for (const y of [mesh.min[1], mesh.max[1]])
        for (const z of [mesh.min[2], mesh.max[2]]) {
          Vec3.transformMat4(point.set(x, y, z), point, renderer.node.worldMatrix);
          min[0] = Math.min(min[0], point.x);
          min[1] = Math.min(min[1], point.y);
          min[2] = Math.min(min[2], point.z);
          max[0] = Math.max(max[0], point.x);
          max[1] = Math.max(max[1], point.y);
          max[2] = Math.max(max[2], point.z);
        }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}
