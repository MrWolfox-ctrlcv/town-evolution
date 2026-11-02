import { Node, geometry } from 'cc';
import { CONFIG, footprint } from '../domain/game';
import type { Building, GameState } from '../domain/game';
import { ModelFactory } from './ModelFactory';
export interface PlacementPreview {
  kind: 'farm' | 'warehouse' | 'cooler';
  x: number;
  z: number;
  valid: boolean;
}
/** Incremental renderer: static terrain stays alive and only changed buildings are rebuilt. */
export class TownView {
  private readonly factory = new ModelFactory();
  private readonly root: Node;
  private readonly buildings = new Map<string, { signature: string; node: Node }>();
  private marker: Node | null = null;
  private markerKey = '';
  private pickBoxes: Array<{ id: string; bounds: geometry.AABB }> = [];
  constructor(parent: Node) {
    this.root = new Node('TownWorld');
    parent.addChild(this.root);
    this.terrain();
  }
  sync(state: GameState, selection: string | null, preview: PlacementPreview | null): void {
    this.pickBoxes = state.buildings.map((b) => {
      const f = footprint(b);
      const h =
        b.kind === 'farm'
          ? 0.6
          : b.kind === 'cooler'
            ? 1
            : b.kind === 'expandedWarehouse'
              ? 2.3
              : 2;
      return {
        id: b.id,
        bounds: new geometry.AABB(
          b.x + f.width / 2,
          h / 2,
          b.z + f.depth / 2,
          f.width / 2,
          h / 2,
          f.depth / 2,
        ),
      };
    });
    const live = new Set(state.buildings.map((b) => b.id));
    for (const [id, entry] of this.buildings)
      if (!live.has(id)) {
        entry.node.destroy();
        this.buildings.delete(id);
      }
    for (const b of state.buildings) {
      const signature = [b.kind, b.x, b.z, b.rotation, Boolean(b.job)].join(':');
      const old = this.buildings.get(b.id);
      if (old?.signature === signature) continue;
      old?.node.destroy();
      const node = this.factory.building(b);
      this.root.addChild(node);
      this.buildings.set(b.id, { signature, node });
    }
    const selected = state.buildings.find((b) => b.id === selection);
    const key = preview
      ? JSON.stringify(preview)
      : selected
        ? `${selected.id}:${selected.kind}`
        : '';
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.marker?.destroy();
    this.marker = null;
    if (preview) this.outline(preview, preview.valid ? '#EFD377' : '#D87163');
    else if (selected) this.outline(selected, '#F3D37C');
  }
  pickBuilding(ray: geometry.Ray): string | null {
    let distance = Infinity;
    let id: string | null = null;
    for (const entry of this.pickBoxes) {
      const hit = geometry.intersect.rayAABB(ray, entry.bounds);
      if (hit > 0 && hit < distance) {
        distance = hit;
        id = entry.id;
      }
    }
    return id;
  }
  private outline(
    b: Pick<Building, 'kind' | 'x' | 'z'> & { rotation?: 0 | 1 },
    shade: string,
  ): void {
    const dimensions = footprint({ kind: b.kind, rotation: b.rotation ?? 0 });
    const w = dimensions.width,
      d = dimensions.depth;
    this.marker = new Node('PlacementOutline');
    this.root.addChild(this.marker);
    this.marker.setPosition(b.x + w / 2, 0, b.z + d / 2);
    this.factory.shape(this.marker, 'North', 0, 0.09, -d / 2, w + 0.1, 0.09, 0.1, shade);
    this.factory.shape(this.marker, 'South', 0, 0.09, d / 2, w + 0.1, 0.09, 0.1, shade);
    this.factory.shape(this.marker, 'West', -w / 2, 0.09, 0, 0.1, 0.09, d, shade);
    this.factory.shape(this.marker, 'East', w / 2, 0.09, 0, 0.1, 0.09, d, shade);
  }
  private terrain(): void {
    const f = this.factory;
    f.shape(this.root, 'SandBank', 6, -0.33, 6, 13, 0.6, 13, '#DCC392');
    f.shape(this.root, 'Grass', 6, -0.045, 6, 12, 0.12, 12, '#90AF76');
    // Decorative border only: no tree occupies a buildable cell or blocks placement.
    for (const [x, z, size] of [
      [-0.25, 1, 1],
      [-0.25, 9.5, 0.8],
      [2, -0.25, 0.9],
      [10, -0.25, 1.1],
      [12.25, 9, 0.85],
    ]) {
      f.shape(this.root, 'TreeTrunk', x!, 0.32, z!, 0.14, 0.6, 0.14, '#92734E');
      f.shape(this.root, 'TreeCrown', x!, 0.95, z!, size!, size! * 1.2, size!, '#567E59', 'sphere');
      f.shape(
        this.root,
        'TreeCrownLight',
        x! - 0.14,
        1.1,
        z! - 0.12,
        size! * 0.72,
        size! * 0.8,
        size! * 0.72,
        '#74975D',
        'sphere',
      );
    }
    for (const [x, z] of [
      [-0.25, 5],
      [5, 12.25],
      [11, 12.25],
    ])
      f.shape(this.root, 'BankStone', x!, 0.1, z!, 0.45, 0.24, 0.35, '#C5C2A4', 'sphere');
    for (let i = 0; i <= CONFIG.gridSize; i++) {
      f.shape(this.root, 'GridX', i, 0.025, 6, 0.016, 0.012, 12, '#9CB782');
      f.shape(this.root, 'GridZ', 6, 0.025, i, 12, 0.012, 0.016, '#9CB782');
    }
  }
  dispose(): void {
    this.root.active = false;
    this.root.destroy();
    this.factory.dispose();
  }
}
