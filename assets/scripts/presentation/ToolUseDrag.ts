import { singleHammerResult, toolFailureMessage } from './SingleHammerPreview';
import { Node } from 'cc';
import { EntityAssemblySelection } from '../application/EntityAssemblySelection';
import { hammerTarget } from './HammerTarget';
import { entityAssemblyPreview } from './EntityAssemblyPreview';
import { ModelFactory } from './ModelFactory';
import { footprint, toolCraftPlan, mixedCraftPlan } from '../domain/game';
import type { Tool, Command, LandCell } from '../domain/game';
import { soilSelection, soilSelectionAmount, soilWaterCommand } from '../application/SoilWatering';
import { MixedCraftSelection } from '../application/MixedCraftSelection';
import { mixedCraftPreview, mixedSourceRings } from './MixedCraftPreview';
import type { Point } from '../application/MapGesture';
import type { GameSession } from '../application/GameSession';
import type { MapCamera } from './MapCamera';
import type { TownView } from './TownView';
/** Building/material tools commit on release only, never while passing over a target. */
export class ToolUseDrag {
  private pointer: number | null = null;
  private tool: Tool = 'axe';
  private readonly factory = new ModelFactory();
  private marker: Node | null = null;
  private markerKey = '';
  private soil: LandCell[] = [];
  private readonly mixed = new MixedCraftSelection();
  private readonly entities = new EntityAssemblySelection();
  constructor(
    private readonly parent: Node,
    private readonly session: GameSession,
    private readonly map: MapCamera,
    private readonly town: TownView,
    private readonly refresh: () => void,
  ) {}
  begin(tool: Tool, id: number): void {
    this.cancel();
    this.map.cancelGesture();
    this.pointer = id;
    this.tool = tool;
    this.session.message = '';
    this.refresh();
  }
  appearance(point: Point): 'diggingTool' | 'diggingPickaxe' {
    if (!this.map.contains(point)) return 'diggingTool';
    const id = this.town.pickNatural(this.map.screenRay(point));
    return this.session.state.naturalResources.find((resource) => resource.id === id)?.kind ===
      'stone'
      ? 'diggingPickaxe'
      : 'diggingTool';
  }
  move(id: number, point: Point): void {
    if (id !== this.pointer) return;
    const command = this.command(point);
    const reason = command ? this.session.reason(command) : null;
    this.mark(command, !reason);
    this.session.message =
      this.mixed.invalid || this.entities.invalid
        ? '材料堆已变化，请重新拖动'
        : command?.type === 'hammerAssembly' ||
            command?.type === 'craftMixed' ||
            (command?.type === 'useTool' && command.tool === 'wateringCan' && 'sources' in command)
          ? ''
          : reason
            ? toolFailureMessage(command, reason)
            : !command && this.tool === 'saw' && this.map.contains(point)
              ? '未选中地面材料'
              : '';
    this.refresh();
  }
  end(id: number, point: Point): void {
    if (id !== this.pointer) return;
    const command = this.command(point);
    this.pointer = null;
    this.soil = [];
    this.clearMarker();
    if (command) {
      if (!this.session.run(command))
        this.session.message = toolFailureMessage(command, this.session.message);
    } else
      this.session.message =
        this.mixed.invalid || this.entities.invalid
          ? '材料堆已变化，请重新拖动'
          : this.tool === 'saw' && this.map.contains(point)
            ? '未选中地面材料'
            : '未使用工具';
    this.mixed.clear();
    this.entities.clear();
    this.refresh();
  }
  cancel(): void {
    this.pointer = null;
    this.soil = [];
    this.mixed.clear();
    this.entities.clear();
    this.clearMarker();
  }
  dispose(): void {
    this.cancel();
    this.factory.dispose();
  }
  private clearMarker(): void {
    this.marker?.destroy();
    this.marker = null;
    this.markerKey = '';
  }
  private mark(command: Command | null, valid: boolean): void {
    const resource =
      command?.type === 'gatherNatural'
        ? this.session.state.naturalResources.find((entry) => entry.id === command.resourceId)
        : null;
    const saw =
      command?.type === 'craftMixed'
        ? mixedCraftPlan(this.session.state, command)
        : command?.type === 'useTool' &&
            (command.tool === 'saw' || command.tool === 'hammer') &&
            'x' in command
          ? toolCraftPlan(this.session.state, command.tool, command.x, command.z)
          : null;
    const assembled = this.entities.plan(this.session.state),
      single = valid ? singleHammerResult(this.session, command) : null;
    const building =
      single ??
      assembled?.building ??
      (command?.type === 'hammerAssembly'
        ? this.session.state.buildings.find((b) => b.id === this.entities.selected[0]?.id)
        : null) ??
      saw?.building ??
      (command?.type === 'useTool' && 'buildingId' in command
        ? this.session.state.buildings.find((b) => b.id === command.buildingId)
        : null);
    const target =
      resource ??
      building ??
      (command?.type === 'useTool' && command.tool === 'axe'
        ? this.session.state.trees.find((tree) => tree.id === command.treeId)
        : command?.type === 'craftMixed' || (command?.type === 'useTool' && 'x' in command)
          ? command
          : null);
    const selected =
      command?.type === 'useTool' && command.tool === 'wateringCan' && 'sources' in command
        ? this.soil
        : [];
    const surface = resource ? this.town.naturalOrigin(resource.id) : null;
    const height = surface?.y ?? 0;
    const size = building
      ? footprint(building)
      : {
          width: command?.type === 'useTool' && command.tool === 'diggingTool' ? 2 : 1,
          depth: command?.type === 'useTool' && command.tool === 'diggingTool' ? 2 : 1,
        };
    const key = target
      ? JSON.stringify([
          target.x,
          target.z,
          surface,
          height,
          size,
          single?.kind,
          valid,
          selected,
          this.mixed.selected,
          this.entities.selected,
        ])
      : '';
    if (key === this.markerKey) return;
    this.clearMarker();
    this.markerKey = key;
    if (!target || (resource && !surface)) return;
    this.marker = new Node('ToolTarget');
    this.parent.addChild(this.marker);
    const originX = surface?.x ?? target.x + size.width / 2,
      originZ = surface?.z ?? target.z + size.depth / 2;
    this.marker.setPosition(originX, height, originZ);
    const outline = (x: number, z: number, width: number, depth: number, shade: string) => {
      for (const side of [-1, 1]) {
        this.factory.shape(
          this.marker!,
          'EdgeX',
          x + width / 2 + side * width * 0.48 - originX,
          0.14,
          z + depth / 2 - originZ,
          0.08,
          0.06,
          depth,
          shade,
        );
        this.factory.shape(
          this.marker!,
          'EdgeZ',
          x + width / 2 - originX,
          0.14,
          z + depth / 2 + side * depth * 0.48 - originZ,
          width,
          0.06,
          0.08,
          shade,
        );
      }
    };
    if (selected.length) {
      for (const point of selected) {
        outline(point.x, point.z, 1, 1, '#84CED0');
        this.factory.shape(
          this.marker,
          'WaterDrop',
          point.x + 0.5 - originX,
          0.72,
          point.z + 0.5 - originZ,
          0.1,
          0.18,
          0.1,
          '#94DBE4',
          'sphere',
        );
      }
      if (soilSelectionAmount(this.session.state, selected) === 9 && valid) {
        const preview = this.factory.asset('pile-mud-1', 'WateredSoilPreview');
        preview.setPosition(target.x + 0.5 - originX, 0.58, target.z + 0.5 - originZ);
        this.marker.addChild(preview);
      }
    } else {
      outline(target.x, target.z, size.width, size.depth, valid ? '#F0D875' : '#D97168');
      if (command?.type === 'craftMixed')
        mixedCraftPreview(this.marker, this.factory, command, originX, originZ, valid);
      else if (command?.type === 'hammerAssembly')
        entityAssemblyPreview(
          this.marker,
          this.factory,
          this.session.state,
          this.entities.selected,
          assembled?.building ?? null,
          originX,
          originZ,
          valid,
        );
      else if (single)
        entityAssemblyPreview(
          this.marker,
          this.factory,
          this.session.state,
          this.entities.selected,
          single,
          originX,
          originZ,
          valid,
        );
      else if (this.tool === 'hammer')
        mixedSourceRings(this.marker, this.factory, this.mixed.selected, originX, originZ, valid);
    }
  }
  private command(point: Point): Command | null {
    if (!this.map.contains(point)) return null;
    const ray = this.map.screenRay(point);
    if (this.town.pickDrop?.(ray)) return null;
    if (this.tool === 'axe') {
      const treeId = this.town.pickTree(ray);
      return treeId ? { type: 'useTool', tool: 'axe', treeId } : null;
    }
    if (this.tool === 'diggingTool') {
      const resourceId = this.town.pickNatural(ray);
      const resource = this.session.state.naturalResources.find((entry) => entry.id === resourceId);
      if (resource) return { type: 'gatherNatural', resourceId: resource.id };
      if (this.town.pickBuilding(ray) || this.town.pickTree(ray) || this.town.pickStack(ray))
        return null;
      const ground = this.map.ground(point);
      return ground
        ? { type: 'useTool', tool: 'diggingTool', x: Math.floor(ground.x), z: Math.floor(ground.z) }
        : null;
    }
    if (this.tool === 'wateringCan') {
      const buildingId = this.town.pickBuilding(ray);
      if (buildingId) return { type: 'useTool', tool: 'wateringCan', buildingId };
      if (this.town.pickTree(ray) || this.town.pickNatural(ray)) return null;
      const pile = this.town.pickStack(ray);
      if (!pile) return null;
      this.soil = soilSelection(this.session.state, this.soil, pile);
      return this.soil.some((p) => p.x === pile.x && p.z === pile.z)
        ? soilWaterCommand(this.soil)
        : null;
    }
    if (this.tool === 'hammer')
      return hammerTarget(this.session, this.town, this.map, point, this.mixed, this.entities);
    if (this.town.pickBuilding(ray) || this.town.pickTree(ray) || this.town.pickNatural(ray))
      return null;
    const pile = this.town.pickStack(ray);
    return this.tool === 'saw' && pile
      ? {
          type: 'useTool',
          tool: 'saw',
          x: pile.x,
          z: pile.z,
        }
      : null;
  }
}
