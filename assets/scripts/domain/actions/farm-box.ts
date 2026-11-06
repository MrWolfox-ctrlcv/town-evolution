import { validatePlacement } from '../geometry';
import type { GameState, Command } from '../types';
import { createLocalContainer, withdrawLocalContainer } from '../local-container';
import { isCrop } from '../crops';
import { find, getCapacity, getUsedStorage } from '../state';
import { integer, requireRule } from '../guards';
export function attachFarmBox(
  s: GameState,
  c: Extract<Command, { type: 'attachFarmBox' }>,
): string[] {
  const farm = find(s, c.buildingId),
    crate = find(s, c.crateId);
  requireRule(
    farm.kind === 'farm' && crate.kind === 'crate' && farm.id !== crate.id,
    '请选择田地和箱子',
  );
  requireRule(!farm.collectionBox, '这块田已有收获箱');
  requireRule(
    !crate.job && !crate.processingJob && !s.fusion.attachments[crate.id],
    '请先取回箱子的挂载物品',
  );
  const container = createLocalContainer();
  const boxed = { ...farm, collectionBox: { crateId: crate.id, ...container } };
  validatePlacement({ ...s, buildings: s.buildings.filter((b) => b !== crate) }, boxed);
  farm.collectionBox = boxed.collectionBox;
  s.buildings = s.buildings.filter((b) => b !== crate);
  return ['已为田地装上收获箱，挥镰刀后作物进入箱内'];
}
export function withdrawFarmBox(
  s: GameState,
  c: Extract<Command, { type: 'withdrawFarmBox' }>,
): string[] {
  const farm = find(s, c.buildingId);
  requireRule(farm.kind === 'farm' && farm.collectionBox, '此田地没有收获箱');
  requireRule(isCrop(c.item) && integer(c.quantity) && c.quantity > 0, '取货数量无效');
  requireRule(getUsedStorage(s) + c.quantity <= getCapacity(s), '仓库空间不足，作物仍保留在田箱');
  const box = farm.collectionBox;
  const next = withdrawLocalContainer(
    { capacity: box.capacity, stock: box.stock },
    c.item,
    c.quantity,
  );
  farm.collectionBox = { crateId: box.crateId, ...next };
  s.inventory[c.item] += c.quantity;
  return ['已将田箱作物取回仓库'];
}
