/** New worlds only. Never reinterpret a published generator revision. */
export const V7_GENERATOR_REVISION = 'v7-seeded-coast-1';
export const V7_HYDROLOGY_REVISION = 'v7-normalized-coast-fields-1';
/** Covers double field arithmetic and Float32 mesh-height boundary comparisons. */
export const V7_FIELD_EPSILON = 1e-5;
export const V7_CELL_RADIUS = Math.SQRT1_2 + V7_FIELD_EPSILON;
/** Upward rounded bound for the frozen P/sqrt(2) implementation. */
export const V7_PERLIN_LIPSCHITZ = 6.3033008589;
export const V7_COAST_NOISE = Object.freeze({
  mainland: Object.freeze({
    amplitudes: [1, 0.35] as const,
    wavelengths: [64, 32] as const,
    scale: 1.16743143,
  }),
  bay: Object.freeze({
    amplitudes: [3, 1] as const,
    wavelengths: [40, 20] as const,
    scale: 1.787912608,
  }),
});

export type V7Revision = typeof V7_GENERATOR_REVISION;
