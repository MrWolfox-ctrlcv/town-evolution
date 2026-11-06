# Frozen pre-terrain6 v5 world cells

`terrain6-legacy-v5-worlds.json.gz` contains the five complete v5 world-cell lists
for seeds 1, 7, 42, 42173 and 1000000000. They were extracted from the original
pre-terrain6 full oracle, not regenerated from current production code. Each
list is authenticated against its existing `v5Hashes.world` value in
`terrain6-legacy-oracle.json`. Neither that manifest nor its original compressed
save fixture was changed.

- Full pre-terrain6 oracle SHA-256:
  `494f33168a47dfe03bc280c99da283ac9c1aced87d19df31ac5ae31cdcdee8de`
- Expanded cell-list archive SHA-256:
  `3bda41881cf43a30fe40d6ded66d9139d485350424ba2de48c0b2da4ec99a4fd`
- Original capture runtime: Node 24.22.1, V8 13.6.233.17-node.58, Linux x64.

An independent comparison executed the frozen old compiled code and the new
compiled code under both Node 22.23.4 and Node 24.22.1. For each runtime, all
25 version/seed combinations preserved exact initial saves, real depleted
saves, land, terrain, v5 hydrology, fields, stock and tree candidates. Across
runtimes, only v5 `world[].surfaceHeight` differed: 458, 434, 458, 418 and 425
values respectively. The maximum difference was 3 ULP and `2 ** -46` absolute.
Every other field and every complete save remained exact.

The test retains the original world SHA assertion on the original Node/V8
runtime. Its structural comparison uses the independently tested v5 comparator
on other runtimes: only `cells[index].surfaceHeight` can differ, within both
measured bounds. Zeros, signs, finite values, keys, ordering, IDs, coordinates,
biomes, elevations and amounts remain strict. All other old-world digest
assertions remain unchanged. Future differences beyond this boundary require
investigation, not automatic widening or fixture regeneration.
