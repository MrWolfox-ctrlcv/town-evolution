const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
const { buildContinuousCoast } = require('../.domain-build/art/ContinuousCoast');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const {
  HANDBOOK_MODELS,
  HANDBOOK_TOOLS,
  handbookAsset,
} = require('../.domain-build/art/HandbookAssets');
const {
  THUMBNAIL_COLUMNS,
  THUMBNAIL_PIXELS,
  THUMBNAIL_RIGHT,
  THUMBNAIL_UP,
  thumbnailFraming,
  thumbnailRegion,
} = require('../.domain-build/art/ThumbnailFraming');
const { ACTIVE_RECIPE_DEFINITIONS } = require('../.domain-build/domain/recipes');

const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);

test('every active recipe ingredient, result and tool has actual game art', () => {
  for (const recipe of ACTIVE_RECIPE_DEFINITIONS) {
    for (const { kind } of [...recipe.ingredients, recipe.result, ...(recipe.byproducts ?? [])])
      assert.ok(
        handbookAsset(kind) ||
          (HANDBOOK_TOOLS[kind] &&
            fs.existsSync(`assets/resources/crop-icons/${HANDBOOK_TOOLS[kind]}.png`)),
        `${recipe.id}: missing canonical model or shared tool icon ${kind}`,
      );
    if (recipe.tool) {
      const icon = HANDBOOK_TOOLS[recipe.tool];
      assert.ok(icon, `Missing shared tool icon: ${recipe.tool}`);
      assert.ok(fs.existsSync(`assets/resources/crop-icons/${icon}.png`));
    }
  }
  assert.equal(handbookAsset('invented-kind'), undefined);
});

test('unified digging tool reuses the live tray category PNG', () => {
  assert.equal(HANDBOOK_TOOLS.diggingTool, 'digging-tools');
  assert.ok(fs.existsSync('assets/resources/crop-icons/digging-tools.png'));
  const tray = fs.readFileSync('assets/scripts/presentation/ToolTray.ts', 'utf8');
  const icons = fs.readFileSync('assets/scripts/presentation/TrayIcons.ts', 'utf8');
  assert.match(tray, /kind === 'diggingTool' \? 'diggingCategory' : kind/);
  assert.match(icons, /diggingCategory: 'digging-tools'/);
  assert.match(icons, /new CropArtwork\(names\[kind\] \?\? kind\)/);
});

test('house, shop, products and farms use the exact canonical town recipes', () => {
  for (const [kind, id] of Object.entries(HANDBOOK_MODELS)) {
    if (['flatLand', 'reclaimedLand', 'soilMound', 'stoneDeposit'].includes(kind)) continue;
    assert.ok(ASSETS[id], `${kind}: missing canonical asset ${id}`);
    assert.strictEqual(handbookAsset(kind), ASSETS[id]);
  }
  assert.notEqual(handbookAsset('house'), handbookAsset('shop'));
  assert.notEqual(handbookAsset('warehouse'), handbookAsset('expandedWarehouse'));
  assert.equal(handbookAsset('largeFarm').footprint[0], 4);
  assert.equal(handbookAsset('farm').footprint[0], 2);
  assert.ok(handbookAsset('waterFarm').parts.some((part) => part.name === 'shallow-water'));
  const land = compileAsset(handbookAsset('flatLand'));
  assert.ok(land.indices.length > 0, 'Flat land uses real ground/coast triangles');
  assert.ok(land.positions.every(Number.isFinite));
});

test('terrain thumbnails cache finite geometry from the live resource and coast pipelines', () => {
  for (const [kind, resource, elevation, biome] of [
    ['soilMound', 'soil', 1, 'hill'],
    ['stoneDeposit', 'stone', 3, 'mountain'],
  ]) {
    const sample = handbookAsset(kind);
    const field = new ContinuousResources(1, 73129, () => ({ biome, elevation }));
    const expected = field.sync([
      { id: sample.id, x: 0, z: 0, kind: resource, amount: elevation },
    ]).mesh;
    assert.deepEqual(sample.mesh, expected);
    assert.deepEqual(sample.footprint, [1, 1]);
    assert.notStrictEqual(sample, handbookAsset(resource), 'natural input is not a stock pile');
  }
  for (const [kind, size] of [
    ['flatLand', 2],
    ['reclaimedLand', 1],
  ]) {
    const sample = handbookAsset(kind);
    assert.deepEqual(sample.footprint, [size, size]);
    assert.deepEqual(sample.mesh, buildContinuousCoast(size, 73129, () => true).mesh);
  }
  for (const kind of ['soilMound', 'stoneDeposit', 'flatLand', 'reclaimedLand']) {
    const sample = handbookAsset(kind);
    assert.strictEqual(handbookAsset(kind), sample, `${kind}: reuse the compiled sample`);
    const mesh = compileAsset(sample);
    assert.ok(mesh.indices.length > 0);
    for (const field of ['positions', 'normals', 'colors', 'min', 'max'])
      assert.ok(mesh[field].every(Number.isFinite), `${kind}: finite ${field}`);
    for (let axis = 0; axis < 3; axis++)
      assert.ok(mesh.max[axis] > mesh.min[axis], `${kind}: positive extent ${axis}`);
    assert.ok(
      mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i < mesh.positions.length / 3),
    );
  }
});

test('orthographic framing fits every actual vertex in its own padded atlas cell', () => {
  assert.ok(Math.abs(dot(THUMBNAIL_RIGHT, THUMBNAIL_UP)) < 1e-12);
  assert.ok(Math.abs(dot(THUMBNAIL_RIGHT, THUMBNAIL_RIGHT) - 1) < 1e-12);
  assert.ok(Math.abs(dot(THUMBNAIL_UP, THUMBNAIL_UP) - 1) < 1e-12);
  const kinds = Object.keys(HANDBOOK_MODELS);
  kinds.forEach((kind, index) => {
    const mesh = compileAsset(handbookAsset(kind));
    const pose = thumbnailFraming(mesh, index, kinds.length);
    assert.ok(pose.scale > 0 && Number.isFinite(pose.scale));
    const centerX = pose.column - (THUMBNAIL_COLUMNS - 1) / 2;
    const centerY = (pose.rows - 1) / 2 - pose.row;
    let span = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p = mesh.positions.slice(i, i + 3).map((n, a) => n * pose.scale + pose.position[a]);
      const dx = Math.abs(dot(p, THUMBNAIL_RIGHT) - centerX);
      const dy = Math.abs(dot(p, THUMBNAIL_UP) - centerY);
      assert.ok(dx <= 0.420001 && dy <= 0.420001, `${kind}: clipped vertex ${i / 3}`);
      span = Math.max(span, dx, dy);
    }
    assert.ok(span >= 0.41999, `${kind}: model should fill its cell`);
  });
});

test('thumbnail atlas stays bounded for mobile and needs no generated image files', () => {
  const rows = Math.ceil(Object.keys(HANDBOOK_MODELS).length / THUMBNAIL_COLUMNS);
  const bytes = THUMBNAIL_COLUMNS * rows * THUMBNAIL_PIXELS ** 2 * 4;
  assert.ok(bytes <= 2 * 1024 * 1024, `Atlas too large: ${bytes}`);
  const art = fs.readFileSync('assets/scripts/presentation/HandbookArt.ts', 'utf8');
  assert.doesNotMatch(art, /drawRecipeMaterial|polygon\(|Graphics|\.svg/);
  const capture = fs.readFileSync('assets/scripts/presentation/ModelThumbnails.ts', 'utf8');
  assert.match(capture, /createRecipe\(source/);
  assert.match(capture, /this\.renderer\.whenReady\(\)/);
  assert.match(capture, /director\.off\(Director\.EVENT_AFTER_DRAW, this\.finishCapture, this\)/);
  assert.match(capture, /this\.texture\?\.destroy\(\)/);
  assert.match(capture, /frame\.packable = false/);
});

test('atlas row selection and UV reversal follow GL and top-origin native backends', () => {
  const count = Object.keys(HANDBOOK_MODELS).length;
  const height = Math.ceil(count / THUMBNAIL_COLUMNS) * THUMBNAIL_PIXELS;
  for (let index = 0; index < count; index++) {
    const gl = thumbnailRegion(index, count, 1);
    const native = thumbnailRegion(index, count, -1);
    assert.equal(gl.x, native.x);
    assert.equal(gl.y + native.y + THUMBNAIL_PIXELS, height);
    assert.equal(gl.flipY, true);
    assert.equal(native.flipY, false);
  }
});
