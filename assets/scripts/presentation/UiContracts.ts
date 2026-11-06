import type { Command, Item } from '../domain/game';
import type { QuantityPreset } from '../application/CommerceSelection';
import type { HudTab } from './TownHUD';
import { setObjectSelection } from '../application/ObjectSelection';
import type { ObjectTarget, ObjectSelectionState } from '../application/ObjectSelection';
export interface UiState extends ObjectSelectionState {
  terrainMode: 'farm' | 'dig' | 'fill';
  terrainMaterial: 'soil' | 'stone';
  profile: import('../application/TownProfiles').TownProfile;
  tab: HudTab;
  resetArmed: boolean;
  cropShopOpen: boolean;
  toolShopOpen: boolean;
  plantingTree: boolean;
  repurposeId: string | null;
  tradeItem: Item;
  transportTargetId: string | null;
  quantity: QuantityPreset;
  moreBuildingActions: boolean;
}
export interface UiHandlers {
  command: (command: Command) => void;
  cancel: () => void;
  zoom: (delta: number) => void;
  overview?: () => void;
  save: () => void;
  reset: () => void;
  openCropShop: () => void;
  openToolShop: () => void;
  plantTree: () => void;
  switchTown: () => void;
  openSaves?: () => void;
  exitToTitle?: () => void;
  repurpose: () => void;
  item: () => void;
  quantity: () => void;
  terrainMode?: (mode: UiState['terrainMode']) => void;
  terrainMaterial?: () => void;
  transportTarget?: () => void;
  toggleBuildingActions: () => void;
  select: (id: string) => void;
}

export function createUiState(): UiState {
  return {
    profile: 'normal',
    terrainMode: 'farm',
    terrainMaterial: 'soil',
    tab: 'manage',
    selected: null,
    resetArmed: false,
    cropShopOpen: false,
    toolShopOpen: false,
    selectedPile: null,
    selectedResource: null,
    plantingTree: false,
    repurposeId: null,
    tradeItem: 'vegetable',
    transportTargetId: null,
    quantity: 1,
    moreBuildingActions: false,
  };
}
/** A committed object interaction replaces contextual/global controls, without touching the town. */
export function focusObject(ui: UiState, target: ObjectTarget | null): void {
  setObjectSelection(ui, target);
  ui.tab = 'manage';
  ui.cropShopOpen = false;
  ui.toolShopOpen = false;
  ui.moreBuildingActions = false;
}
