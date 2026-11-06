# Frozen v5 phase 1 payloads

`v5-phase1-reference-payloads.json.gz` expands the existing six SHA-256 references
in `v5-phase1-reference.json`. Each entry contains `seed` and the original
`{cells, trees, resources}` payload. The test authenticates each expanded payload
against its original, unchanged SHA before comparing production output. This is
not a regenerated expectation for a new terrain algorithm.

## Runtime investigation (2026-11-06)

The frozen source at commit `b11b1906e0a79444d1c1a1099bdd80f937103bad` passes the
original byte-level reference under Node 24.22.1 / V8 13.6.233.17-node.58. CI's
Node 22.23.4 / V8 12.4.254.21-node.57 produces different low bits in
`cells[].surfaceHeight`. Running both runtimes on the same Linux host, with the
same compiled source, reproduces the exact seed 1 SHA reported by CI:
`5515e8df6db2bf76b13ff3f2762b8f3db782236153d6cac4a92f553b9d13fe6d`.

| Seed       | Different heights | Maximum absolute difference | Maximum ULP |
| ---------- | ----------------- | --------------------------- | ----------- |
| 1          | 458               | 1.0658141036401503e-14      | 3           |
| 17         | 436               | 1.4210854715202004e-14      | 2           |
| 1937       | 435               | 7.105427357601002e-15       | 2           |
| 42173      | 418               | 1.4210854715202004e-14      | 3           |
| 999999937  | 451               | 1.4210854715202004e-14      | 3           |
| 1000000000 | 425               | 7.105427357601002e-15       | 2           |

Every other field is exactly equal, including cell structure, biome, coordinates,
elevation, all tree candidates and their order, and resource IDs and amounts.
The first difference is seed 1, cell 7166: Node 24 gives `2.435895415958961` and
Node 22 gives `2.4358954159589605`.

An isolated diagnostic copy identifies the mountain formula's fractional power
`Math.max(0, 1 - d / 2.1) ** 1.25` as the cause. Expressing it as `Math.pow` preserves
each runtime's original full SHA. For seed 1, all recorded `sin`, `cos`, `atan2`,
and `hypot` calls have identical inputs and results; 911 `pow` results differ in
their low bits. Replaying only Node 24's recorded `pow` results under Node 22
restores the original full seed 1 SHA. No production math is changed by the fix.

## Assertion contract

The comparator requires exact structure, field names/order, arrays, discrete
values, resources, and trees. Only `cells[index].surfaceHeight` may differ, and
only by **both** at most 3 ULP and at most `2 ** -46` absolute error. Zero, sign,
and finite-value checks remain strict. This narrowly records the measured runtime
difference, not a general geometric tolerance. Any future runtime outside those
bounds must be investigated, not accepted by widening them automatically.

Mutation tests prove rejection of discrete and structural drift, changed tree
ordering, resource amounts differing by even one ULP, non-finite heights, changed
zeros/signs, four-ULP height drift, and violations of the absolute cap. The original
reference JSON and all production source files are unchanged.

To reproduce the acceptance check, build the domain and run
`node --test tests/v5-natural-reference.test.cjs tests/v5-reference-assert.test.cjs`
under Node 22.23.4 and Node 24.22.1. The compressed reference is a checked-in oracle;
tests never regenerate it from the implementation under test.
