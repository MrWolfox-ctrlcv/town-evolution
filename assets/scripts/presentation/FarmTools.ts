import { Node } from 'cc';
import { farmCellCount } from '../domain/farming';
import type { Crop } from '../domain/game';
import type { Point } from '../application/MapGesture';
import { farmCellAtHit, farmCellCenter } from '../application/FarmCells';
import { sampleStroke } from '../application/StrokeSampling';
import { FarmSweep } from '../application/FarmSweep';
import type { FarmTool } from '../application/FarmSweep';
import type { GameSession } from '../application/GameSession';
import type { TownView } from './TownView';
import type { MapCamera } from './MapCamera';
import { ModelFactory } from './ModelFactory';
/** Routes captured HUD drags into domain commands, never through map pan/tap. */
export class FarmTools {
  private active: number | null = null;
  private acted = false;
  private kind: FarmTool = 'harvest';
  private crop: Crop = 'vegetable';
  private waiting: { buildingId: string; cell: number; readyAt: number } | null = null;
  updateHint(): void {
    if (!this.waiting) return;
    const { buildingId, cell, readyAt } = this.waiting;
    const job = this.session.state.buildings.find((b) => b.id === buildingId)?.cropJobs?.[cell];
    if (this.session.message !== '此小格作物尚未成熟' || job?.readyAt !== readyAt)
      this.waiting = null;
    else if (Date.now() >= readyAt) {
      this.session.message = '作物已成熟，可以收割';
      this.waiting = null;
    }
  }
  get hasActed(): boolean {
    return this.acted;
  }
  private previous: Point | null = null;
  private lastHarvestSample: Point | null = null;
  private readonly sweep = new FarmSweep();
  private readonly plantFeedback = new Map<string, string>();
  private readonly factory = new ModelFactory();
  private highlights: Node | null = null;
  constructor(
    private readonly parent: Node,
    private readonly session: GameSession,
    private readonly map: MapCamera,
    private readonly town: TownView,
    private readonly refresh: () => void,
  ) {}
  begin(kind: FarmTool, id: number, point: Point, crop: Crop = 'vegetable'): void {
    this.crop = crop;
    this.cancel();
    this.map.cancelGesture();
    if (this.session.mode !== 'normal') return;
    this.active = id;
    this.kind = kind;
    this.acted = false;
    this.previous = { ...point };
    this.sweep.begin(kind, crop);
    this.highlights = new Node('EligibleFields');
    this.parent.addChild(this.highlights);
    for (const b of this.session.state.buildings) {
      if (b.kind !== 'farm') continue;
      for (let cell = 0; cell < farmCellCount(b); cell++) {
        const command = {
          type: kind === 'plant' ? ('plantCell' as const) : ('harvestCell' as const),
          buildingId: b.id,
          cell,
          crop,
        };
        if (this.session.reason(command)) continue;
        const p = farmCellCenter(b, cell);
        const ring = this.factory.shape(
          this.highlights,
          `${b.id}:${cell}`,
          p.x,
          0.18,
          p.z,
          0.12,
          0.035,
          0.12,
          '#EFD377',
          'sphere',
        );
        ring.setRotationFromEuler(0, b.rotation * 90, 0);
      }
    }
  }
  move(id: number, point: Point): void {
    if (id !== this.active) return;
    const samples = sampleStroke(this.previous, point, 3);
    // Interpolation may round its final point by one ulp. Keep the original pointer endpoint
    // so a repeated move/up is identical, without suppressing real subpixel movement.
    if (this.kind === 'harvest' && samples.length) samples[samples.length - 1] = { ...point };
    this.previous = { ...point };
    let changed = false;
    for (const sample of samples) {
      // Pointer up often repeats the last move after its refresh. A stationary sickle must
      // not cut a newly exposed neighbor; a new gesture or movement may target it normally.
      if (this.kind === 'harvest') {
        if (this.lastHarvestSample?.x === sample.x && this.lastHarvestSample.y === sample.y)
          continue;
        this.lastHarvestSample = sample;
      }
      if (!this.map.contains(sample)) continue;
      const ray = this.map.screenRay(sample);
      const cropHit =
        this.kind === 'plant'
          ? this.town.pickPlant(ray)
          : this.town.pickCrop(ray, this.session.state);
      const hit = cropHit?.buildingId ?? null;
      const building = this.session.state.buildings.find((b) => b.id === hit);
      const cell =
        cropHit?.cell ??
        (building && cropHit ? farmCellAtHit(building, ray, cropHit.distance) : null);
      if (cell === null) continue;
      const key = `${hit}:${cell}`;
      const command = this.sweep.command(this.session.state, hit, cell);
      if (!command) {
        const feedback = this.plantFeedback.get(key);
        if (feedback && this.session.message !== feedback) {
          this.session.message = feedback;
          changed = true;
        }
        continue;
      }
      if (this.session.run(command)) this.acted = true;
      else if (this.session.message === '此小格作物尚未成熟' && building?.cropJobs?.[cell])
        this.waiting = { buildingId: building.id, cell, readyAt: building.cropJobs[cell]!.readyAt };
      if (this.kind === 'plant') this.plantFeedback.set(key, this.session.message);
      if (hit) this.highlights?.getChildByName(key)?.destroy();
      changed = true;
    }
    if (this.kind === 'plant' && this.session.state.inventory[this.crop] < 1) {
      this.highlights?.destroy();
      this.highlights = null;
    }
    if (changed) this.refresh();
  }

  end(id: number, point: Point): boolean {
    if (id !== this.active) return false;
    this.move(id, point);
    const acted = this.acted;
    this.cancel();
    return acted;
  }
  cancel(): void {
    this.active = null;
    this.acted = false;
    this.previous = null;
    this.lastHarvestSample = null;
    this.sweep.cancel();
    this.plantFeedback.clear();
    this.highlights?.destroy();
    this.highlights = null;
  }
  dispose(): void {
    this.cancel();
    this.factory.dispose();
  }
}
