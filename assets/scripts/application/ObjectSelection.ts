export type ObjectTarget =
  | { kind: 'building' | 'tree' | 'natural' | 'drop'; id: string }
  | { kind: 'pile'; x: number; z: number };
export interface ObjectSelectionState {
  selected: string | null;
  selectedPile: { x: number; z: number } | null;
  selectedResource: { kind: 'tree' | 'natural' | 'drop'; id: string } | null;
}
/** All object changes replace the entire selection; a cleared target cannot revive an old one. */
export function setObjectSelection(ui: ObjectSelectionState, target: ObjectTarget | null): void {
  ui.selected = target?.kind === 'building' ? target.id : null;
  ui.selectedPile = target?.kind === 'pile' ? { x: target.x, z: target.z } : null;
  ui.selectedResource =
    target?.kind === 'tree' || target?.kind === 'natural' || target?.kind === 'drop'
      ? { kind: target.kind, id: target.id }
      : null;
}
export interface ObjectBounds {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}
export function objectKey(target: ObjectTarget): string {
  return target.kind === 'pile' ? `pile:${target.x}:${target.z}` : `${target.kind}:${target.id}`;
}
export function boundsCorners(bounds: ObjectBounds): Array<{ x: number; y: number; z: number }> {
  const points = [];
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) points.push({ x, y, z });
  return points;
}
