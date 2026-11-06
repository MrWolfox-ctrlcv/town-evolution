import type { GameState, LandCell, Command } from '../domain/types';

/** Gesture-owned selection. Repeated pointer samples never count a pile twice. */
export function soilSelection(
  state: GameState,
  selected: readonly LandCell[],
  point: LandCell,
): LandCell[] {
  const result = selected.map((p) => ({ ...p }));
  if (
    soilSelectionAmount(state, result) >= 9 ||
    result.some((p) => p.x === point.x && p.z === point.z)
  )
    return result;
  if (state.groundStacks.some((p) => p.x === point.x && p.z === point.z && p.item === 'soil'))
    result.push({ ...point });
  return result;
}
export function soilSelectionAmount(state: GameState, selected: readonly LandCell[]): number {
  return Math.min(
    9,
    selected.reduce(
      (sum, point) =>
        sum +
        (state.groundStacks.find((p) => p.x === point.x && p.z === point.z && p.item === 'soil')
          ?.amount ?? 0),
      0,
    ),
  );
}
export function soilWaterCommand(selected: readonly LandCell[]): Command | null {
  const anchor = selected[0];
  return anchor
    ? { type: 'useTool', tool: 'wateringCan', ...anchor, sources: selected.map((p) => ({ ...p })) }
    : null;
}
