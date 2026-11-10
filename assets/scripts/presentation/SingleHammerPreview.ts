import type { Building, Command } from '../domain/game';
import type { GameSession } from '../application/GameSession';

/** The real command decides empty-crate vs attached-mud behavior; no guessed recipe. */
export function singleHammerPreview(
  session: GameSession,
  command: Command | null,
): { reason: string | null; building: Building | null } | null {
  if (command?.type !== 'useTool' || command.tool !== 'hammer' || !('buildingId' in command))
    return null;
  const result = session.preview(command);
  if (!result.ok) return { reason: result.error, building: null };
  const before = session.state.buildings.find((b) => b.id === command.buildingId);
  const after = result.state.buildings.find((b) => b.id === command.buildingId);
  return { reason: null, building: after && after.kind !== before?.kind ? after : null };
}
export function singleHammerResult(session: GameSession, command: Command | null): Building | null {
  return singleHammerPreview(session, command)?.building ?? null;
}

export function toolFailureMessage(command: Command | null, reason: string): string {
  if (command?.type === 'useTool' && command.tool === 'wateringCan' && 'buildingId' in command)
    return reason;
  const synthesis =
    command?.type === 'hammerAssembly' ||
    command?.type === 'craftMixed' ||
    (command?.type === 'useTool' &&
      (command.tool === 'saw' || command.tool === 'hammer' || command.tool === 'wateringCan'));
  if (!synthesis) return reason;
  // Placement and save failures are actionable, not secret recipe requirements.
  if (
    /^(仓库|仓储|此处|此地块|此田已经|建筑超出|位置必须|请选择地图|请先采集|请先取回|请先领取|请保留一格|另一页面|先采用备份|存档损坏)/.test(
      reason,
    )
  )
    return reason;
  if (reason === '请先在地上叠放木材') return '未选中地面材料';
  return '当前组合未能合成';
}
