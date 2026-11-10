/** Isolated presentation wiring and asset checks, not real Cocos/browser rendering. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');

function fixture(bundle = false) {
  const requests = new Map(),
    loaded = new Map();
  class UITransform {
    convertToNodeSpaceAR(point) {
      return point;
    }
    setContentSize(width, height) {
      this.contentSize = { width, height };
    }
  }
  class Graphics {
    enabled = true;
  }
  for (const method of [
    'clear',
    'moveTo',
    'lineTo',
    'stroke',
    'fill',
    'close',
    'rect',
    'roundRect',
    'circle',
    'ellipse',
    'bezierCurveTo',
  ])
    Graphics.prototype[method] = () => {};
  class Node {
    static EventType = {
      TOUCH_START: 'start',
      TOUCH_MOVE: 'move',
      TOUCH_END: 'end',
      TOUCH_CANCEL: 'cancel',
    };
    children = [];
    components = new Map();
    events = new Map();
    active = true;
    valid = true;
    constructor(name = '') {
      this.name = name;
    }
    addComponent(Kind) {
      const c = new Kind();
      this.components.set(Kind, c);
      return c;
    }
    getComponent(Kind) {
      return this.components.get(Kind) ?? null;
    }
    getChildByName(name) {
      return this.children.find((n) => n.name === name) ?? null;
    }
    addChild(node) {
      this.children.push(node);
    }
    setPosition(...position) {
      this.position = position;
    }
    setScale(...scale) {
      this.scale = scale;
    }
    setSiblingIndex() {}
    on(event, callback) {
      this.events.set(event, callback);
    }
    off() {}
    destroy() {
      this.valid = false;
    }
  }
  function uiNode(name, parent) {
    const node = new Node(name);
    node.addComponent(UITransform);
    parent?.addChild(node);
    return node;
  }
  class Rect {
    constructor(x, y, width, height) {
      Object.assign(this, { x, y, width, height });
    }
  }
  class ImageAsset {
    width = 1536;
    height = 1024;
    refs = 0;
    addRef() {
      this.refs++;
    }
    decRef() {
      this.refs--;
    }
  }
  class Texture2D {
    destroyed = 0;
    destroy() {
      this.destroyed++;
    }
  }
  class SpriteFrame {
    destroyed = 0;
    set texture(texture) {
      this.source = texture;
      this.rect = new Rect(0, 0, texture.image.width, texture.image.height);
    }
    destroy() {
      this.destroyed++;
    }
  }
  class Sprite {
    static SizeMode = { CUSTOM: 'custom' };
    enabled = true;
  }
  class Color {
    constructor(r, g, b, a) {
      Object.assign(this, { r, g, b, a });
    }
  }
  const request = (resource, callback) => requests.set(resource, callback);
  const cc = {
    Node,
    UITransform,
    Graphics,
    Rect,
    ImageAsset,
    Texture2D,
    SpriteFrame,
    Sprite,
    Color,
    isValid: (node) => node.valid,
    assetManager: {
      getBundle: () => (bundle ? { load: (resource, _Kind, cb) => request(resource, cb) } : null),
      loadRemote: (resource, _options, cb) => request(resource, cb),
    },
    view: {
      getViewportRect: () => ({ x: 0, y: 0, width: 390, height: 844 }),
      getScaleX: () => 1,
      getScaleY: () => 1,
    },
    tween: () => {
      const chain = { to: () => chain, call: () => chain, start() {} };
      return chain;
    },
  };
  const dependencies = {
    cc,
    './Widgets': { uiNode },
    './Palette': { color: () => ({}) },
    './TrayColumn': {},
    './SoilIcon': {
      drawSoilIcon: (g) => {
        g.fallback = 'soil';
      },
    },
    './MudIcon': {
      drawMudIcon: (g) => {
        g.fallback = 'mud';
      },
    },
    './TreeSeedIcon': {
      drawTreeSeedIcon: (g) => {
        g.fallback = 'treeSeed';
      },
    },
  };
  function load(name) {
    if (loaded.has(name)) return loaded.get(name);
    const source = fs.readFileSync(path.join('assets/scripts/presentation', name + '.ts'), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', outputText)(
      (id) => {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith('../application/') || id === '../domain/game')
          return require('../.domain-build/' + id.slice(3));
        return load(id.slice(2));
      },
      module,
      module.exports,
    );
    loaded.set(name, module.exports);
    return module.exports;
  }
  function finish(icon, error = null) {
    const resource = `crop-icons/${icon}${bundle ? '' : '.png'}`;
    assert.ok(requests.has(resource), `Image is requested: ${resource}`);
    const image = new ImageAsset();
    const png = fs.readFileSync(`assets/resources/crop-icons/${icon}.png`);
    image.width = png.readUInt32BE(16);
    image.height = png.readUInt32BE(20);
    requests.get(resource)(error, image);
    return image;
  }
  return { ...cc, load, uiNode, requests, finish };
}

test('processing output quantities and transport sales keep their action icons', () => {
  const { actionIcon } = fixture().load('ActionArtwork');
  for (const amount of [1, 2, 10]) assert.equal(actionIcon(`领取面包 ×${amount}`), 'collect');
  assert.equal(actionIcon('放入树种 ×1'), 'tree-seed');
  assert.equal(actionIcon('出售 2份'), 'sell');
  assert.equal(actionIcon('×'), 'close');
  assert.equal(actionIcon('取消'), 'close');
});

for (const bundle of [false, true])
  test(`generated product art loads through ${bundle ? 'Creator resources' : 'standalone preview'} and fits 30–54px`, () => {
    const f = fixture(bundle),
      { TrayIcons } = f.load('TrayIcons'),
      icons = new TrayIcons();
    for (const [kind, path, expected] of [
      ['soil', 'soil', [310, 208, 897, 621]],
      ['mud', 'mud', [440, 261, 644, 509]],
      ['treeSeed', 'tree-seed', [341, 78, 844, 834]],
      ['diggingCategory', 'digging-tools', [242, 42, 1045, 968]],
      ['rice', 'rice', [61, 15, 1154, 1149]],
      ['sapling', 'sapling', [256, 115, 726, 1056]],
      ['milledRice', 'milled-rice', [123, 91, 1004, 1106]],
      ['flour', 'flour', [211, 116, 854, 974]],
      ['bread', 'bread', [352, 174, 834, 686]],
    ]) {
      const nodes = [30, 40, 48, 54].map((size) => {
        const node = f.uiNode(kind);
        icons.draw(node, kind, size);
        return { node, size };
      });
      assert.ok(nodes.every(({ node }) => node.getComponent(f.Graphics).enabled));
      const image = f.finish(path);
      for (const { node, size } of nodes) {
        const child = node.getChildByName('CropImage'),
          sprite = child.getComponent(f.Sprite),
          rect = sprite.spriteFrame.rect;
        assert.deepEqual([rect.x, rect.y, rect.width, rect.height], expected);
        assert.equal(sprite.spriteFrame.source.image, image);
        const dims = child.getComponent(f.UITransform).contentSize;
        assert.ok(Math.abs(Math.max(dims.width, dims.height) - size) < 1e-10);
        assert.ok(Math.abs(dims.width / dims.height - expected[2] / expected[3]) < 1e-10);
        assert.equal(node.getComponent(f.Graphics).enabled, false);
      }
      assert.equal(image.refs, 1, 'One texture per icon across multiple draws');
    }
    icons.dispose();
  });

test('reused drag/flight nodes reject stale image completions and disposal is balanced', () => {
  const f = fixture(),
    { TrayIcons } = f.load('TrayIcons'),
    icons = new TrayIcons(),
    node = f.uiNode('reused');
  icons.draw(node, 'soil', 48);
  icons.draw(node, 'mud', 48);
  icons.draw(node, 'treeSeed', 30);
  const soil = f.finish('soil');
  const mud = f.finish('mud');
  assert.equal(
    node.getChildByName('CropImage'),
    null,
    'Old request cannot overwrite the newly selected kind',
  );
  const seed = f.finish('tree-seed');
  assert.equal(
    node.getChildByName('CropImage').getComponent(f.Sprite).spriteFrame.source.image,
    seed,
  );
  icons.draw(node, 'soil', 40);
  assert.equal(node.getChildByName('CropImage').active, true);
  assert.equal(
    node.getChildByName('CropImage').getComponent(f.Sprite).spriteFrame.source.image,
    soil,
  );
  assert.equal(node.getComponent(f.Graphics).enabled, false);
  assert.equal(node.getComponent(f.Graphics).fallback, 'soil');
  icons.draw(f.uiNode('pending'), 'wood', 40);
  icons.dispose();
  icons.dispose();
  assert.equal(mud.refs, 0);
  assert.equal(seed.refs, 0);
  assert.equal(soil.refs, 0);
  assert.equal(f.finish('wood').refs, 0, 'Late requests after disposal do not retain images');
});

test('failed artwork keeps the existing readable fallback without affecting another product', () => {
  const f = fixture(),
    { TrayIcons } = f.load('TrayIcons'),
    icons = new TrayIcons(),
    node = f.uiNode('failed');
  for (const kind of ['soil', 'mud']) {
    icons.draw(node, kind, 40);
    f.finish(kind, new Error('offline'));
    assert.equal(node.getComponent(f.Graphics).enabled, true);
    assert.equal(node.getComponent(f.Graphics).fallback, kind);
    assert.equal(node.getChildByName('CropImage'), null);
  }
  icons.draw(node, 'treeSeed', 40);
  f.finish('tree-seed');
  assert.equal(node.getComponent(f.Graphics).enabled, false);
  icons.dispose();
});

test('real tray tiles, dragging ghost and collection flight bind the generated product sprite', () => {
  const f = fixture(),
    { TrayIcons } = f.load('TrayIcons'),
    { ToolTray } = f.load('ToolTray'),
    icons = new TrayIcons();
  const surface = Object.create(ToolTray.prototype);
  Object.assign(surface, {
    icons,
    ghost: f.uiNode('ToolGhost'),
    origin: { x: 0, y: 0 },
    width: 390,
    height: 844,
    acceptsProductDrop: () => false,
  });
  const tiles = [],
    prepared = [],
    images = new Map();
  for (const [kind, path] of [
    ['soil', 'soil'],
    ['mud', 'mud'],
    ['treeSeed', 'tree-seed'],
  ]) {
    const column = {
      add: () => {
        const node = f.uiNode(kind);
        tiles.push(node);
        const entry = { node };
        prepared.push(entry);
        return entry;
      },
    };
    surface.tile(column, kind, `${kind}Stock`);
    prepared.at(-1).prepare();
    surface.held = kind;
    surface.ghostAppearance = null;
    surface.moveGhost({
      getLocation: () => ({ x: 100, y: 100 }),
      getUILocation: () => ({ x: 100, y: 100 }),
    });
    const image = f.finish(path);
    images.set(kind, image);
    assert.equal(
      surface.ghost.getChildByName('CropImage').getComponent(f.Sprite).spriteFrame.source.image,
      image,
    );
    assert.equal(tiles.at(-1).children[0].getChildByName('CropImage').active, true);
  }
  const { CollectionFlights } = f.load('CollectionFlights'),
    canvas = f.uiNode('Canvas');
  canvas.getComponent(f.UITransform).setContentSize(390, 844);
  const flights = new CollectionFlights(canvas, () => ({
    activeInHierarchy: true,
    worldPosition: { x: 160, y: 160, z: 0 },
  }));
  for (const [kind, path] of [
    ['soil', 'soil'],
    ['mud', 'mud'],
    ['treeSeed', 'tree-seed'],
  ]) {
    flights.collect(kind, 2, { x: 200, y: 200 });
    const image = images.get(kind);
    const flight = flights.pool.at(-1).node;
    assert.equal(flight.getChildByName('CropImage').active, true);
    assert.equal(
      flight.getChildByName('CropImage').getComponent(f.Sprite).spriteFrame.source.image,
      image,
    );
    assert.equal(
      Math.max(
        ...Object.values(
          flight.getChildByName('CropImage').getComponent(f.UITransform).contentSize,
        ),
      ),
      30,
    );
  }
  icons.dispose();
  flights.dispose();
});

test('action buttons use the same generated crop with disabled tint and retain distinct dry soil', () => {
  const f = fixture(),
    { ActionArtwork } = f.load('ActionArtwork'),
    artwork = new ActionArtwork(),
    node = f.uiNode('action');
  const images = [];
  for (const [kind, region] of [
    ['soil', [310, 208, 897, 621]],
    ['mud', [440, 261, 644, 509]],
    ['tree-seed', [341, 78, 844, 834]],
  ]) {
    artwork.bind(node, kind, 40, false);
    assert.equal(node.getComponent(f.Sprite).enabled, false, 'Fallback before the image loads');
    images.push(f.finish(kind));
    const sprite = node.getComponent(f.Sprite);
    assert.equal(sprite.enabled, true);
    assert.equal(sprite.color.a, 175);
    assert.equal(node.getComponent(f.Graphics).enabled, false);
    assert.deepEqual(sprite.spriteFrame.rect, new f.Rect(...region));
    const dims = node.getComponent(f.UITransform).contentSize;
    assert.equal(Math.max(dims.width, dims.height), 40);
    assert.ok(Math.abs(dims.width / dims.height - region[2] / region[3]) < 1e-10);
  }
  artwork.bind(node, 'soil', 40, true);
  assert.equal(node.getComponent(f.Sprite).enabled, true);
  assert.equal(node.getComponent(f.Sprite).color.a, 255);
  assert.equal(node.getComponent(f.Sprite).spriteFrame.source.image, images[0]);
  artwork.dispose();
  artwork.dispose();
  assert.ok(images.every((image) => image.refs === 0));
});

test('unchanged ImageGen PNGs and stable image metadata ship through the preview asset copy', () => {
  for (const [icon, hash] of [
    ['soil', '13ccf4deda7b4c812c1ca0b77109aea21af094536e3f965f45787419358053e2'],
    ['mud', '964f830bc3355f76eceb921f7605367b97ee2c619327929fb8f217bcf73f314a'],
    ['tree-seed', '1be35def02f463bac5aae6cc95c83ee5752898a6b9e8eebb9fd9a57869d94f98'],
    ['digging-tools', 'c16c6ec872f8c7801daa5cdee63155c3f9d6d5a83bee8580ffb381cacedf72e7'],
  ]) {
    const filename = `assets/resources/crop-icons/${icon}.png`,
      image = fs.readFileSync(filename),
      meta = JSON.parse(fs.readFileSync(filename + '.meta'));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(image[25], 6, 'RGBA includes a real alpha channel');
    assert.equal(image.readUInt32BE(16), 1536);
    assert.equal(image.readUInt32BE(20), 1024);
    assert.equal(
      createHash('sha256').update(image).digest('hex'),
      hash,
      'Source bytes are retained',
    );
    assert.equal(meta.importer, 'image');
    assert.equal(meta.userData.hasAlpha, true);
    assert.equal(meta.subMetas['6c48a'].userData.premultiplyAlpha, false);
    assert.equal(meta.subMetas['6c48a'].userData.imageUuidOrDatabaseUri, meta.uuid);
  }
  const build = fs.readFileSync('scripts/preview/build.cjs', 'utf8');
  assert.match(build, /readdirSync\(icons\)\.filter\(\(file\) => file\.endsWith\('\.png'\)\)/);
});

test('soil action failure retains its fallback and late completion cannot replace another kind', () => {
  const f = fixture(),
    { ActionArtwork } = f.load('ActionArtwork'),
    artwork = new ActionArtwork(),
    failed = f.uiNode('failed'),
    reused = f.uiNode('reused');
  artwork.bind(failed, 'soil', 28, false);
  assert.equal(f.finish('soil', new Error('offline')).refs, 0);
  assert.equal(failed.getComponent(f.Graphics).enabled, true);
  assert.equal(failed.getComponent(f.Graphics).fallback, 'soil');
  assert.equal(failed.getComponent(f.Sprite).enabled, false);
  artwork.dispose();

  const pending = new ActionArtwork();
  pending.bind(reused, 'soil', 28, true);
  pending.bind(reused, 'mud', 28, true);
  const soil = f.finish('soil');
  assert.equal(reused.getComponent(f.Graphics).fallback, 'mud');
  assert.equal(reused.getComponent(f.Sprite).enabled, false);
  const mud = f.finish('mud');
  assert.equal(reused.getComponent(f.Sprite).spriteFrame.source.image, mud);
  pending.dispose();
  assert.equal(soil.refs, 0);
  assert.equal(mud.refs, 0);

  const late = new ActionArtwork();
  late.bind(reused, 'soil', 28, true);
  late.dispose();
  assert.equal(f.finish('soil').refs, 0, 'Disposed actions never retain late soil images');
});

test('static digging category shows shovel plus pickaxe while real pointer gestures keep contextual single tools', () => {
  const f = fixture(),
    { TrayIcons } = f.load('TrayIcons'),
    { ToolTray } = f.load('ToolTray'),
    icons = new TrayIcons();
  const surface = Object.create(ToolTray.prototype),
    tile = f.uiNode('diggingToolTool'),
    began = [];
  Object.assign(surface, {
    icons,
    ghost: f.uiNode('ToolGhost'),
    origin: { x: 0, y: 0 },
    width: 390,
    height: 844,
    active: null,
    acceptsProductDrop: () => false,
    highlightProductDrop() {},
    handlers: {
      begin: (kind) => began.push(kind),
      move() {},
      end() {},
      appearance: (_kind, point) => (point.material === 'stone' ? 'diggingPickaxe' : 'diggingTool'),
    },
  });
  const entry = { node: tile };
  surface.tile({ add: () => entry }, 'diggingTool', 'diggingToolTool');
  entry.prepare();
  const category = f.finish('digging-tools');
  const tileSprite = tile.children[0].getChildByName('CropImage').getComponent(f.Sprite);
  assert.equal(tileSprite.spriteFrame.source.image, category);
  assert.deepEqual(tileSprite.spriteFrame.rect, new f.Rect(242, 42, 1045, 968));
  const event = (material) => ({
    getID: () => 7,
    getAllTouches: () => [{}],
    getLocation: () => ({ x: 100, y: 100, material }),
    getUILocation: () => ({ x: 100, y: 100 }),
  });
  tile.events.get(f.Node.EventType.TOUCH_START)(event('soil'));
  const shovel = f.finish('digging-tool');
  assert.deepEqual(began, ['diggingTool'], 'Only the existing digging command is started');
  const ghostSprite = surface.ghost.getChildByName('CropImage').getComponent(f.Sprite);
  assert.equal(ghostSprite.spriteFrame.source.image, shovel);
  tile.events.get(f.Node.EventType.TOUCH_MOVE)(event('stone'));
  const pickaxe = f.finish('digging-pickaxe');
  assert.equal(ghostSprite.spriteFrame.source.image, pickaxe);
  tile.events.get(f.Node.EventType.TOUCH_MOVE)(event('soil'));
  assert.equal(ghostSprite.spriteFrame.source.image, shovel);
  assert.equal(
    tileSprite.spriteFrame.source.image,
    category,
    'Target changes never replace the static category',
  );
  tile.events.get(f.Node.EventType.TOUCH_END)(event('soil'));
  assert.equal(surface.ghost.active, false);
  assert.equal(surface.active, null);
  icons.dispose();
});
