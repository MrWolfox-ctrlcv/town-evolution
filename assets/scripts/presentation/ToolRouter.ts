import type { Node, Vec2 } from 'cc';
import { isCrop } from '../domain/game';
import type { Item, Tool } from '../domain/game';
import type { GameSession } from '../application/GameSession';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
import type { UiState } from './UiContracts';
import type { ToolHandlers, ToolKind } from './ToolTray';
import { FarmTools } from './FarmTools';
import { StockDrag } from './StockDrag';
import { ToolUseDrag } from './ToolUseDrag';
/** One active gesture owns farming, product transfer or a durable tool, never two commits. */
export class ToolRouter implements ToolHandlers {
  active = false;
  private readonly farm: FarmTools;
  private readonly stock: StockDrag;
  private readonly tool: ToolUseDrag;
  constructor(
    parent: Node,
    private readonly session: GameSession,
    map: MapCamera,
    town: TownView,
    private readonly ui: UiState,
    private readonly refresh: () => void,
  ) {
    this.farm = new FarmTools(parent, session, map, town, refresh);
    this.stock = new StockDrag(parent, session, map, town, refresh);
    this.tool = new ToolUseDrag(parent, session, map, town, refresh);
  }
  begin(kind: ToolKind, id: number, point: Vec2): boolean {
    if (this.session.mode !== 'normal') return false;
    if (this.ui.placing || this.ui.plantingTree || this.ui.resetArmed || this.ui.repurposeId) {
      this.session.message = '请先取消当前操作';
      this.refresh();
      return false;
    }
    if (kind in this.session.state.tools) {
      const tool = kind as Tool;
      if (!['sickle', 'axe', 'saw', 'hammer'].includes(tool)) {
        this.session.message = '此工具用途尚未开放';
        this.refresh();
        return false;
      }
      if (this.session.state.tools[tool] < 1) {
        this.ui.toolShopOpen = true;
        this.session.message = '工具已耗尽，请补充';
        this.refresh();
        return false;
      }
      this.active = true;
      if (tool === 'sickle') this.farm.begin('harvest', id, point);
      else this.tool.begin(tool, id);
    } else {
      const item = kind as Item;
      if (this.session.state.inventory[item] < 1) {
        if (isCrop(item)) this.ui.cropShopOpen = true;
        this.session.message = isCrop(item) ? '选择作物购买' : '暂无此产品';
        this.refresh();
        return false;
      }
      this.active = true;
      if (isCrop(item)) this.farm.begin('plant', id, point, item);
      this.stock.begin(item, id);
    }
    return true;
  }
  move(id: number, point: Vec2): void {
    this.farm.move(id, point);
    this.tool.move(id, point);
    if (this.farm.hasActed) this.stock.cancel(true);
    else this.stock.move(id, point);
  }
  updateHint(): void {
    this.farm.updateHint();
  }
  end(id: number, point: Vec2): void {
    const planted = this.farm.end(id, point);
    if (planted) this.stock.cancel(true);
    else this.stock.end(id, point);
    this.tool.end(id, point);
    this.active = false;
    this.refresh();
  }
  cancel(): void {
    this.farm.cancel();
    this.stock.cancel();
    this.tool.cancel();
    this.active = false;
    this.refresh();
  }
  dispose(): void {
    this.farm.dispose();
    this.stock.dispose();
    this.tool.dispose();
  }
}
