const root = require('node:path').resolve(__dirname, '../../.domain-build/domain');
const { getV5Hydrology } = require(root + '/v5-hydrology');
const { validateV5Extensions, isV5DockShore } = require(root + '/v5-marine');
function find(seed) {
  const h = getV5Hydrology(seed);
  for (let z = 2; z < 180; z++)
    for (let x = 2; x < 188; x++) {
      if (
        ![0, 1].every((dz) => [0, 1].every((dx) => h.at(x + dx, z + dz)?.state === 'dryBuildable'))
      )
        continue;
      const fill = [];
      let valid = true;
      for (let d = 1; d <= 12; d++) {
        for (let dx = 0; dx < 2; dx++) {
          const p = { x: x + dx, z: z + d + 1 };
          if (h.at(p.x, p.z)?.state !== 'dryBuildable') {
            const f = h.fields(p.x + 0.5, p.z + 0.5);
            if (f.freshwater + Math.SQRT1_2 > -4 || f.ocean + Math.SQRT1_2 < 0) {
              valid = false;
              break;
            }
            fill.push(p);
          }
        }
        if (!valid) break;
        if (
          d < 2 ||
          !fill.length ||
          ![0, 1].every((dz) => [0, 1].every((dx) => h.at(x + dx, z + d + 2 + dz)?.seaDockWater))
        )
          continue;
        try {
          validateV5Extensions(seed, fill);
          if (!isV5DockShore(seed, { x, z: z + d, rotation: 0 }, fill)) continue;
          return { seed, x, z: z + d, rotation: 0, fill };
        } catch (e) {}
      }
    }
  throw Error('no dock ' + seed);
}
module.exports = { find };
