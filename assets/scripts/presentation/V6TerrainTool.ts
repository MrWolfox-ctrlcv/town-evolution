import type { GameState } from '../domain/game';
import { Node } from 'cc';
import type { Point } from '../application/MapGesture';
import { materialQuantity } from '../application/MaterialQuantity';
import { getV6EditSurface } from '../domain/v6-edit-surface';
import { getEditableWorld } from '../domain/editable-world';
import { integer } from '../domain/guards';
import { terrain6EditLevel } from '../domain/v6-edit-level';
import { previewTerrain6Edit } from '../domain/v6-edit-plan';
import type { EditTerrain6Command } from '../domain/v6-edit-types';
import type { GameSession } from '../application/GameSession';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
import { ModelFactory } from './ModelFactory';
/** A captured drag commits one real cell edit on release. Cancelling never changes state. */
export class V6TerrainTool {
  private pointer: number | null = null;
  private kind: 'dig' | 'fill' = 'dig';
  private material: 'soil' | 'stone' = 'soil';
  private operation = 0;
  private seed = 0;
  private checkpoint: GameState['terrain6'] = undefined;
  private targetCell: { x: number; z: number } | null = null;
  private amount = 0;
  private marker: Node | null = null;
  private markerKey = '';
  private readonly factory = new ModelFactory();
  constructor(
    private readonly parent: Node,
    private readonly session: GameSession,
    private readonly map: MapCamera,
    private readonly town: TownView,
    private readonly refresh: () => void,
  ) {}
  begin(id: number, kind: 'dig' | 'fill', material: 'soil' | 'stone'): void {
    this.cancel();
    this.map.cancelGesture();
    this.pointer = id;
    this.kind = kind;
    this.material = material;
    this.operation = this.session.state.terrain6!.nextOperation;
    this.seed = this.session.state.mapSeed;
    this.checkpoint = this.session.state.terrain6;
    this.amount = this.session.state.inventory[material];
    this.session.message = `${kind === 'dig' ? '挖地' : '填地'}：拖到内陆目标格，松手改造一层`;
    this.refresh();
  }
  valid(): boolean {
    return (
      this.pointer === null ||
      (this.session.state.mapSeed === this.seed &&
        this.session.state.terrain6 === this.checkpoint &&
        (!this.targetCell || this.town.isGroundReady(this.targetCell.x, this.targetCell.z)))
    );
  }
  private target(point: Point) {
    if (!this.valid() || !this.map.contains(point)) return null;
    const ray = this.map.screenRay(point),
      hit = this.town.pickTerrain(ray);
    if (
      !hit ||
      this.town.pickBuilding(ray) ||
      this.town.pickTree(ray) ||
      this.town.pickDrop(ray) ||
      this.town.pickStack(ray)
    )
      return null;
    // A coast triangle can extend outside the editable world. Chunk residency
    // alone does not make its hit cell valid; never pass it to strict sampling.
    const size = getEditableWorld(this.seed, this.session.state.terrainVersion).size;
    if (!integer(hit.x, size - 1) || !integer(hit.z, size - 1)) return null;
    this.targetCell = { x: hit.x, z: hit.z };
    const level = terrain6EditLevel(this.session.state, hit.x, hit.z, this.kind);
    if (level === null) return null;
    const base = {
      type: 'editTerrain6' as const,
      x: hit.x,
      z: hit.z,
      level,
      expectedOperation: this.operation,
    };
    const command: EditTerrain6Command =
      this.kind === 'dig'
        ? { ...base, kind: 'dig' }
        : {
            ...base,
            kind: 'fill',
            material: this.material,
            source: { type: 'inventory', item: this.material, amount: this.amount },
          };
    return { command, hit, plan: previewTerrain6Edit(this.session.state, command) };
  }
  move(id: number, point: Point): void {
    if (id !== this.pointer) return;
    const target = this.target(point);
    this.mark(target);
    if (!target) this.session.message = '请选择已显示的内陆空地 · 水域与加载中地块不可改造';
    else if (!target.plan.allowed) this.session.message = target.plan.reason;
    else {
      const amounts = this.kind === 'dig' ? target.plan.yield : target.plan.cost;
      const detail = (['soil', 'stone'] as const)
        .filter((item) => amounts[item] > 0)
        .map((item) => `${item === 'soil' ? '土' : '石'} ${materialQuantity(amounts[item])}`)
        .join(' + ');
      this.session.message = `松手${this.kind === 'dig' ? '挖下一层 · 掉落' : '填上一层 · 消耗'} ${detail}`;
    }
    this.refresh();
  }
  end(id: number, point: Point): void {
    if (id !== this.pointer) return;
    const target = this.target(point);
    this.cancel();
    if (target) this.session.run(target.command);
    else this.session.message = '未改造地形，材料与耐久未消耗';
    this.refresh();
  }
  private mark(target: ReturnType<V6TerrainTool['target']>): void {
    const key = target
      ? `${target.command.x}:${target.command.z}:${target.plan.height}:${target.plan.allowed}:${this.operation}`
      : '';
    if (key === this.markerKey) return;
    this.marker?.destroy();
    this.marker = null;
    this.markerKey = key;
    if (!target) return;
    const { command, plan, hit } = target;
    const top = getV6EditSurface(this.session.state).range(hit.x, hit.z)[1];
    const height = Math.max(top, plan.height ?? top);
    this.marker = new Node('Terrain6EditPreview');
    this.parent.addChild(this.marker);
    this.marker.setPosition(command.x + 0.5, height, command.z + 0.5);
    const shade = plan.allowed ? '#F0D875' : '#D97168';
    for (const side of [-1, 1]) {
      this.factory.shape(
        this.marker,
        'TerrainEdgeX',
        side * 0.48,
        0.035,
        0,
        0.045,
        0.035,
        1,
        shade,
      );
      this.factory.shape(
        this.marker,
        'TerrainEdgeZ',
        0,
        0.035,
        side * 0.48,
        1,
        0.035,
        0.045,
        shade,
      );
    }
  }
  cancel(): void {
    this.pointer = null;
    this.checkpoint = undefined;
    this.targetCell = null;
    this.marker?.destroy();
    this.marker = null;
    this.markerKey = '';
  }
  dispose(): void {
    this.cancel();
    this.factory.dispose();
  }
}
