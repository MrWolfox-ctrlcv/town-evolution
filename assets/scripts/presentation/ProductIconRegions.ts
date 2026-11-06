/** Display-only crops retain the original ImageGen PNGs and transparent edge padding. */
export const PRODUCT_ICON_REGIONS: Readonly<
  Record<string, readonly [number, number, number, number]>
> = {
  // Include 16px around the dry mound; only near-transparent (alpha 1) source noise lies outside.
  soil: [310, 208, 897, 621],
  rice: [61, 15, 1154, 1149],
  sapling: [256, 115, 726, 1056],
  'milled-rice': [123, 91, 1004, 1106],
  flour: [211, 116, 854, 974],
  'roasted-carrot': [325, 53, 1005, 918],
  bread: [352, 174, 834, 686],

  mud: [440, 261, 644, 509],
  'tree-seed': [341, 78, 844, 834],
  'digging-tools': [242, 42, 1045, 968],
};
