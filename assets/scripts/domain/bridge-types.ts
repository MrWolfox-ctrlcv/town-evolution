export interface BridgePierSnapshot {
  id: string;
  kind: 'woodenPier';
  x: number;
  z: number;
  rotation: 0 | 1 | 2 | 3;
}
export interface BridgeState {
  /** Fixed at assembly. Relocation never stretches a bridge or spends more piers. */
  length: number;
  /** Exact original components; first ID is retained, second stays reserved after consumption. */
  piers: [BridgePierSnapshot, BridgePierSnapshot];
}
export interface BridgePlacement {
  x: number;
  z: number;
  rotation: 0 | 1 | 2 | 3;
  length: number;
}
