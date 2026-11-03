import type { Node } from 'cc';
import type { Item } from '../domain/game';
import { stockDropCommand } from '../application/CommerceSelection';
import { COMMERCE, footprint, isCrop } from '../domain/game';
import type { GameSession } from '../application/GameSession';
import type { Point } from '../application/MapGesture';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
import { ModelFactory } from './ModelFactory';
/** A stock chip transfers exactly one unit, only on a valid drop. */
export class StockDrag {
  private pointer: number | null = null;
  private item: Item = 'vegetable';
  private readonly factory = new ModelFactory();
  private rings: Node[] = [];
  private preview: Node | null = null;
  private previewKey = '';
  constructor(
    private readonly parent: Node,
    private readonly session: GameSession,
    private readonly map: MapCamera,
    private readonly town: TownView,
    private readonly refresh: () => void,
  ) {}
  begin(item: Item, id: number): void {
    this.cancel(true);
    this.map.cancelGesture();
    this.pointer = id;
    this.item = item;
    for (const b of this.session.state.buildings) {
      const command = stockDropCommand(this.session.state, item, b.id);
      if (!command) continue;
      const f = footprint(b);
      const shade = this.session.reason(command) ? '#D87163' : '#EFD377';
      for (const side of [-1, 1]) {
        this.rings.push(
          this.factory.shape(
            this.parent,
            'TradeTarget',
            b.x + f.width / 2,
            0.12,
            b.z + f.depth / 2 + (side * f.depth) / 2,
            f.width + 0.1,
            0.08,
            0.1,
            shade,
          ),
        );
        this.rings.push(
          this.factory.shape(
            this.parent,
            'TradeTarget',
            b.x + f.width / 2 + (side * f.width) / 2,
            0.12,
            b.z + f.depth / 2,
            0.1,
            0.08,
            f.depth,
            shade,
          ),
        );
      }
    }
    this.session.message = isCrop(item) ? '拖到空田播种 · 消耗1份' : '拖到空地堆放 / 商店卖出';
    this.refresh();
  }
  move(id: number, point: Point): void {
    if (id !== this.pointer) return;
    const b = this.target(point);
    this.previewDrop(point, b?.id ?? null);
    this.session.message =
      b?.kind === 'farm'
        ? isCrop(this.item)
          ? '划过小格播种 · 每格1份'
          : '此物品不可播种'
        : b?.kind === 'shop'
          ? `卖1份 · +${COMMERCE.prices[this.item].sell}币`
          : b?.kind === 'dock'
            ? '装货1份 · 不会卖出'
            : isCrop(this.item)
              ? '空田播种 / 空地堆放'
              : '拖到空地堆放';
    const command = this.dropCommand(point, b?.id ?? null);
    if (command) this.session.message = this.session.reason(command) ?? this.session.message;
    this.refresh();
  }
  end(id: number, point: Point): void {
    if (id !== this.pointer) return;
    const b = this.target(point);
    const command = this.dropCommand(point, b?.id ?? null);
    if (command) this.session.run(command);
    else this.session.message = '已取消';
    this.cancel(true);
    this.refresh();
  }
  private previewDrop(point: Point, buildingId: string | null): void {
    const command = !buildingId ? this.dropCommand(point, null) : null;
    const target = command?.type === 'dropProduct' ? command : null;
    const valid = target && !this.session.reason(target);
    const key = target ? `${target.x}:${target.z}:${Boolean(valid)}` : '';
    if (key === this.previewKey) return;
    this.preview?.destroy();
    this.preview = null;
    this.previewKey = key;
    if (!target) return;
    this.preview = this.factory.shape(
      this.parent,
      'ProductDropPreview',
      target.x + 0.5,
      0.09,
      target.z + 0.5,
      0.92,
      0.025,
      0.92,
      valid ? '#BDCF79' : '#CC7767',
    );
  }
  private dropCommand(point: Point, buildingId: string | null) {
    if (!this.map.contains(point)) return null;
    if (this.town.pickTree(this.map.screenRay(point))) return null;
    if (buildingId) return stockDropCommand(this.session.state, this.item, buildingId);
    const pile = this.town.pickStack(this.map.screenRay(point));
    const ground = this.map.ground(point);
    return ground
      ? {
          type: 'dropProduct' as const,
          item: this.item,
          x: pile?.x ?? Math.floor(ground.x),
          z: pile?.z ?? Math.floor(ground.z),
        }
      : null;
  }
  private target(point: Point) {
    if (!this.map.contains(point)) return undefined;
    const id = this.town.pickBuilding(this.map.screenRay(point));
    return this.session.state.buildings.find((b) => b.id === id);
  }
  cancel(silent = false): void {
    const wasActive = this.pointer !== null;
    this.pointer = null;
    this.preview?.destroy();
    this.preview = null;
    this.previewKey = '';
    for (const ring of this.rings) ring.destroy();
    this.rings = [];
    if (wasActive && !silent) {
      this.session.message = '已取消';
      this.refresh();
    }
  }
  dispose(): void {
    this.cancel(true);
    this.factory.dispose();
  }
}
