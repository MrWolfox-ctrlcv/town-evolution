import type { Command, Item } from '../domain/game';
import type { QuantityPreset } from '../application/CommerceSelection';
import type { HudTab } from './TownHUD';
import type { PlacementPreview } from './TownView';
export type PlaceKind = Extract<Command, { type: 'place' }>['kind'];
export interface UiState {
  profile: import('../application/TownProfiles').TownProfile;
  tab: HudTab;
  selected: string | null;
  placing: PlaceKind | null;
  preview: PlacementPreview | null;
  resetArmed: boolean;
  cropShopOpen: boolean;
  toolShopOpen: boolean;
  selectedPile: { x: number; z: number } | null;
  plantingTree: boolean;
  repurposeId: string | null;
  tradeItem: Item;
  quantity: QuantityPreset;
}
export interface UiHandlers {
  command: (command: Command) => void;
  build: (kind: PlaceKind) => void;
  cancel: () => void;
  confirm: () => void;
  zoom: (delta: number) => void;
  save: () => void;
  reset: () => void;
  openCropShop: () => void;
  openToolShop: () => void;
  plantTree: () => void;
  switchTown: () => void;
  repurpose: () => void;
  item: () => void;
  quantity: () => void;
  select: (id: string) => void;
}
