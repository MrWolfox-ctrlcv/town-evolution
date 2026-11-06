import type { Building } from '../domain/game';
import type { MeshData } from '../art/AssetTypes';
import { ASSETS } from '../art/AssetCatalog';
import { compileAsset } from '../art/MeshCompiler';
import { SurfaceSupport } from '../application/SurfaceSupport';
import type { SupportRect } from '../application/SurfaceSupport';
const beds = new Map<string, SurfaceSupport>();
/** Ground-only rendered geometry, never crop canopies, box lids or logical resource heights. */
export class DropSupport {
  revision = 0;
  private coast: SurfaceSupport | null = null;
  private natural: SurfaceSupport | null = null;
  private roads: SurfaceSupport | null = null;
  private naturalChunks = new Map<string, SurfaceSupport>();
  private coastChunks = new Map<string, SurfaceSupport>();
  private farms: Building[] = [];
  private farmKey = '';
  setCoastChunks(changes: readonly { key: string; mesh: MeshData }[]): void {
    const next = new Map(this.coastChunks);
    for (const { key, mesh } of changes) {
      if (mesh.indices.length) next.set(key, new SurfaceSupport(mesh.positions, mesh.indices, 16));
      else next.delete(key);
    }
    this.coastChunks = next;
    this.coast = null;
    this.revision++;
  }
  clearCoastChunks(): void {
    this.coastChunks.clear();
    this.coast = null;
    this.revision++;
  }
  setNaturalChunks(changes: readonly { key: string; mesh: MeshData }[]): void {
    const next = new Map(this.naturalChunks);
    for (const { key, mesh } of changes) {
      if (mesh.indices.length) next.set(key, new SurfaceSupport(mesh.positions, mesh.indices));
      else next.delete(key);
    }
    this.naturalChunks = next;
    this.natural = null;
    this.revision++;
  }
  clearNaturalChunks(): void {
    this.naturalChunks.clear();
    this.natural = null;
    this.revision++;
  }
  set(kind: 'coast' | 'natural' | 'roads', mesh: MeshData): void {
    const indices =
      kind === 'roads'
        ? mesh.indices.filter((_, i) => {
            const triangle = Math.floor(i / 3) * 3;
            return [0, 1, 2].every(
              (j) => mesh.positions[mesh.indices[triangle + j]! * 3 + 1]! <= 0.025,
            );
          })
        : mesh.indices;
    if (kind === 'natural') this.naturalChunks.clear();
    if (kind === 'coast') this.coastChunks.clear();
    this[kind] = new SurfaceSupport(mesh.positions, indices, kind === 'coast' ? 16 : 1);
    this.revision++;
  }
  setFarms(buildings: readonly Building[]): void {
    const farms = buildings.filter((b) => b.kind === 'farm');
    const key = JSON.stringify(
      farms.map((b) => [b.id, b.x, b.z, b.rotation, b.farmSize, b.irrigated]),
    );
    if (key !== this.farmKey) {
      this.farmKey = key;
      this.farms = farms;
      this.revision++;
    }
  }
  height(rect: SupportRect): number | null {
    const values = [
      this.coast?.height(rect),
      this.natural?.height(rect),
      this.roads?.height(rect),
      ...[...this.naturalChunks.values()].map((s) => s.height(rect)),
      ...[...this.coastChunks.values()].map((s) => s.height(rect)),
    ];
    for (const farm of this.farms) {
      const half = farm.farmSize === 6 ? 2 : 1,
        cx = farm.x + half,
        cz = farm.z + half;
      if (
        rect.maxX < farm.x ||
        rect.minX > farm.x + half * 2 ||
        rect.maxZ < farm.z ||
        rect.minZ > farm.z + half * 2
      )
        continue;
      const local = [];
      for (const x of [rect.minX, rect.maxX])
        for (const z of [rect.minZ, rect.maxZ]) {
          const dx = x - cx,
            dz = z - cz,
            r = farm.rotation;
          local.push({ x: [dx, -dz, -dx, dz][r]!, z: [dz, dx, -dz, -dx][r]! });
        }
      const id = `farm-${farm.farmSize === 6 ? 'large' : 'cell'}-bed${farm.irrigated ? '-water' : ''}`;
      if (!beds.has(id)) {
        const mesh = compileAsset(ASSETS[id]!);
        beds.set(id, new SurfaceSupport(mesh.positions, mesh.indices));
      }
      values.push(
        beds.get(id)!.height({
          minX: Math.min(...local.map((p) => p.x)),
          maxX: Math.max(...local.map((p) => p.x)),
          minZ: Math.min(...local.map((p) => p.z)),
          maxZ: Math.max(...local.map((p) => p.z)),
        }),
      );
    }
    const finite = values.filter((v): v is number => v != null);
    return finite.length ? Math.max(...finite) : null;
  }
}
