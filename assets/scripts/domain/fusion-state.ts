import type { FusionState, GameState, Building, Command, RecipeId } from './types';
import { emptyStock, stockTotal } from './commerce';
import { ITEM_KEYS } from './crops';
import { MAX_VALUE } from './config';
import { integer, requireRule } from './guards';
import { FUSION, RECIPE_DEFINITIONS } from './recipes';
export function emptyFusion(): FusionState {
  return { attachments: {}, discoveries: {} };
}
export function cloneFusion(fusion: FusionState): FusionState {
  return {
    attachments: Object.fromEntries(
      Object.entries(fusion.attachments).map(([id, stock]) => [id, { ...stock }]),
    ),
    discoveries: Object.fromEntries(
      Object.entries(fusion.discoveries).map(([id, d]) => [id, { ...d }]),
    ),
  };
}
function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
/** Additive schema8 extension. Only absence means a pre-checkpoint save; malformed data rejects. */
export function importFusion(raw: unknown, buildings: Building[], now: number): FusionState {
  if (raw === undefined) return emptyFusion();
  requireRule(record(raw) && record(raw.attachments) && record(raw.discoveries), '融合记录无效');
  const result = emptyFusion();
  for (const [id, value] of Object.entries(raw.attachments)) {
    requireRule(buildings.some((b) => b.id === id) && record(value), '挂载材料的建筑不存在');
    requireRule(
      Object.keys(value).every((key) => ITEM_KEYS.includes(key as never)),
      '未知挂载材料',
    );
    const stock = emptyStock();
    for (const item of ITEM_KEYS) {
      requireRule(integer(value[item], FUSION.attachmentLimit), '挂载数量无效');
      stock[item] = value[item] as number;
    }
    requireRule(
      stockTotal(stock) > 0 && stockTotal(stock) <= FUSION.attachmentLimit,
      '挂载材料超过容量或为空',
    );
    result.attachments[id] = stock;
  }
  for (const [id, value] of Object.entries(raw.discoveries)) {
    requireRule(RECIPE_DEFINITIONS.some((r) => r.id === id) && record(value), '未知图鉴记录');
    requireRule(
      integer(value.count) && value.count > 0 && integer(value.firstDiscoveredAt, now),
      '图鉴次数或时间无效',
    );
    result.discoveries[id as RecipeId] = {
      count: value.count,
      firstDiscoveredAt: value.firstDiscoveredAt,
    };
  }
  return result;
}
/** Called only after a successful atomic command, never for previews or paid shortcut upgrades. */
export function recordRecipe(s: GameState, command: Command, now: number): string | undefined {
  let id: RecipeId | undefined;
  if (command.type === 'useTool')
    id =
      command.tool === 'axe'
        ? 'gather-wood'
        : command.tool === 'saw'
          ? 'build-warehouse'
          : 'expand-warehouse';
  if (command.type === 'combine' || command.type === 'dragMerge') id = 'merge-cold';
  if (!id) return;
  const old = s.fusion.discoveries[id];
  s.fusion.discoveries[id] = {
    count: Math.min(MAX_VALUE, (old?.count ?? 0) + 1),
    firstDiscoveredAt: old?.firstDiscoveredAt ?? now,
  };
  return old ? undefined : RECIPE_DEFINITIONS.find((recipe) => recipe.id === id)?.title;
}
export function mergeAttachments(s: GameState, retained: string, consumed: string): void {
  const left = s.fusion.attachments[retained],
    right = s.fusion.attachments[consumed];
  if (!right) return;
  const stock = { ...(left ?? emptyStock()) };
  for (const item of ITEM_KEYS) stock[item] += right[item];
  requireRule(
    stockTotal(stock) <= FUSION.attachmentLimit,
    '两座建筑的挂载材料超过5份，请先取回部分材料',
  );
  s.fusion.attachments[retained] = stock;
  delete s.fusion.attachments[consumed];
}
