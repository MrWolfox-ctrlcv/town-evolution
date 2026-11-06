import { nextQuantity, tradeItems } from '../application/CommerceSelection';
import { focusObject } from './UiContracts';
import { cycleTransportTarget } from './RouteActions';
import type { GameSession } from '../application/GameSession';
import type { TownProfile } from '../application/TownProfiles';
import type { UiState } from './UiContracts';
import type { TownHUD } from './TownHUD';
/** UI-only handlers never modify the authoritative town state. */
export function townUiActions(
  session: GameSession,
  ui: UiState,
  hud: TownHUD,
  refresh: () => void,
  cancelInput: () => void,
  switchProfile?: (profile: TownProfile) => void,
) {
  return {
    switchTown: () => {
      if (session.mode === 'normal' && !session.save()) {
        refresh();
        return;
      }
      switchProfile?.(ui.profile === 'normal' ? 'demo' : 'normal');
    },
    openToolShop: () => {
      ui.toolShopOpen = true;
      refresh();
    },
    plantTree: () => {
      ui.plantingTree = true;
      refresh();
    },
    openCropShop: () => {
      ui.cropShopOpen = true;
      refresh();
    },
    transportTarget: () => cycleTransportTarget(session, ui, refresh),
    item: () => {
      const items = tradeItems(session.state);
      ui.tradeItem = items[(items.indexOf(ui.tradeItem) + 1) % items.length];
      refresh();
    },
    quantity: () => {
      ui.quantity = nextQuantity(ui.quantity);
      refresh();
    },
    toggleBuildingActions: () => {
      ui.moreBuildingActions = !ui.moreBuildingActions;
      refresh();
    },
    terrainMode: (mode: UiState['terrainMode']) => {
      cancelInput();
      ui.terrainMode = mode;
      session.message = `${{ farm: '开田', dig: '挖地', fill: '填地' }[mode]}模式 · 拖动左侧挖掘工具到目标格`;
      refresh();
    },
    terrainMaterial: () => {
      cancelInput();
      ui.terrainMaterial = ui.terrainMaterial === 'soil' ? 'stone' : 'soil';
      refresh();
    },
    select: (id: string) => {
      hud.openDetails();
      focusObject(ui, { kind: 'building', id });
      refresh();
    },
  };
}
