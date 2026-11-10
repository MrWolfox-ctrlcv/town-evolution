import { ASSETS } from './AssetCatalog';
import { compileAsset } from './MeshCompiler';
import { resourceTreeVisual } from './TreeKit';
import { v5Hash } from '../domain/v5-world';
import { MeshSurface } from '../application/MeshSurface';
import type { MeshData } from './AssetTypes';
export interface StreamTree {
  id: string;
  x: number;
  z: number;
  stage: number;
}
export interface TreeBatch {
  mesh: MeshData;
  surfaces: Map<string, MeshSurface>;
  bytes: number;
  anchors: Array<{ x: number; y: number; z: number }>;
}
const meshes = new Map<string, MeshData>();
/** Matches the approved lab generator-v2 proposedTreeVisual, shared visual identity, terrain6 has actual elevated anchors. */
export function v5TreeVisual(seed: number, x: number, z: number) {
  const base = resourceTreeVisual(seed, x, z);
  return {
    asset: base.asset,
    yaw: base.yaw,
    scale: [
      1.3 + v5Hash(seed + 477, x, z) * 0.32,
      1.32 + v5Hash(seed + 491, x, z) * 0.44,
      1.29 + v5Hash(seed + 503, x, z) * 0.34,
    ] as const,
    offset: [(v5Hash(seed + 521, x, z) - 0.5) * 0.28, 0, (v5Hash(seed + 541, x, z) - 0.5) * 0.28],
  };
}
/** Shared by standing geometry and feedback so a sloped trunk never falls from sea level. */
export function v6TreeRoot(
  seed: number,
  x: number,
  z: number,
  height: (x: number, z: number) => number,
) {
  const visual = v5TreeVisual(seed, x, z);
  const rootX = x + 0.5 + visual.offset[0]!,
    rootZ = z + 0.5 + visual.offset[2]!;
  return { x: rootX, y: height(rootX, rootZ), z: rootZ };
}
function treeMesh(asset: string, far: boolean): MeshData {
  const key = `${asset}:${far}`;
  let data = meshes.get(key);
  if (!data) {
    const recipe = ASSETS[asset]!;
    // Distant silhouettes keep real trunk/crown parts, not tiles or invented trees.
    const parts =
      far && asset !== 'sapling'
        ? recipe.parts.filter(
            (p, i) =>
              p.name === 'trunk' ||
              p.name === 'pine-trunk' ||
              p.name === 'crown-core' ||
              p.name === 'crown-top' ||
              (p.name === 'pine-tier' && (i === 1 || i === 4)),
          )
        : recipe.parts;
    data = compileAsset({
      ...recipe,
      parts: parts.map((p) => (far && p.shape === 'crown' ? { ...p, shape: 'gem' } : p)),
    });
    meshes.set(key, data);
  }
  return data;
}
/** CPU geometry is staged a tree at a time, then render and exact-ID pick publish together. */
export class V6TreeBatchBuilder {
  private readonly mesh: MeshData = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  private readonly surfaces = new Map<string, MeshSurface>();
  private readonly anchors: TreeBatch['anchors'] = [];
  private index = 0;
  constructor(
    private readonly seed: number,
    private readonly trees: readonly StreamTree[],
    private readonly far: boolean,
    private readonly height: (x: number, z: number) => number,
  ) {}
  get complete(): boolean {
    return this.index === this.trees.length;
  }
  append(): void {
    const tree = this.trees[this.index++];
    if (!tree) return;
    const visual = v5TreeVisual(this.seed, tree.x, tree.z),
      mesh = treeMesh(tree.stage < 3 ? 'sapling' : visual.asset, this.far),
      scale =
        tree.stage < 3
          ? [1 + tree.stage * 0.4, 1 + tree.stage * 0.5, 1 + tree.stage * 0.4]
          : visual.scale,
      angle = (visual.yaw * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle),
      root = v6TreeRoot(this.seed, tree.x, tree.z, this.height),
      base = this.mesh.positions.length / 3,
      positions: number[] = [];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]! * scale[0]!,
        y = mesh.positions[i + 1]! * scale[1]!,
        z = mesh.positions[i + 2]! * scale[2]!;
      // Keep the exact operation order and F32 rounding, without allocating
      // one temporary array per vertex or rescanning its three generic axes.
      const px = Math.fround(root.x + x * c + z * s),
        py = Math.fround(root.y + y),
        pz = Math.fround(root.z - x * s + z * c);
      positions.push(px, py, pz);
      this.mesh.positions.push(px, py, pz);
      this.mesh.min[0] = Math.min(this.mesh.min[0]!, px);
      this.mesh.min[1] = Math.min(this.mesh.min[1]!, py);
      this.mesh.min[2] = Math.min(this.mesh.min[2]!, pz);
      this.mesh.max[0] = Math.max(this.mesh.max[0]!, px);
      this.mesh.max[1] = Math.max(this.mesh.max[1]!, py);
      this.mesh.max[2] = Math.max(this.mesh.max[2]!, pz);
      const nx = mesh.normals[i]! / scale[0]!,
        ny = mesh.normals[i + 1]! / scale[1]!,
        nz = mesh.normals[i + 2]! / scale[2]!,
        length = Math.hypot(nx, ny, nz);
      this.mesh.normals.push((nx * c + nz * s) / length, ny / length, (-nx * s + nz * c) / length);
    }
    this.anchors.push(root);
    this.mesh.colors.push(...mesh.colors);
    this.mesh.indices.push(...mesh.indices.map((i) => i + base));
    this.surfaces.set(tree.id, new MeshSurface(positions, mesh.indices));
  }
  finish(): TreeBatch {
    if (!this.complete) throw Error('Tree batch is not complete');
    const mesh = this.mesh;
    return {
      mesh,
      anchors: this.anchors,
      surfaces: this.surfaces,
      // Canonical logical bytes; actual part duplication is budgeted by V6ChunkMeshes.
      bytes: (mesh.positions.length / 3) * 48 + mesh.indices.length * 2,
    };
  }
}
