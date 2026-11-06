import type { Action } from './Widgets';
import type { UiHandlers, UiState } from './UiContracts';
export function terrainModeActions(ui: UiState, handlers: UiHandlers): Action[] {
  if (!handlers.terrainMode) return [];
  return [
    ...(['farm', 'dig', 'fill'] as const).map((mode) => ({
      text: `${ui.terrainMode === mode ? '✓ ' : ''}${{ farm: '开田', dig: '挖地', fill: '填地' }[mode]}`,
      run: () => handlers.terrainMode?.(mode),
    })),
    ...(ui.terrainMode === 'fill' && handlers.terrainMaterial
      ? [
          {
            text: `填料：${ui.terrainMaterial === 'stone' ? '石料' : '土壤'} · 切换`,
            run: handlers.terrainMaterial,
          },
        ]
      : []),
  ];
}
