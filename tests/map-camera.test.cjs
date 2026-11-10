const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const {
  cameraDepth,
  clampMapZoom,
  fittedOrthoHeight,
  homeZoom,
  steppedMapZoom,
} = require('../.domain-build/application/CameraFraming');
const { worldSize } = require('../.domain-build/domain/world');
const { terrainAt } = require('../.domain-build/domain/terrain');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
function basis(eye, focus) {
  const vector = add(eye, focus, -1);
  const distance = Math.hypot(vector.x, vector.y, vector.z);
  const forward = { x: vector.x / distance, y: vector.y / distance, z: vector.z / distance };
  const planar = Math.hypot(forward.x, forward.z);
  if (planar < 1e-10)
    return { forward, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 }, distance };
  const right = { x: forward.z / planar, y: 0, z: -forward.x / planar };
  const up = {
    x: (-forward.x * forward.y) / planar,
    y: planar,
    z: (-forward.z * forward.y) / planar,
  };
  return { forward, right, up, distance };
}

test('versioned bounds preserve old homes and allow smooth large-world home zoom', () => {
  for (const version of [1, 2, 3, 4]) {
    const size = worldSize(version),
      home = homeZoom(size);
    assert.equal(size, version === 4 ? 192 : 40);
    near(clampMapZoom(home, size), home);
    for (const ratio of [0.999, 1, 1.001]) near(clampMapZoom(home * ratio, size), home * ratio);
    for (const aspect of [0.3, 0.5, 1, 2, 3]) {
      near(fittedOrthoHeight(aspect, size) * home, fittedOrthoHeight(aspect));
      near(
        fittedOrthoHeight(aspect, size) * clampMapZoom(0, size),
        fittedOrthoHeight(aspect, 40) * 0.15,
      );
    }
    if (version !== 4) {
      const depth = cameraDepth(size, 300);
      near(depth.x / depth.y, 15 / 20);
      near(depth.z / depth.y, 18 / 20);
      assert.equal(depth.near, 0.1);
      assert.ok(depth.far > 100, 'old overviews need enough depth after retreating');
      near(steppedMapZoom(home, 1, size), 0.42);
    } else {
      near(steppedMapZoom(steppedMapZoom(home, 1, size), -1, size), home);
      assert.ok(steppedMapZoom(home, 1, size) < home * 1.3);
    }
  }
});

test('all-world visible terrain stays between clip planes at pan limits, every zoom and title yaw', () => {
  for (const size of [40, 192]) {
    for (const aspect of [0.3, 0.5, 1, 2, 3])
      for (const zoom of [clampMapZoom(0, size), homeZoom(size), 0.25, 1, 1.8]) {
        const height = fittedOrthoHeight(aspect, size) * zoom;
        const depth = cameraDepth(size, height);
        for (const focusX of [-4, 6, size / 2, size + 4])
          for (const focusZ of [-4, 6, size / 2, size + 4])
            for (const yaw of [-0.035, 0, 0.035]) {
              const focus = { x: focusX, y: 0, z: focusZ };
              const eye = {
                x: focusX + depth.x * Math.cos(yaw) + depth.z * Math.sin(yaw),
                y: depth.y,
                z: focusZ + depth.z * Math.cos(yaw) - depth.x * Math.sin(yaw),
              };
              const frame = basis(eye, focus);
              for (let x = -4; x <= size + 4; x += size <= 40 ? 2 : 10)
                for (let z = -4; z <= size + 4; z += size <= 40 ? 2 : 10)
                  for (const y of [-4, 0, 4, 16, 20]) {
                    const relative = { x: x - focusX, y, z: z - focusZ };
                    if (
                      Math.abs(dot(relative, frame.up)) > height ||
                      Math.abs(dot(relative, frame.right)) > height * aspect
                    )
                      continue;
                    const distance = frame.distance - dot(relative, frame.forward);
                    assert.ok(
                      distance > depth.near && distance < depth.far,
                      `clipped ${JSON.stringify({ aspect, zoom, focus, x, y, z, distance, depth })}`,
                    );
                  }
            }
      }
  }
});

test('wide ocean remains inside depth planes when a narrow viewport is zoomed out', () => {
  for (const size of [40, 192]) {
    for (const aspect of [0.3, 0.5, 1, 2])
      for (const zoom of [0.25, 1, 1.8]) {
        const height = fittedOrthoHeight(aspect, size) * zoom,
          depth = cameraDepth(size, height);
        for (const center of [-4, 6, size / 2, size + 4]) {
          const focus = { x: center, y: 0, z: center };
          const frame = basis({ x: center + depth.x, y: depth.y, z: center + depth.z }, focus);
          for (let x = -size; x <= size * 2; x += 8)
            for (let z = -size; z <= size * 2; z += 8) {
              const relative = { x: x - center, y: -0.62, z: z - center };
              if (
                Math.abs(dot(relative, frame.up)) > height ||
                Math.abs(dot(relative, frame.right)) > height * aspect
              )
                continue;
              const distance = frame.distance - dot(relative, frame.forward);
              assert.ok(distance > depth.near && distance < depth.far);
            }
        }
      }
  }
});

test('complete title world bounds fit portrait and landscape frames during restrained orbit', () => {
  const size = 192;
  for (const aspect of [0.3, 0.5, 1, 2, 3]) {
    const height = fittedOrthoHeight(aspect, size),
      depth = cameraDepth(size, height);
    for (const yaw of [-0.035, 0, 0.035]) {
      const eye = {
        x: depth.x * Math.cos(yaw) + depth.z * Math.sin(yaw),
        y: depth.y,
        z: depth.z * Math.cos(yaw) - depth.x * Math.sin(yaw),
      };
      const frame = basis(eye, { x: 0, y: 0, z: 0 });
      for (const x of [-size / 2 - 4, size / 2 + 4])
        for (const z of [-size / 2 - 4, size / 2 + 4])
          for (const y of [-4, 20]) {
            assert.ok(Math.abs(dot({ x, y, z }, frame.right)) < height * aspect);
            assert.ok(Math.abs(dot({ x, y, z }, frame.up)) < height);
            const distance = frame.distance - dot({ x, y, z }, frame.forward);
            assert.ok(distance > depth.near && distance < depth.far);
          }
    }
  }
});

// A small analytic orthographic camera exercises the production input wiring.
// This is not a Cocos renderer, shader, import, browser or GPU test.
function fixture(version = 4, candidate = null, { width = 800, height = 600, dpr = 1 } = {}) {
  const pixelWidth = width * dpr,
    pixelHeight = height * dpr;
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
      this.set(x, y, z);
    }
    set(x, y, z) {
      Object.assign(this, { x, y, z });
    }
  }
  class Node {
    static EventType = {
      TOUCH_START: 'start',
      TOUCH_MOVE: 'move',
      TOUCH_END: 'end',
      TOUCH_CANCEL: 'cancel',
      MOUSE_WHEEL: 'wheel',
    };
    constructor(name) {
      this.name = name;
      this.events = new Map();
      this.children = [];
      this.components = [];
      this.position = new Vec3();
      this.active = true;
    }
    get activeInHierarchy() {
      return this.active && (!this.parent || this.parent.activeInHierarchy);
    }
    get scene() {
      return this.parent ? this.parent.scene : this;
    }
    getChildByName(name) {
      return this.children.find((child) => child.name === name);
    }
    getComponent(Type) {
      return this.components.find((component) => component instanceof Type);
    }
    addChild(node) {
      node.parent = this;
      this.children.push(node);
    }
    addComponent(Type) {
      const component = new Type();
      component.node = this;
      this.components.push(component);
      return component;
    }
    on(type, callback, self) {
      this.events.set(type, { callback, self });
    }
    off(type) {
      this.events.delete(type);
    }
    emit(type, event) {
      const entry = this.events.get(type);
      entry?.callback.call(entry.self, event);
    }
    setPosition(x, y, z) {
      this.position.set(x, y, z);
    }
    lookAt(focus) {
      this.focus = { ...focus };
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Camera {
    static ProjectionType = { ORTHO: 0 };
    static ClearFlag = { SOLID_COLOR: 0 };
    constructor() {
      this.camera = { update() {} };
      this.enabledInHierarchy = true;
    }
    worldToScreen(point) {
      const frame = basis(this.node.position, this.node.focus);
      const relative = add(point, this.node.focus, -1);
      const aspect = (pixelWidth * this.rect.width) / (pixelHeight * this.rect.height);
      return {
        x:
          (this.rect.x +
            ((dot(relative, frame.right) / (this.orthoHeight * aspect) + 1) / 2) *
              this.rect.width) *
          pixelWidth,
        y:
          (this.rect.y +
            ((dot(relative, frame.up) / this.orthoHeight + 1) / 2) * this.rect.height) *
          pixelHeight,
        z: frame.distance - dot(relative, frame.forward),
      };
    }
    screenPointToRay(x, y, ray) {
      const frame = basis(this.node.position, this.node.focus);
      const sx =
        (((x / pixelWidth - this.rect.x) / this.rect.width) * 2 - 1) *
        this.orthoHeight *
        ((pixelWidth * this.rect.width) / (pixelHeight * this.rect.height));
      const sy = (((y / pixelHeight - this.rect.y) / this.rect.height) * 2 - 1) * this.orthoHeight;
      ray.o = add(add(this.node.position, frame.right, sx), frame.up, sy);
      ray.d = { x: -frame.forward.x, y: -frame.forward.y, z: -frame.forward.z };
    }
  }
  const cc = {
    Node,
    Camera,
    DirectionalLight: class {},
    Vec3,
    Rect: class {
      constructor(x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    },
    geometry: { Ray: class {} },
    Layers: { Enum: { DEFAULT: 1 } },
    screen: { windowSize: { width: pixelWidth, height: pixelHeight }, devicePixelRatio: dpr },
  };
  const source = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/MapCamera.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(
    (id) => {
      if (id === 'cc') return cc;
      if (id === './InputProvenance') return require('./helpers/input-provenance.cjs');
      if (id === './Palette') return { color: (value) => value };
      if (id === './TouchPicking')
        return { markTouchRay: (ray, context) => Object.assign(ray, { touchContext: context }) };
      if (id === './SceneLighting' || id === './CameraVisibility') {
        const lighting = { exports: {} };
        const code = ts.transpileModule(
          fs.readFileSync(`assets/scripts/presentation/${id.slice(2)}.ts`, 'utf8'),
          {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
          },
        ).outputText;
        new Function('require', 'module', 'exports', code)(() => cc, lighting, lighting.exports);
        return lighting.exports;
      }
      return require(`../.domain-build/${id.slice(3)}`);
    },
    module,
    module.exports,
  );
  const root = new Node('root'),
    input = new Node('input');
  root.addChild(input);
  const sunlight = new Node('TownSun');
  root.addChild(sunlight);
  const sun = sunlight.addComponent(cc.DirectionalLight);
  const events = [];
  const hooks = Object.fromEntries(
    ['tap', 'drag', 'drop', 'cancel'].map((name) => [
      name,
      (...args) => events.push([name, ...args]),
    ]),
  );
  hooks.covered = () => false;
  hooks.candidate = () => candidate;
  const map = new module.exports.MapCamera(root, input, hooks, version);
  map.layout(width, height, 0, 0);
  const contacts = new Map();
  const touch = (type, id, x, y) => {
    if (type === 'start') contacts.set(id, { getID: () => id });
    if (type === 'end' || type === 'cancel') contacts.delete(id);
    const event = {
      target: input,
      getAllTouches: () => [...contacts.values()],
      getEventCode: () => type,
      getID: () => id,
      getLocation: () => ({ x: x * dpr, y: y * dpr }),
      getUILocation: () => ({ x, y }),
    };
    if (type !== 'move') root.emit(type, event);
    input.emit(type, event);
  };
  return { map, input, events, touch, sun };
}

test('real wheel handler preserves its ground anchor without a first-event zoom jump', () => {
  for (const version of [1, 2, 3, 4]) {
    const { map, input } = fixture(version);
    const p = { x: 430, y: 310 },
      before = map.ground(p),
      zoom = map.zoom;
    const event = { getLocation: () => p, getScrollY: () => 1 };
    input.emit('wheel', event);
    near(map.zoom, zoom * Math.exp(-0.002));
    near(map.ground(p).x, before.x);
    near(map.ground(p).z, before.z);
    assert.equal(event.propagationStopped, true);
    map.zoomBy(1);
    map.zoomBy(-1);
    if (version === 4) near(map.zoom, zoom * Math.exp(-0.002));
  }
});

for (const mode of ['pan', 'drag']) {
  test(`horizontal/zero/invalid map wheel preserves an active ${mode} gesture`, () => {
    const { map, input, touch, events } = fixture(4, mode === 'drag' ? 'b2' : null);
    touch('start', 1, 400, 300);
    if (mode === 'drag') {
      map.gesture.startedAt -= 500;
      map.tick();
    }
    touch('move', 1, 450, 330);
    const frame = () => ({
      zoom: map.zoom,
      focus: { ...map.focus },
      eye: { ...map.camera.node.position },
    });
    const before = frame();
    events.length = 0;
    for (const [x, y] of [
      [120, 0],
      [-120, 0],
      [0, 0],
      [0, -0],
      [0, NaN],
      [0, Infinity],
      [0, -Infinity],
    ]) {
      const event = {
        getLocation: () => ({ x: 450, y: 330 }),
        getScrollX: () => x,
        getScrollY: () => y,
      };
      input.emit('wheel', event);
      assert.equal(event.propagationStopped, true);
      assert.deepEqual(frame(), before, `wheel ${x}, ${y} must leave camera unchanged`);
      assert.equal(map.interacting, true, 'non-vertical scroll must not cancel a held contact');
      assert.deepEqual(events, []);
    }
    touch('move', 1, 470, 350);
    if (mode === 'pan') assert.notDeepEqual(frame().focus, before.focus);
    else assert.equal(events.filter(([type]) => type === 'drag').length, 1);
    touch('end', 1, 470, 350);
    assert.equal(events.filter(([type]) => type === 'drop').length, mode === 'drag' ? 1 : 0);
    assert.equal(
      events.some(([type]) => type === 'tap'),
      false,
    );
    assert.equal(map.interacting, false);
  });
  test(`valid vertical wheel still zooms and cancels an active ${mode}`, () => {
    const { map, input, touch, events } = fixture(4, mode === 'drag' ? 'b2' : null);
    touch('start', 1, 400, 300);
    if (mode === 'drag') {
      map.gesture.startedAt -= 500;
      map.tick();
    }
    touch('move', 1, 450, 330);
    const zoom = map.zoom;
    events.length = 0;
    const event = { getLocation: () => ({ x: 450, y: 330 }), getScrollY: () => -1 };
    input.emit('wheel', event);
    near(map.zoom, zoom * Math.exp(0.002));
    assert.equal(event.propagationStopped, true);
    assert.equal(map.interacting, false);
    assert.deepEqual(events, [['cancel']]);
    touch('move', 1, 470, 350);
    touch('end', 1, 470, 350);
    assert.ok(!events.some(([type]) => ['tap', 'drag', 'drop'].includes(type)));
  });
}

test('real pan and two-finger handlers keep ground anchors and cannot become a drop', () => {
  const { map, touch, events } = fixture(4, 'b2');
  const before = map.ground({ x: 400, y: 300 });
  touch('start', 1, 400, 300);
  touch('move', 1, 450, 330);
  near(map.ground({ x: 450, y: 330 }).x, before.x);
  near(map.ground({ x: 450, y: 330 }).z, before.z);
  touch('end', 1, 450, 330);
  const oldZoom = map.zoom;
  touch('start', 1, 360, 300);
  touch('start', 2, 440, 300);
  const anchor = map.ground({ x: 400, y: 300 });
  touch('move', 2, 460, 300);
  near(map.zoom, oldZoom * 0.8);
  near(map.ground({ x: 410, y: 300 }).x, anchor.x);
  near(map.ground({ x: 410, y: 300 }).z, anchor.z);
  touch('end', 2, 460, 300);
  touch('end', 1, 360, 300);
  assert.ok(!events.some(([type]) => ['tap', 'drag', 'drop'].includes(type)));
  touch('start', 3, 400, 300);
  map.gesture.startedAt -= 500;
  map.tick();
  touch('move', 3, 430, 320);
  touch('end', 3, 430, 320);
  assert.equal(events.filter(([type]) => type === 'drop').length, 1);
  assert.ok(events.some(([type]) => type === 'drag'));
});

test('old-world pan bounds stay 40, resetting to v4 changes bounds and home without mutating saves', () => {
  const { map } = fixture(3);
  map.shift({ x: 1000, z: 1000 }, { x: 0, z: 0 });
  assert.equal(map.focus.x, 44);
  assert.equal(map.focus.z, 44);
  map.overview();
  assert.equal(map.focus.x, 20);
  assert.equal(map.zoom, 1);
  map.reset(4);
  assert.equal(map.focus.x, 6);
  assert.equal(map.zoom, 0.0625);
  map.shift({ x: 1000, z: 1000 }, { x: 0, z: 0 });
  assert.equal(map.focus.x, 196);
  assert.equal(map.focus.z, 196);
  map.overview();
  assert.equal(map.focus.x, 96);
  assert.ok(map.camera.far > 100);
  map.reset(3);
  assert.equal(map.zoom, 0.3);
  assert.equal(map.camera.far, 100);
});

test('legacy overview drag keeps every on-screen terrain cell in front of near at DPR 1/2/3', () => {
  for (const version of [1, 2, 3, 4]) {
    const land = [];
    for (let z = 0; z < worldSize(version); z++)
      for (let x = 0; x < worldSize(version); x++) {
        const terrain = terrainAt(x, z, 1, version);
        if (terrain) land.push({ x: x + 0.5, y: terrain.elevation, z: z + 0.5 });
      }
    for (const dpr of [1, 2, 3]) {
      const { map, touch, sun, events } = fixture(version, null, { width: 390, height: 844, dpr });
      map.overview();
      for (let i = 0; i < 3; i++) {
        touch('start', i + 20, 195, 600);
        touch('move', i + 20, 220, 300);
        touch('end', i + 20, 220, 300);
      }
      near(map.focus.x, -4);
      near(map.focus.z, -4);
      assert.equal(map.zoom, 1);
      assert.equal(sun.shadowDistance, map.camera.far);
      let visible = 0;
      for (const point of land) {
        const screen = map.camera.worldToScreen(point);
        if (!map.contains(screen)) continue;
        visible++;
        assert.ok(
          screen.z > map.camera.near && screen.z < map.camera.far,
          `v${version} DPR${dpr} clipped ${JSON.stringify(point)} at depth ${screen.z}`,
        );
        const ground = map.ground(screen, point.y);
        assert.ok(ground, 'the ray must reach every visible terrain surface');
        near(ground.x, point.x);
        near(ground.z, point.z);
      }
      assert.ok(visible > 0);
      if (version === 2 || version === 3) {
        assert.equal(visible, 934);
        const point = { x: 31.5, y: 0, z: 31.5 },
          screen = map.project(point);
        near(screen.x / dpr, 220.56736446160016);
        near(screen.y / dpr, 239.41061032724377);
        assert.ok(map.ground(screen), 'formerly clipped coast at depth -7.22 remains pickable');
      }
      assert.ok(!events.some(([kind]) => ['tap', 'drag', 'drop'].includes(kind)));
    }
  }
});

test('legacy and v4 clip/shadow depth follow portrait and landscape layout without changing projection', () => {
  for (const version of [1, 2, 3, 4])
    for (const [width, height, dpr] of [
      [390, 844, 3],
      [844, 390, 2],
      [1280, 800, 1],
    ]) {
      const { map, sun } = fixture(version, null, { width, height, dpr });
      const size = worldSize(version);
      for (const zoom of [clampMapZoom(0, size), homeZoom(size), 1, 1.8]) {
        map.zoom = zoom;
        for (const [x, z] of [
          [-4, -4],
          [size + 4, size + 4],
          [-4, size + 4],
          [size + 4, -4],
          [size / 2, size / 2],
        ]) {
          map.focus.set(x, 0, z);
          map.layout(width, height, 0, 0);
          assert.equal(sun.shadowDistance, map.camera.far);
          assert.ok(map.camera.far < 2000, 'within the engine directional shadow distance range');
          const original = basis({ x: x + 15, y: 20, z: z + 18 }, map.focus);
          const frame = basis(map.camera.node.position, map.focus);
          for (const axis of ['x', 'y', 'z']) near(frame.forward[axis], original.forward[axis]);
          for (const point of [
            { x: 0, y: 0, z: 0 },
            { x: size / 2, y: 16, z: size / 2 },
            { x: size, y: 0, z: size },
            { x, y: 0, z },
          ]) {
            const relative = add(point, map.focus, -1),
              screen = map.project(point);
            near(
              screen.x / dpr,
              width / 2 + (dot(relative, original.right) * height) / (map.camera.orthoHeight * 2),
            );
            near(
              screen.y / dpr,
              height / 2 + (dot(relative, original.up) * height) / (map.camera.orthoHeight * 2),
            );
            if (!map.contains(screen)) continue;
            const depth = map.camera.worldToScreen(point).z;
            assert.ok(depth > map.camera.near && depth < map.camera.far);
          }
        }
      }
      map.reset(version);
      assert.equal(sun.shadowDistance, map.camera.far);
      near(map.focus.x, 6);
      near(map.zoom, homeZoom(size));
    }
});
test('v6 prospective overview error uses its actual target scale and framebuffer without moving the live camera', () => {
  for (const dpr of [1, 2, 3]) {
    const { map } = fixture(6, null, { width: 390, height: 844, dpr });
    map.camera.camera.window = { height: 844 * dpr };
    map.camera.camera.viewport = map.camera.rect;
    const before = { zoom: map.zoom, focus: { ...map.focus }, height: map.camera.orthoHeight };
    const target = Math.min(0.25, (0.75 * 2 * fittedOrthoHeight(390 / 844, 192)) / (844 * dpr));
    near(map.maxOverviewError(), target);
    assert.deepEqual(
      { zoom: map.zoom, focus: { ...map.focus }, height: map.camera.orthoHeight },
      before,
    );
    assert.ok(map.maxTerrainError() < map.maxOverviewError());
    map.overview();
    near(map.maxTerrainError(), target);
  }
});

test('player overhead view is reversible and keeps mouse/touch ground projection coherent', () => {
  for (const viewport of [
    { width: 390, height: 844, dpr: 2 },
    { width: 1280, height: 800, dpr: 1 },
  ]) {
    const { map } = fixture(6, null, viewport);
    const before = {
      focus: { ...map.focus },
      zoom: map.zoom,
      position: { ...map.camera.node.position },
    };
    assert.equal(map.overhead, false);
    const revision = map.navigationRevision;
    assert.equal(map.toggleOverhead(), true);
    assert.equal(map.navigationRevision, revision + 1);
    assert.equal(map.camera.node.position.x, map.focus.x);
    assert.equal(map.camera.node.position.z, map.focus.z);
    assert.ok(map.camera.node.position.y > 72);
    for (const touch of [false, true]) {
      const point = { x: 6.25, y: 0, z: 6.5 };
      const screen = { ...map.project(point), touch };
      const ray = map.screenRay(screen);
      near(ray.d.x, 0);
      near(ray.d.z, 0);
      const hit = map.ground(screen, 0);
      near(hit.x, point.x);
      near(hit.z, point.z);
    }
    assert.equal(map.toggleOverhead(), false);
    assert.deepEqual({ ...map.camera.node.position }, before.position);
    assert.deepEqual({ ...map.focus }, before.focus);
    assert.equal(map.zoom, before.zoom);
  }
});
