import type { geometry } from 'cc';
import type { ObjectTarget } from '../application/ObjectSelection';
import type { GameSession } from '../application/GameSession';
import type { UiState } from './UiContracts';
import type { TownView } from './TownView';
import { focusObject } from './UiContracts';
export function objectTarget(session: GameSession, ui: UiState): ObjectTarget | null {
  if (
    ui.tab !== 'manage' ||
    ui.plantingTree ||
    ui.resetArmed ||
    ui.cropShopOpen ||
    ui.toolShopOpen ||
    session.mode !== 'normal'
  )
    return null;
  if (ui.selected && session.state.buildings.some((b) => b.id === ui.selected))
    return { kind: 'building', id: ui.selected };
  if (
    ui.selectedPile &&
    session.state.groundStacks.some((p) => p.x === ui.selectedPile!.x && p.z === ui.selectedPile!.z)
  )
    return { kind: 'pile', ...ui.selectedPile };
  const selected = ui.selectedResource;
  if (!selected) return null;
  const entries =
    selected.kind === 'tree'
      ? session.state.trees
      : selected.kind === 'drop'
        ? session.state.looseDrops
        : session.state.naturalResources;
  return entries.some((entry) => entry.id === selected.id) ? selected : null;
}
export function pickObject(ui: UiState, town: TownView, ray: geometry.Ray): void {
  const building = town.pickBuilding(ray);
  if (building) {
    focusObject(ui, { kind: 'building', id: building });
    return;
  }
  const pile = town.pickStack(ray);
  if (pile) {
    focusObject(ui, { kind: 'pile', x: pile.x, z: pile.z });
    return;
  }
  const tree = town.pickTree(ray);
  if (tree) {
    focusObject(ui, { kind: 'tree', id: tree });
    return;
  }
  const drop = town.pickDrop?.(ray);
  if (drop) {
    focusObject(ui, { kind: 'drop', id: drop });
    return;
  }
  const natural = town.pickNatural(ray);
  focusObject(ui, natural ? { kind: 'natural', id: natural } : null);
}
