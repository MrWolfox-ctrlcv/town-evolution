/** Deterministic work units, never milliseconds or a promise of one frame. */
export type WorkStage =
  | 'hydrology'
  | 'coast-candidates'
  | 'coast-sort'
  | 'coast-certify'
  | 'starter-candidates'
  | 'starter-sort'
  | 'starter-trees'
  | 'reserve-bounds'
  | 'allocate-lattice'
  | 'clear-lattice'
  | 'cell-vertices'
  | 'cell-strata'
  | 'cell-finalize'
  | 'initial-resources'
  | 'initial-trees'
  | 'complete';
export type Work<T> = Generator<WorkStage, T, void>;
/** Stable bottom-up merge sort with at most one copied item per yielded unit. */
export function* sortWork<T>(
  values: T[],
  compare: (a: T, b: T) => number,
  stage: WorkStage,
): Work<T[]> {
  let source = values,
    target = new Array<T>(values.length);
  for (let width = 1; width < values.length; width *= 2) {
    for (let start = 0; start < values.length; start += width * 2) {
      const middle = Math.min(start + width, values.length);
      const end = Math.min(start + width * 2, values.length);
      let left = start,
        right = middle;
      for (let index = start; index < end; index++) {
        target[index] =
          left < middle && (right >= end || compare(source[left]!, source[right]!) <= 0)
            ? source[left++]!
            : source[right++]!;
        yield stage;
      }
    }
    [source, target] = [target, source];
  }
  return source;
}
