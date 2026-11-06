import { ASSETS } from './AssetCatalog';
import { compileAsset } from './MeshCompiler';
import { resourceTreeVisual } from './TreeKit';
import { v5Hash } from '../domain/v5-world';
import { V5_TERRAIN_BASE } from '../domain/v5-height-recipe';
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
  anchors: Array<{ x: number; z: number }>;
}
const meshes = new Map<string, MeshData>();
/** Matches the approved lab generator-v2 proposedTreeVisual, only for terrain v5. */
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
export class TreeBatchBuilder {
  private readonly mesh: MeshData = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  private readonly surfaces = new Map<string, MeshSurface>();
  private readonly anchors: Array<{ x: number; z: number }> = [];
  private index = 0;
  constructor(
    private readonly seed: number,
    private readonly trees: readonly StreamTree[],
    private readonly far: boolean,
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
      base = this.mesh.positions.length / 3,
      positions: number[] = [];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]! * scale[0]!,
        y = mesh.positions[i + 1]! * scale[1]!,
        z = mesh.positions[i + 2]! * scale[2]!;
      const p = [
        tree.x + 0.5 + visual.offset[0]! + x * c + z * s,
        V5_TERRAIN_BASE + y,
        tree.z + 0.5 + visual.offset[2]! - x * s + z * c,
      ];
      positions.push(...p);
      this.mesh.positions.push(...p);
      for (let axis = 0; axis < 3; axis++) {
        this.mesh.min[axis] = Math.min(this.mesh.min[axis]!, p[axis]!);
        this.mesh.max[axis] = Math.max(this.mesh.max[axis]!, p[axis]!);
      }
      const nx = mesh.normals[i]! / scale[0]!,
        ny = mesh.normals[i + 1]! / scale[1]!,
        nz = mesh.normals[i + 2]! / scale[2]!,
        length = Math.hypot(nx, ny, nz);
      this.mesh.normals.push((nx * c + nz * s) / length, ny / length, (-nx * s + nz * c) / length);
    }
    this.anchors.push({ x: tree.x + 0.5 + visual.offset[0]!, z: tree.z + 0.5 + visual.offset[2]! });
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
      bytes:
        (mesh.positions.length + mesh.normals.length + mesh.colors.length) * 4 +
        mesh.indices.length * 4,
    };
  }
}
