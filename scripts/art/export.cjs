/** Reproducible glTF export of the same mesh compiler used by Cocos at runtime. */
const fs = require('node:fs');
const path = require('node:path');
const { ASSETS } = require('../../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../../.domain-build/art/MeshCompiler');
const { ASSET_CATEGORIES } = require('../../.domain-build/art/AssetCategories');
const output = path.resolve('art/exports');
const check = process.argv.includes('--check');
const manifest = [];
function save(name, text) {
  const file = path.join(output, name);
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text)
      throw new Error(`Stale generated asset: ${name}`);
  } else {
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(file, text);
  }
}
for (const recipe of Object.values(ASSETS)) {
  const m = compileAsset(recipe),
    chunks = [],
    bufferViews = [],
    accessors = [];
  let offset = 0;
  function attribute(values, components, type, componentType, min, max) {
    const typed = componentType === 5125 ? new Uint32Array(values) : new Float32Array(values);
    const bytes = Buffer.from(typed.buffer);
    chunks.push(bytes);
    const view = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: bytes.length,
      target: componentType === 5125 ? 34963 : 34962,
    });
    offset += bytes.length;
    const result = accessors.length;
    accessors.push({
      bufferView: view,
      componentType,
      count: values.length / components,
      type,
      ...(min ? { min, max } : {}),
    });
    return result;
  }
  const attributes = {
    POSITION: attribute(m.positions, 3, 'VEC3', 5126, m.min, m.max),
    NORMAL: attribute(m.normals, 3, 'VEC3', 5126),
    COLOR_0: attribute(
      m.colors.map((c, i) =>
        i % 4 === 3 ? c : c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
      ),
      4,
      'VEC4',
      5126,
    ),
  };
  const indices = attribute(m.indices, 1, 'SCALAR', 5125);
  const textured = m.texturedIndices?.length > 0;
  const primitives = [{ attributes, indices, material: 0 }];
  if (textured) {
    attributes.TEXCOORD_0 = attribute(m.uvs, 2, 'VEC2', 5126);
    const woodVertices = new Set(m.texturedIndices);
    const plain = m.indices.filter((i) => !woodVertices.has(i));
    if (plain.length) primitives[0].indices = attribute(plain, 1, 'SCALAR', 5125);
    else primitives.length = 0;
    primitives.push({
      attributes,
      indices: attribute(m.texturedIndices, 1, 'SCALAR', 5125),
      material: 1,
    });
  }
  const gltf = {
    asset: { version: '2.0', generator: 'Town Evolution canonical recipe compiler' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: recipe.id,
        mesh: 0,
        extras: {
          category: recipe.category,
          footprint: recipe.footprint,
          sockets: recipe.sockets || {},
        },
      },
    ],
    meshes: [{ name: recipe.id, primitives }],
    materials: [
      {
        name: 'MattePaletteAlbedo',
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
      },
    ],
    ...(textured
      ? {
          images: [{ uri: 'textures/warm-wood.png', name: 'Image-generated shared wood albedo' }],
          textures: [{ source: 0, sampler: 0 }],
          samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
        }
      : {}),
    buffers: [
      {
        byteLength: offset,
        uri: 'data:application/octet-stream;base64,' + Buffer.concat(chunks).toString('base64'),
      },
    ],
    bufferViews,
    accessors,
  };
  if (textured)
    gltf.materials.push({
      name: 'ImageGeneratedWarmWood',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    });
  const text = JSON.stringify(gltf) + '\n';
  save(recipe.id + '.gltf', text);
  manifest.push({
    id: recipe.id,
    category: recipe.category,
    file: recipe.id + '.gltf',
    parts: recipe.parts.length,
    triangles: m.indices.length / 3,
    vertices: m.positions.length / 3,
    drawCalls: primitives.length,
    bounds: { min: m.min, max: m.max },
    footprint: recipe.footprint,
    bytes: Buffer.byteLength(text),
  });
}
const woodSource = fs.readFileSync('assets/resources/buildings/warm-wood.png');
const woodTarget = path.join(output, 'textures/warm-wood.png');
if (check) {
  if (!fs.existsSync(woodTarget) || !woodSource.equals(fs.readFileSync(woodTarget)))
    throw new Error('Stale shared wood texture');
} else {
  fs.mkdirSync(path.dirname(woodTarget), { recursive: true });
  fs.writeFileSync(woodTarget, woodSource);
}
save(
  'manifest.json',
  JSON.stringify(
    {
      schemaVersion: 2,
      units: '1 unit = 1 game grid cell; Y up; front +Z',
      categories: ASSET_CATEGORIES,
      assets: manifest,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `${check ? 'Verified' : 'Exported'} ${manifest.length} canonical glTF assets; max ${Math.max(...manifest.map((m) => m.triangles))} triangles, one palette batch plus one shared wood batch where needed.`,
);
