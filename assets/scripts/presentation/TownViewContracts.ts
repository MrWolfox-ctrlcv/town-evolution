import type { Node } from 'cc';
import type { Building } from '../domain/game';
import type { ModelPicking } from './ModelPicking';
import type { RenderedCropPicking } from './RenderedCropPicking';
export interface PlacementPreview {
  kind: 'farm' | 'warehouse' | 'cooler' | 'shop' | 'orderBoard' | 'dock';
  x: number;
  z: number;
  valid: boolean;
}
export interface BuildingVisualEntry {
  signature: string;
  node: Node;
  kind: Building['kind'];
  surface: ModelPicking;
  crops: RenderedCropPicking;
}
