import { V6_GENERATOR_REVISION, V6_SIZE, V6_SUBDIVISIONS, inWorld, key } from './v6-contracts';
import type { V6Cell, V6Resource, Deposit } from './v6-contracts';
import type { V6Lattice } from './v6-samples';
import type { V6TerrainTransfer } from './v6-terrain-data';
import type { CompletedCells } from './v6-terrain';
import type { Work } from './v6-work';
import { validateV6TransferRecipe } from './v6-transfer-recipe';

function requireData(condition: unknown): asserts condition {
  if (!condition) throw Error('Invalid v6 worker terrain data');
}
function record(value: unknown, fields: string[]): Record<string, unknown> {
  requireData(
    value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype,
  );
  const keys = Reflect.ownKeys(value);
  requireData(keys.length === fields.length);
  for (const field of keys) {
    requireData(typeof field === 'string' && fields.includes(field));
    const d = Object.getOwnPropertyDescriptor(value, field);
    requireData(d && 'value' in d && d.enumerable);
  }
  return value as Record<string, unknown>;
}
function height(value: unknown): number {
  requireData(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 128);
  return value;
}
function resource(value: unknown, x: number, z: number): V6Resource {
  const r = record(value, ['id', 'x', 'z', 'kind', 'amount']);
  requireData(r.id === `n${x}_${z}` && r.x === x && r.z === z);
  requireData(r.kind === 'stone' || r.kind === 'soil');
  requireData(
    typeof r.amount === 'number' && Number.isInteger(r.amount) && r.amount > 0 && r.amount <= 64,
  );
  return Object.freeze({ id: r.id, x, z, kind: r.kind, amount: r.amount });
}
function sameResource(a: V6Resource, b: V6Resource): boolean {
  return a.id === b.id && a.x === b.x && a.z === b.z && a.kind === b.kind && a.amount === b.amount;
}
function* lattice(value: unknown): Work<V6Lattice> {
  const data = record(value, ['grounds', 'stones', 'soils']);
  const length = (V6_SIZE * V6_SUBDIVISIONS + 1) ** 2;
  const input = [data.grounds, data.stones, data.soils];
  for (const a of input)
    requireData(
      a instanceof Float32Array &&
        a.buffer instanceof ArrayBuffer &&
        a.length === length &&
        a.byteOffset === 0 &&
        a.buffer.byteLength === length * 4,
    );
  const [g, s, t] = input as [Float32Array, Float32Array, Float32Array];
  requireData(new Set(input.map((a) => (a as Float32Array).buffer)).size === 3);
  // Private owned copies prevent a retained DTO from mutating a published world's authority.
  const output: Float32Array[] = [];
  for (let i = 0; i < 3; i++) {
    output.push(new Float32Array(length));
    yield 'transfer-validate';
  }
  const sourceBits = [g, s, t].map((a) => new Uint32Array(a.buffer));
  const targetBits = output.map((a) => new Uint32Array(a.buffer));
  for (let offset = 0; offset < length; offset += 512) {
    const end = Math.min(length, offset + 512);
    for (let i = offset; i < end; i++) {
      const missing = Number.isNaN(g[i]!);
      requireData(Number.isNaN(s[i]!) === missing && Number.isNaN(t[i]!) === missing);
      if (!missing) {
        height(g[i]);
        height(s[i]);
        height(t[i]);
        requireData(s[i]! >= 0 && t[i]! >= 0);
      }
    }
    // Copy raw Float32 bits, including untouched NaNs. No float/string conversion.
    for (let i = 0; i < 3; i++) targetBits[i]!.set(sourceBits[i]!.subarray(offset, end), offset);
    yield 'transfer-validate';
  }
  return { grounds: output[0]!, stones: output[1]!, soils: output[2]! };
}
function* completed(value: unknown): Work<CompletedCells> {
  const data = record(value, ['cells', 'deposits', 'trees']);
  requireData(Array.isArray(data.cells) && data.cells.length === V6_SIZE ** 2);
  requireData(data.deposits instanceof Map && data.deposits.size <= V6_SIZE ** 2);
  requireData(Array.isArray(data.trees) && data.trees.length <= V6_SIZE ** 2);
  const cells: CompletedCells['cells'] = [];
  let resourceCount = 0;
  for (let index = 0; index < data.cells.length; index++) {
    const raw: unknown = data.cells[index];
    if (raw === null) cells.push(null);
    else {
      const c = record(raw, [
        'x',
        'z',
        'biome',
        'baseElevation',
        'naturalHeight',
        'groundRange',
        'resource',
        'reserved',
      ]);
      const x = index % V6_SIZE,
        z = Math.floor(index / V6_SIZE);
      requireData(c.x === x && c.z === z && typeof c.reserved === 'boolean');
      requireData(
        c.biome === 'plain' || c.biome === 'hill' || c.biome === 'mountain' || c.biome === 'forest',
      );
      requireData(Array.isArray(c.groundRange) && c.groundRange.length === 2);
      const low = height(c.groundRange[0]),
        high = height(c.groundRange[1]);
      const baseElevation = height(c.baseElevation),
        naturalHeight = height(c.naturalHeight);
      requireData(low <= high && naturalHeight >= baseElevation - 1e-6);
      const r = c.resource === null ? null : resource(c.resource, x, z);
      requireData(!r || (!c.reserved && c.biome === (r.kind === 'stone' ? 'mountain' : 'hill')));
      if (r) resourceCount++;
      cells.push(
        Object.freeze({
          x,
          z,
          biome: c.biome,
          baseElevation,
          naturalHeight,
          groundRange: Object.freeze([low, high] as const),
          resource: r,
          reserved: c.reserved,
        }),
      );
    }
    yield 'transfer-validate';
  }
  requireData(data.deposits.size === resourceCount);
  const deposits = new Map<string, Deposit>();
  let previous = -1;
  for (const [k, value] of data.deposits) {
    const d = record(value, ['resource', 'ceiling', 'floor', 'levels']);
    const r0 = record(d.resource, ['id', 'x', 'z', 'kind', 'amount']);
    requireData(typeof r0.x === 'number' && typeof r0.z === 'number' && inWorld(r0.x, r0.z));
    const r = resource(d.resource, r0.x, r0.z),
      index = r.z * V6_SIZE + r.x;
    requireData(k === key(r.x, r.z) && index > previous);
    previous = index;
    const c = cells[index];
    requireData(c?.resource && sameResource(c.resource, r));
    const ceiling = height(d.ceiling),
      floor = height(d.floor);
    requireData(floor === c.groundRange[0] && ceiling > floor);
    requireData(Array.isArray(d.levels) && d.levels.length === r.amount);
    const levels: number[] = [];
    for (const level of d.levels) {
      requireData(
        typeof level === 'number' &&
          Number.isInteger(level) &&
          Math.abs(level) <= 130 &&
          (levels.length === 0 || level > levels[levels.length - 1]!),
      );
      levels.push(level);
    }
    deposits.set(
      k,
      Object.freeze({ resource: c.resource, ceiling, floor, levels: Object.freeze(levels) }),
    );
    yield 'transfer-validate';
  }
  const trees: { x: number; z: number; baseElevation: number }[] = [];
  previous = -1;
  for (const value of data.trees) {
    const t = record(value, ['x', 'z', 'baseElevation']);
    requireData(typeof t.x === 'number' && typeof t.z === 'number' && inWorld(t.x, t.z));
    const index = t.z * V6_SIZE + t.x,
      c: V6Cell | null | undefined = cells[index];
    requireData(
      index > previous &&
        c &&
        !c.reserved &&
        c.resource === null &&
        t.baseElevation === c.baseElevation,
    );
    previous = index;
    trees.push(Object.freeze({ x: t.x, z: t.z, baseElevation: c.baseElevation }));
    yield 'transfer-validate';
  }
  return { cells, deposits, trees: Object.freeze(trees) };
}
/** Bounded schema/consistency validation for same-origin IPC, not an arbitrary world importer. */
export function* validateV6Transfer(value: unknown, seed: number): Work<V6TerrainTransfer> {
  const recipe = validateV6TransferRecipe(value, seed);
  const raw = value as { lattice: unknown; complete: unknown };
  const grid = yield* lattice(raw.lattice);
  const complete = yield* completed(raw.complete);
  return { format: 1, revision: V6_GENERATOR_REVISION, ...recipe, lattice: grid, complete };
}
