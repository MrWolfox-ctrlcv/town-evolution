import { V6TerrainTool } from './V6TerrainTool';
import type { Node, Vec2 } from 'cc';
import { isCrop, hasUnlimitedDurability, ACTIVE_TOOLS } from '../domain/game';
import type { Item, Tool } from '../domain/game';
import type { GameSession } from '../application/GameSession';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
import type { UiState } from './UiContracts';
import type { ToolHandlers, ToolKind } from './ToolTray';
import type { TrayAppearance } from './TrayIcons';
import { FarmTools } from './FarmTools';
import { StockDrag } from './StockDrag';
import { ToolUseDrag } from './ToolUseDrag';
/** One active gesture owns farming, product transfer or a durable tool, never two commits. */
export class ToolRouter implements ToolHandlers {
  active = false;
  private pointer: number | null = null;
  private kind: ToolKind | null = null;
  private readonly farm: FarmTools;
  private readonly stock: StockDrag;
  private readonly tool: ToolUseDrag;
  private readonly terrain: V6TerrainTool;
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
    this.terrain = new V6TerrainTool(parent, session, map, town, refresh);
    this.tool = new ToolUseDrag(parent, session, map, town, refresh);
  }
  begin(kind: ToolKind, id: number, point: Vec2): boolean {
    if (this.session.mode !== 'normal') return false;
    if (this.ui.plantingTree || this.ui.resetArmed || this.ui.repurposeId) {
      this.session.message = '请先取消当前操作';
      this.refresh();
      return false;
    }
    if (kind in this.session.state.tools) {
      const tool = kind as Tool;
      if (!ACTIVE_TOOLS.includes(tool)) {
        this.session.message = tool === 'fertilizer' ? '肥料用途待设计' : '此工具用途尚未开放';
        this.refresh();
        return false;
      }
      if (!hasUnlimitedDurability(tool) && this.session.state.tools[tool] < 1) {
        this.ui.toolShopOpen = true;
        this.session.message = '工具已耗尽，请补充';
        this.refresh();
        return false;
      }
      this.active = true;
      if (tool === 'sickle') this.farm.begin('harvest', id, point);
      else if (
        tool === 'diggingTool' &&
        this.session.state.terrainVersion === 6 &&
        this.ui.terrainMode !== 'farm'
      )
        this.terrain.begin(id, this.ui.terrainMode, this.ui.terrainMaterial);
      else this.tool.begin(tool, id);
    } else {
      const item = kind as Item;
      if (
        this.session.state.inventory[item] <= 0 ||
        (this.session.state.inventory[item] < 1 &&
          !(this.session.state.terrainVersion === 6 && (item === 'soil' || item === 'stone')))
      ) {
        if (isCrop(item)) this.ui.cropShopOpen = true;
        this.session.message = isCrop(item) ? '选择作物购买' : '暂无此产品';
        this.refresh();
        return false;
      }
      this.active = true;
      if (isCrop(item)) this.farm.begin('plant', id, point, item);
      this.stock.begin(item, id);
    }
    this.pointer = id;
    this.kind = kind;
    return true;
  }
  move(id: number, point: Vec2, returning: boolean): void {
    if (id !== this.pointer) return;
    this.farm.move(id, point);
    this.tool.move(id, point);
    this.terrain.move(id, point);
    if (this.farm.hasActed) this.stock.cancel(true);
    else this.stock.move(id, point);
    if (returning) {
      this.session.message = this.isTool() ? '松手收回工具' : '松手收回仓库';
      this.refresh();
    }
  }
  checkTerrainGesture(): boolean {
    return this.terrain.valid();
  }
  updateHint(): void {
    this.farm.updateHint();
  }
  appearance(kind: ToolKind, point: Vec2): TrayAppearance {
    return kind === 'diggingTool' ? this.tool.appearance(point) : kind;
  }
  end(id: number, point: Vec2, returning: boolean): void {
    if (id !== this.pointer) return;
    if (returning) {
      // Tray drags never remove stock up front. Finish without refunding completed
      // farm strokes or spending/duplicating any remaining goods or tool uses.
      this.farm.cancel();
      this.stock.cancel(true);
      this.tool.cancel();
      this.terrain.cancel();
      this.session.message = this.isTool() ? '工具已收回' : '物品已收回仓库';
      this.finish();
      return;
    }
    const planted = this.farm.end(id, point);
    if (planted) this.stock.cancel(true);
    else this.stock.end(id, point);
    this.tool.end(id, point);
    this.terrain.end(id, point);
    this.finish();
  }
  cancel(): void {
    this.farm.cancel();
    this.stock.cancel();
    this.tool.cancel();
    this.terrain.cancel();
    this.finish();
  }
  private isTool(): boolean {
    return this.kind !== null && this.kind in this.session.state.tools;
  }
  private finish(): void {
    this.active = false;
    this.pointer = null;
    this.kind = null;
    this.refresh();
  }
  dispose(): void {
    this.farm.dispose();
    this.stock.dispose();
    this.tool.dispose();
    this.terrain.dispose();
  }
}
