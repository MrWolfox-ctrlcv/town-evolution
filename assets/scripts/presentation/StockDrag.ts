import type { Node } from 'cc';
import { terrainHeight } from './TerrainInteraction';
import type { Item, Command } from '../domain/game';
import { dropSnapshot } from '../application/DropSnapshot';
import { materialQuantity } from '../application/MaterialQuantity';
import { stockDropCommand } from '../application/CommerceSelection';
import {
  COMMERCE,
  footprint,
  isCrop,
  isTradableItem,
  isGroundTradeItem,
  isCompostItem,
  stockIntoDropPlan,
  dropPosition,
} from '../domain/game';
import type { GameSession } from '../application/GameSession';
import type { Point } from '../application/MapGesture';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
import { ModelFactory } from './ModelFactory';
/** A stock chip transfers at most one unit, only on a valid drop. */
export class StockDrag {
  overDrop = false;
  private pointer: number | null = null;
  private item: Item = 'vegetable';
  private sourceAmount = 0;
  private sourceInvalid = false;
  private readonly dropTargets = new Map<string, string>();
  get blocksPlanting(): boolean {
    return this.pointer !== null && (this.overDrop || this.sourceInvalid);
  }
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
    this.sourceAmount = this.session.state.inventory[item];
    this.sourceInvalid = false;
    for (const b of this.session.state.buildings) {
      const command = this.buildingCommand(b.id);
      if (!command) continue;
      const f = footprint(b);
      const shade = this.session.reason(command) ? '#D87163' : '#EFD377';
      for (const side of [-1, 1]) {
        this.rings.push(
          this.factory.shape(
            this.parent,
            'TradeTarget',
            b.x + f.width / 2,
            (b.baseElevation ?? 0) + 0.12,
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
            (b.baseElevation ?? 0) + 0.12,
            b.z + f.depth / 2,
            0.1,
            0.08,
            f.depth,
            shade,
          ),
        );
      }
    }
    this.session.message =
      item === 'sapling'
        ? '拖到空地种树 · 消耗1份'
        : isCrop(item)
          ? '拖到空田播种 · 消耗1份'
          : '拖到建筑挂载 / 空地堆放';
    this.refresh();
  }
  move(id: number, point: Point): void {
    if (id !== this.pointer) return;
    this.changed();
    this.overDrop = this.map.contains(point) && !!this.town.pickDrop?.(this.map.screenRay(point));
    const b = this.target(point);
    this.previewDrop(point, b?.id ?? null);
    // FarmTools owns crop-on-field feedback, including rejected planting.
    if (b?.kind === 'farm' && isCrop(this.item) && !this.blocksPlanting) return;
    this.session.message =
      b?.kind === 'compostBarrel'
        ? this.sourceInvalid
          ? '材料已变化，请重新拖动'
          : isCompostItem(this.item)
            ? '松手投入1份 · 不自动补充'
            : '此物品不可堆肥'
        : b && this.buildingCommand(b.id)?.type === 'attachMaterial'
          ? '松手挂载1份材料'
          : b?.kind === 'farm'
            ? isCrop(this.item)
              ? '划过小格播种 · 每格1份'
              : '此物品不可播种'
            : b?.kind === 'shop' && isTradableItem(this.item)
              ? `卖1份 · +${COMMERCE.prices[this.item].sell}币`
              : b?.kind === 'dock'
                ? '装货1份 · 不会卖出'
                : isCrop(this.item)
                  ? '空田播种 / 空地堆放'
                  : '拖到空地堆放';
    const command = this.dropCommand(point, b?.id ?? null);
    if (command?.type === 'mergeStockIntoDrop')
      this.session.message = `松手叠放${materialQuantity(stockIntoDropPlan(this.session.state, command).transferAmount)}份`;
    if (command)
      this.session.message =
        this.item === 'mud'
          ? this.session.reason(command)
            ? '暂不可用'
            : ''
          : (this.session.reason(command) ?? this.session.message);
    if (this.sourceInvalid) this.session.message = '物品已变化，请重新拖动';
    this.refresh();
  }
  end(id: number, point: Point): void {
    if (id !== this.pointer) return;
    this.changed();
    const b = this.target(point);
    const command = this.dropCommand(point, b?.id ?? null);
    if (command) {
      if (!this.session.run(command) && this.item === 'mud') this.session.message = '暂不可用';
    } else if (this.sourceInvalid) this.session.message = '物品已变化，请重新拖动';
    else if (b?.kind !== 'farm' || !isCrop(this.item) || this.overDrop)
      this.session.message = '已取消';
    this.cancel(true);
    this.refresh();
  }
  private previewDrop(point: Point, buildingId: string | null): void {
    const command = !buildingId || this.overDrop ? this.dropCommand(point, buildingId) : null;
    const drop = command?.type === 'mergeStockIntoDrop' ? command.target : null;
    const target =
      command?.type === 'dropProduct' || command?.type === 'plantSapling' ? command : null;
    const valid = command && !this.session.reason(command);
    const at = drop ? dropPosition(drop) : target ? { x: target.x + 0.5, z: target.z + 0.5 } : null;
    const key = at ? `${drop?.id ?? ''}:${at.x}:${at.z}:${Boolean(valid)}` : '';
    if (key === this.previewKey) return;
    this.preview?.destroy();
    this.preview = null;
    this.previewKey = key;
    if (!at) return;
    this.preview = this.factory.shape(
      this.parent,
      'ProductDropPreview',
      at.x,
      (drop
        ? (this.town.dropOrigin(drop.id)?.y ?? 0)
        : (this.session.state.terrainVersion === 6 || this.session.state.terrainVersion === 7) &&
            target
          ? terrainHeight(this.session.state, target.x, target.z)
          : 0) + 0.09,
      at.z,
      drop ? 0.3 : 0.92,
      0.025,
      drop ? 0.3 : 0.92,
      valid ? '#BDCF79' : '#CC7767',
    );
  }
  private dropCommand(point: Point, buildingId: string | null): Command | null {
    if (!this.map.contains(point) || this.changed()) return null;
    const ray = this.map.screenRay(point);
    const dropId = this.town.pickDrop?.(ray);
    if (dropId) {
      const drop = this.session.state.looseDrops.find((d) => d.id === dropId);
      if (!drop) return null;
      const target = dropSnapshot(drop),
        encoded = JSON.stringify(target),
        old = this.dropTargets.get(dropId);
      if (old !== undefined && old !== encoded) this.sourceInvalid = true;
      this.dropTargets.set(dropId, encoded);
      return this.sourceInvalid
        ? null
        : {
            type: 'mergeStockIntoDrop',
            source: { item: this.item, amount: this.sourceAmount },
            target,
          };
    }
    if (this.town.pickTree(ray) || this.town.pickNatural(ray)) return null;
    if (buildingId) return this.buildingCommand(buildingId);
    const pile = this.town.pickStack(this.map.screenRay(point));
    const ground = this.map.ground(point);
    const terrain =
      this.session.state.terrainVersion === 6 || this.session.state.terrainVersion === 7
        ? this.town.pickTerrain(ray)
        : null;
    if (ground && this.item === 'sapling' && !pile)
      return { type: 'plantSapling' as const, x: Math.floor(ground.x), z: Math.floor(ground.z) };
    return ground
      ? {
          type: 'dropProduct' as const,
          item: this.item,
          ...((this.session.state.terrainVersion === 6 ||
            this.session.state.terrainVersion === 7) &&
          (this.item === 'soil' || this.item === 'stone')
            ? { quantity: Math.min(1, this.session.state.inventory[this.item]) }
            : {}),
          x: pile?.x ?? terrain?.x ?? Math.floor(ground.x),
          z: pile?.z ?? terrain?.z ?? Math.floor(ground.z),
        }
      : null;
  }
  private changed(): boolean {
    this.sourceInvalid ||= this.session.state.inventory[this.item] !== this.sourceAmount;
    for (const [id, encoded] of this.dropTargets) {
      const drop = this.session.state.looseDrops.find((d) => d.id === id);
      this.sourceInvalid ||= !drop || JSON.stringify(dropSnapshot(drop)) !== encoded;
    }
    return this.sourceInvalid;
  }
  private buildingCommand(buildingId: string) {
    const building = this.session.state.buildings.find((b) => b.id === buildingId);
    if (!building) return null;
    if (building.kind === 'compostBarrel') {
      this.sourceInvalid ||= this.session.state.inventory[this.item] !== this.sourceAmount;
      return isCompostItem(this.item) && !this.sourceInvalid
        ? {
            type: 'depositCompost' as const,
            buildingId,
            quantity: 1,
            source: { type: 'inventory' as const, item: this.item, amount: this.sourceAmount },
          }
        : null;
    }
    if (this.item === 'treeSeed' && building.kind === 'nursery')
      return { type: 'seedNursery' as const, buildingId };
    if (this.item === 'chilledVegetable' || isGroundTradeItem(this.item)) {
      if (building.kind === 'farm' && isCrop(this.item)) return null;
      if (building.kind === 'shop' || building.kind === 'dock')
        return stockDropCommand(this.session.state, this.item, buildingId);
    }
    return { type: 'attachMaterial' as const, buildingId, item: this.item, quantity: 1 };
  }
  private target(point: Point) {
    if (!this.map.contains(point)) return undefined;
    const id = this.town.pickBuilding(this.map.screenRay(point));
    return this.session.state.buildings.find((b) => b.id === id);
  }
  cancel(silent = false): void {
    const wasActive = this.pointer !== null;
    this.pointer = null;
    this.overDrop = false;
    this.dropTargets.clear();
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
