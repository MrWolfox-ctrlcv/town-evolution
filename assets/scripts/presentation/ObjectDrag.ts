import type { Node, Vec3, geometry } from 'cc';
import type { ProductDropSurface } from '../application/StackDrop';
import type { Point } from '../application/MapGesture';
import type { GameSession } from '../application/GameSession';
import type { UiState } from './UiContracts';
import type { TownView } from './TownView';
import { BuildingDrag } from './BuildingDrag';
import { StackDrag } from './StackDrag';
export class ObjectDrag {
  private readonly buildings: BuildingDrag;
  private readonly stacks: StackDrag;
  constructor(
    parent: Node,
    session: GameSession,
    ui: UiState,
    town: TownView,
    refresh: () => void,
    products: ProductDropSurface,
  ) {
    this.buildings = new BuildingDrag(parent, session, ui, town, refresh);
    this.stacks = new StackDrag(parent, session, ui, town, refresh, products);
  }
  candidate(ray: geometry.Ray): string | null {
    return this.stacks.candidate(ray) ?? this.buildings.candidate(ray);
  }
  move(id: string, point: Vec3, ray: geometry.Ray | null, screen: Point): void {
    if (id.startsWith('pile:')) this.stacks.move(id, point, ray, screen);
    else if (ray) this.buildings.move(id, point, ray);
  }
  drop(id: string, ray: geometry.Ray | null, screen: Point): void {
    if (id.startsWith('pile:')) this.stacks.drop(id, ray, screen);
    else this.buildings.drop(id, ray);
  }
  clear(): void {
    this.buildings.clear();
    this.stacks.clear();
  }
  dispose(): void {
    this.buildings.dispose();
    this.stacks.dispose();
  }
}
