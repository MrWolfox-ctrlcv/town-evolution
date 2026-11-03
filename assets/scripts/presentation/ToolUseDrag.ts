import { Node } from 'cc';
import { ModelFactory } from './ModelFactory';
import type { Tool, Command } from '../domain/game';
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
  constructor(
    private readonly parent: Node,
    private readonly session: GameSession,
    private readonly map: MapCamera,
    private readonly town: TownView,
    private readonly refresh: () => void,
  ) {}
  begin(tool: Tool, id: number): void {
    this.map.cancelGesture();
    this.pointer = id;
    this.tool = tool;
    this.session.message = '拖到目标后松手';
    this.refresh();
  }
  move(id: number, point: Point): void {
    if (id !== this.pointer) return;
    const command = this.command(point);
    const reason = command ? this.session.reason(command) : null;
    this.mark(command, !reason);
    this.session.message = command ? (reason ?? '松手使用') : '选择可用目标';
    this.refresh();
  }
  end(id: number, point: Point): void {
    if (id !== this.pointer) return;
    const command = this.command(point);
    this.pointer = null;
    this.clearMarker();
    if (command) {
      this.session.run(command);
      if (this.session.message.includes('至少3份木材'))
        this.session.message = '材料尚未就绪，请查看手册';
    } else this.session.message = '未使用工具';
    this.refresh();
  }
  cancel(): void {
    this.pointer = null;
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
    const target =
      command?.type === 'useTool' && command.tool === 'axe'
        ? this.session.state.trees.find((tree) => tree.id === command.treeId)
        : command?.type === 'useTool' && command.tool === 'saw'
          ? command
          : null;
    const key = target ? `${target.x}:${target.z}:${valid}` : '';
    if (key === this.markerKey) return;
    this.clearMarker();
    this.markerKey = key;
    if (!target) return;
    this.marker = new Node('ToolTarget');
    this.parent.addChild(this.marker);
    this.marker.setPosition(target.x + 0.5, 0, target.z + 0.5);
    for (const side of [-1, 1]) {
      const shade = valid ? '#F0D875' : '#D97168';
      this.factory.shape(this.marker, 'EdgeX', side * 0.48, 0.14, 0, 0.08, 0.06, 1, shade);
      this.factory.shape(this.marker, 'EdgeZ', 0, 0.14, side * 0.48, 1, 0.06, 0.08, shade);
    }
  }
  private command(point: Point): Command | null {
    if (!this.map.contains(point)) return null;
    if (this.tool === 'axe') {
      const treeId = this.town.pickTree(this.map.screenRay(point));
      return treeId ? { type: 'useTool', tool: 'axe', treeId } : null;
    }
    if (
      this.town.pickBuilding(this.map.screenRay(point)) ||
      this.town.pickTree(this.map.screenRay(point))
    )
      return null;
    const pile = this.town.pickStack(this.map.screenRay(point));
    const ground = this.map.ground(point);
    return this.tool === 'saw' && ground
      ? {
          type: 'useTool',
          tool: 'saw',
          x: pile?.x ?? Math.floor(ground.x),
          z: pile?.z ?? Math.floor(ground.z),
        }
      : null;
  }
}
