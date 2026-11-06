import { sortWork } from './v6-work';
import type { Work } from './v6-work';
import { V5_NATURAL_COAST_REVISION } from './v5-natural-coast-types';
import type {
  NaturalCoastFeature,
  NaturalCoastBaseHydrology,
  CoastBaseCell,
} from './v5-natural-coast-types';
import { coastTransform } from './v5-natural-coast-geometry';
function hash(seed: number, x: number, z: number): number {
  let n = (seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
interface Candidate {
  readonly anchor: NaturalCoastFeature['anchor'];
  readonly rotation: NaturalCoastFeature['rotation'];
  readonly passageRows: number;
  readonly score: number;
}
/** Pure portSites candidate enumeration. No saved resources or objects are created/deleted. */
function* candidates(base: NaturalCoastBaseHydrology): Work<Candidate[]> {
  const result: Candidate[] = [],
    at = (x: number, z: number) =>
      x >= 0 && z >= 0 && x < base.size && z < base.size ? base.classifyCell(x, z) : null,
    freshFree = (c: CoastBaseCell) =>
      base.fields(c.x + 0.5, c.z + 0.5).freshwater + Math.SQRT1_2 <= -1;
  for (let z = 1; z < base.size - 2; z++)
    for (let x = 1; x < base.size - 2; x++) {
      yield 'coast-candidates';
      if (
        ![at(x, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1)].every(
          (c) => c?.state === 'dryBuildable',
        )
      )
        continue;
      for (const rotation of [0, 1, 2, 3] as const) {
        const row = (d: number) =>
          [0, 1].map((offset) =>
            at(
              rotation % 2 === 0 ? x + offset : rotation === 1 ? x + 2 + d : x - 1 - d,
              rotation % 2 === 1 ? z + offset : rotation === 0 ? z + 2 + d : z - 1 - d,
            ),
          );
        if (row(0).some((c) => !c || c.state === 'dryBuildable')) continue;
        let passageRows = 0;
        for (let d = 0; d < 9; d++) {
          const r = row(d);
          if (r.some((c) => !c || c.state === 'dryBuildable' || !freshFree(c))) break;
          if (r.every((c) => c!.seaDockWater)) {
            if (row(d + 1).every((c) => c?.seaDockWater && freshFree(c))) passageRows = d + 2;
            break;
          }
        }
        if (passageRows)
          result.push({
            anchor: { x, z, width: 2, depth: 2 },
            rotation,
            passageRows,
            score: Math.hypot(x - 8, z - 5) + hash(base.seed, x, z) * 11,
          });
      }
    }
  return yield* sortWork(result, (a, b) => a.score - b.score, 'coast-sort');
}
export function* buildCoastFeature(base: NaturalCoastBaseHydrology): Work<NaturalCoastFeature> {
  for (const site of yield* candidates(base)) {
    const p: NaturalCoastFeature = {
      version: V5_NATURAL_COAST_REVISION,
      baseRevision: base.version,
      seed: base.seed,
      anchor: Object.freeze({ ...site.anchor }),
      rotation: site.rotation,
      halfWidth: 8,
      fullBedHalfWidth: 3.25,
      gateway: site.passageRows + 2,
      fadeLength: 3,
      leftShoulder: 2.2 + hash(base.seed, 43, 19) * 1.4,
      rightShoulder: 2.5 + hash(base.seed, 29, 53) * 1.6,
      bedUpper: -1.3,
      region: Object.freeze({
        u: Object.freeze([-10, 10] as const),
        v: Object.freeze([-6, site.passageRows + 7] as const),
      }),
      generatedObjects: 0,
    };
    const t = coastTransform(p);
    let ok = true;
    for (let v = -6; v <= p.region.v[1] && ok; v += 0.5)
      for (let u = -10; u <= 10; u += 0.5) {
        yield 'coast-certify';
        const [x, z] = t.toWorld(u, v);
        if (
          x < 0 ||
          z < 0 ||
          x > base.size ||
          z > base.size ||
          base.fields(x, z).freshwater + Math.SQRT2 * 0.25 >= -4
        ) {
          ok = false;
          break;
        }
      }
    for (let v = p.gateway; v <= p.gateway + 3 && ok; v += 0.5)
      for (let u = -4; u <= 4; u += 0.5) {
        yield 'coast-certify';
        const [x, z] = t.toWorld(u, v);
        if (
          base.fields(x, z).ocean - Math.SQRT2 * 0.25 < 3.35 ||
          base.sample(x, z).height > -1.085 + 1e-9
        ) {
          ok = false;
          break;
        }
      }
    if (ok) return Object.freeze(p);
  }
  throw new Error('No fully certified natural coast feature');
}
