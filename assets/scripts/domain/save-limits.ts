/** One existing wire-size limit for imports, exports and predictable v6 transaction growth. */
export const MAX_SAVE_CHARACTERS = 4_000_000;
export class SaveSizeError extends Error {
  constructor() {
    super('本次操作会超过存档大小上限，操作未执行；请先减少地形层或地面物品。');
  }
}
/** Exact JSON character count, matching the actual uncompressed save input. No estimate or cell cap. */
export function serializedSaveLength(value: unknown): number {
  const encoded = JSON.stringify(value);
  if (typeof encoded !== 'string') throw new Error('存档结构无效');
  return encoded.length;
}
export function assertSaveFits(value: unknown): void {
  if (serializedSaveLength(value) > MAX_SAVE_CHARACTERS) throw new SaveSizeError();
}
