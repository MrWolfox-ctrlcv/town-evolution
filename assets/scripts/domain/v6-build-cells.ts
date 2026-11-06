import { v5Hash } from './v5-world';
import { V6_SIZE, key, occupiedV6TriangleLevels } from './v6-contracts';
import type { V6Resource, V6Biome, V6Cell, Deposit } from './v6-contracts';
import type { Work } from './v6-work';
import type { V6Samples } from './v6-samples';
import type { V6Landform } from './v6-landform';
import type { CompletedCells } from './v6-terrain';
export function* buildCells(samples: V6Samples, landform: V6Landform): Work<CompletedCells> {
  const seed = samples.seed;
  const cells: Array<V6Cell | null> = Array(V6_SIZE * V6_SIZE).fill(null);
  const deposits = new Map<string, Deposit>();
  const trees: { x: number; z: number; baseElevation: number }[] = [];
  const starterTrees = new Set(samples.starter.treeCandidates.map((p) => key(p.x, p.z)));
  for (let z = 0; z < samples.size; z++)
    for (let x = 0; x < samples.size; x++) {
      yield 'cell-finalize';
      const hc = samples.hydrology.at(x, z)!;
      if (hc.state !== 'dryBuildable') continue;
      const reserved = samples.hydrology.reserveCell(x, z);
      const sample: ReturnType<V6Samples['vertex']>[] = [];
      for (let j = 0; j <= 4; j++)
        for (let i = 0; i <= 4; i++) {
          sample.push(samples.vertex(x * 4 + i, z * 4 + j));
          yield 'cell-vertices';
        }
      const groundRange = Object.freeze([
        Math.min(...sample.map((v) => v.ground)),
        Math.max(...sample.map((v) => v.ground)),
      ] as const);
      const maxStone = Math.max(...sample.map((v) => v.stone)),
        maxSoil = Math.max(...sample.map((v) => v.soil));
      const maxDeposit = Math.max(
        ...sample.map((v) => Math.fround(v.ground + Math.max(v.stone, v.soil)) - v.ground),
      );
      let resource: V6Resource | null = null;
      if (maxDeposit > 0 && !reserved) {
        const ceiling = Math.max(
          ...sample.map((v) => Math.fround(v.ground + Math.max(v.stone, v.soil))),
        );
        const occupied = new Set<number>();
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++) {
            const a = j * 5 + i,
              b = (j + 1) * 5 + i;
            for (const indices of [
              [a, b, b + 1],
              [a, b + 1, a + 1],
            ]) {
              yield 'cell-strata';
              const tri = indices.map((k) => sample[k]!);
              for (const level of occupiedV6TriangleLevels(
                tri.map((q) => ({
                  ground: q.ground,
                  top: Math.fround(q.ground + Math.max(q.stone, q.soil)),
                })),
              ))
                occupied.add(level);
            }
          }
        const levels = Object.freeze([...occupied].sort((a, b) => a - b)),
          amount = levels.length;
        if (!amount) throw Error('Positive v6 resource has no occupied stratum');
        if (amount > 64) throw Error('V6 resource exceeds 64 layers');
        resource = Object.freeze({
          id: `n${x}_${z}`,
          x,
          z,
          kind: maxStone >= maxSoil ? 'stone' : 'soil',
          amount,
        });
        deposits.set(
          key(x, z),
          Object.freeze({ resource, ceiling, floor: groundRange[0], levels }),
        );
      }
      const forest = landform.forestness(x + 0.5, z + 0.5);
      const slope = groundRange[1] - groundRange[0];
      const biome: V6Biome =
        resource?.kind === 'stone'
          ? 'mountain'
          : resource?.kind === 'soil' || slope > 0.1
            ? 'hill'
            : forest > 0
              ? 'forest'
              : 'plain';
      const cell = Object.freeze({
        x,
        z,
        biome,
        baseElevation: samples.groundHeight(x + 0.5, z + 0.5),
        naturalHeight: samples.naturalHeight(x + 0.5, z + 0.5),
        groundRange,
        resource,
        reserved,
      });
      cells[z * samples.size + x] = cell;
      const inStarter = x < 36 && z < 36;
      if (
        !reserved &&
        !resource &&
        hc.dryLower >= 1.8 &&
        (inStarter
          ? starterTrees.has(key(x, z))
          : forest > 0 && v5Hash(seed + 881, x, z) < 0.34 + Math.min(0.25, forest * 0.4)) &&
        (inStarter || Math.abs(x - landform.accessX(z)) > 4)
      )
        trees.push(Object.freeze({ x, z, baseElevation: cell.baseElevation }));
    }
  return { cells, deposits, trees: Object.freeze(trees) };
}
