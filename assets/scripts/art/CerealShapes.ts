import type { V3 } from './AssetTypes';
/** Small shared silhouettes allow dense wheat without thousands of round bead meshes. */
const lens: V3[] = [
  [0, -0.5, 0],
  [0.5, 0, 0],
  [0, 0, 0.5],
  [-0.5, 0, 0],
  [0, 0, -0.5],
  [0, 0.5, 0],
];
const lensFaces = [
  [0, 1, 2],
  [0, 2, 3],
  [0, 3, 4],
  [0, 4, 1],
  [5, 2, 1],
  [5, 3, 2],
  [5, 4, 3],
  [5, 1, 4],
];
const blade: V3[] = [
  [-0.025, -0.5, 0],
  [0.025, -0.5, 0],
  [-0.5, 0, 0.07],
  [0.5, 0, 0.07],
  [0, 0.5, 0.32],
];
const bladeFaces = [
  [0, 1, 3],
  [0, 3, 2],
  [2, 3, 4],
];
const stick: V3[] = [];
for (const y of [-0.5, 0.5])
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    stick.push([Math.cos(a) * 0.5, y, Math.sin(a) * 0.5]);
  }
export const CEREAL_SHAPES = {
  kernel: { vertices: lens, faces: lensFaces, smooth: true },
  cerealLeaf: {
    vertices: [...blade, ...blade],
    faces: [
      ...bladeFaces,
      ...bladeFaces.map((f) =>
        f
          .slice()
          .reverse()
          .map((i) => i + 5),
      ),
    ],
    smooth: true,
  },
  straw: {
    vertices: stick,
    faces: [
      [0, 1, 2],
      [5, 4, 3],
      [0, 3, 4, 1],
      [1, 4, 5, 2],
      [2, 5, 3, 0],
    ],
    smooth: true,
  },
};
