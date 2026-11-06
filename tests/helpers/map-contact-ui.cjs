/** Production map, tray, handbook and radial listeners with the actual 3.8.8
 * pointer-dispatch loop. Engine scene/projection/drawing are narrow collaborators,
 * not a renderer, browser, native build or device test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const ts = require('typescript');
const dispatchFactory = require('../fixtures/cocos-pointer-dispatch.cjs');
const game = require('../../.domain-build/domain/game');
const { GameSession } = require('../../.domain-build/application/GameSession');

function fixture({ width = 1200, height = 800, dpr = 1, realProcessor = false } = {}) {
  // Reuse the established transformed UI/handbook collaborators, without running its tests.
  const file = require.resolve('../handbook-gestures-ui.test.cjs');
  const prelude = fs.readFileSync(file, 'utf8').split('const { RecipeHandbook } = load')[0];
  const { Node, UITransform, dependencies, load, geometry, Vec2 } = new Function(
    'require',
    prelude + '\nreturn { Node, UITransform, dependencies, load, geometry, Vec2 };',
  )(createRequire(file));
  const physical = new Map();
  let snapshot = null;
  const touches = () => [...physical.values()].map((c) => c.touch);
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
      this.set(x, y, z);
    }
    set(x, y, z) {
      Object.assign(this, { x, y, z });
      return this;
    }
  }
  class Camera {
    static ProjectionType = { ORTHO: 1 };
    static ClearFlag = { SOLID_COLOR: 1 };
    camera = { update() {} };
    screenPointToRay(x, y, r) {
      Object.assign(r, { o: { x, y: 20, z: y }, d: { x: 0, y: -1, z: 0 } });
    }
  }
  Object.assign(Node.prototype, {
    lookAt() {},
    setRotationFromEuler() {},
    setWorldPosition(p) {
      this.setPosition(p);
    },
    destroy() {
      this.active = false;
      this.destroyed = true;
    },
    setSiblingIndex(index) {
      if (!this.parent) return;
      const a = this.parent.children;
      a.splice(a.indexOf(this), 1);
      a.splice(index, 0, this);
    },
  });
  dependencies.cc.Graphics.prototype.ellipse = function () {};
  UITransform.prototype.getBoundingBoxToWorld = function () {
    const p = geometry(this.node);
    return {
      xMin: p.x - this.width / 2,
      xMax: p.x + this.width / 2,
      yMin: p.y - this.height / 2,
      yMax: p.y + this.height / 2,
    };
  };
  UITransform.prototype.convertToNodeSpaceAR = function (p) {
    const o = geometry(this.node);
    return new Vec3(p.x - o.x, p.y - o.y, p.z ?? 0);
  };
  const cc = dependencies.cc;
  Object.assign(cc, {
    Vec3,
    Camera,
    input: {
      on() {},
      off() {},
      getAllTouches: () => (snapshot ? snapshot() : touches()),
      _touchInput: { _eventTarget: { emit: (type, event) => dispatch.call(dispatcher, event) } },
      _mouseInput: {
        _eventTarget: { emit: (type, event) => dispatch.call(dispatcher, event.touchEvent) },
      },
    },
    Input: { EventType: { KEY_DOWN: 'key-down' } },
    KeyCode: { ESCAPE: 27 },
    screen: { windowSize: { width: width * dpr, height: height * dpr }, devicePixelRatio: dpr },
    Rect: class {
      constructor(x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      }
    },
    geometry: { Ray: class {} },
    view: { getViewportRect: () => ({ x: 0, y: 0 }), getScaleX: () => dpr, getScaleY: () => dpr },
  });
  class Artwork {
    bind() {}
    bindButton(node, width, height) {
      node.getComponent(UITransform).setContentSize(width, height);
    }
    dispose() {}
  }
  dependencies['./ActionArtwork'] = { ActionArtwork: Artwork, actionIcon: () => 'manage' };
  dependencies['./SettingsArtwork'] = { SettingsArtwork: Artwork };
  const touchContexts = new WeakMap();
  dependencies['./TouchPicking'] = {
    markTouchRay: (ray, context) => {
      touchContexts.set(ray, context);
      return ray;
    },
  };
  dependencies['./SceneLighting'] = { fitTownShadowDepth() {} };
  dependencies['./TrayIcons'] = {
    TRAY_LABELS: {},
    TrayIcons: class {
      draw() {}
      dispose() {}
    },
  };
  dependencies['./ModelFactory'] = {
    ModelFactory: class {
      shape(parent, name) {
        const n = new Node(name);
        parent.addChild(n);
        return n;
      }
      dispose() {}
    },
  };
  const { uiNode } = load('Widgets');
  const { MapCamera } = load('MapCamera');
  const { RadialActions } = load('RadialActions');
  const { ToolTray } = load('ToolTray');
  const { ToolRouter } = load('ToolRouter');
  const { RecipeHandbook } = load('RecipeHandbook');
  const data = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(fs.readFileSync('assets/scripts/presentation/TownHUD.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
  )((id) => (id === 'cc' ? cc : {}), data, data.exports);
  const scene = new Node('Scene');
  scene.dpr = dpr;
  const canvas = uiNode('Canvas', scene);
  canvas.setPosition(width / 2, height / 2);
  const input = uiNode('MapInput', canvas);
  input.getComponent(UITransform).setContentSize(width, height);
  const values = new Map();
  let writes = 0;
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      writes++;
      values.set(k, v);
    },
    removeItem: (k) => values.delete(k),
  };
  const session = new GameSession(
    storage,
    () => 100,
    () => game.createGame(100, 1, 1),
  );
  session.save();
  const events = [];
  const map = new MapCamera(
    scene,
    input,
    {
      covered: () => false,
      candidate: () => null,
      tap: () => events.push('tap'),
      drag: () => events.push('drag'),
      drop: () => events.push('drop'),
      cancel: () => events.push('cancel'),
    },
    1,
  );
  map.layout(width, height, 0, 0);
  map.anchor = () => events.push('pan');
  map.zoomAt = () => events.push('pinch');
  const radial = new RadialActions(canvas, () => {});
  radial.layout(width, height);
  radial.open();
  radial.render({
    target: { kind: 'building', id: 'b1' },
    detail: '仓库',
    actions: [
      {
        text: '旋转',
        run: () => {
          events.push('button');
          session.run({ type: 'rotateBuilding', buildingId: 'b1' });
        },
      },
    ],
    rotation: null,
  });
  const tray = new ToolTray(canvas);
  tray.layout(width, height, 70);
  const town = {
    pickTree: () => null,
    pickNatural: () => null,
    pickBuilding: () => null,
    pickStack: () => null,
    pickPlant: () => null,
    pickCrop: () => null,
  };
  const router = new ToolRouter(scene, session, map, town, {}, () => {});
  tray.setHandlers(router);
  const book = new RecipeHandbook(canvas);
  book.layout(width, height);
  book.setState(session.state);
  // Match TownHUD's multi-touch cancellation order. Its projectObject method is unmodified.
  canvas.on(
    'start',
    (e) => {
      if (provenance.hasMultipleContacts(e, cc.input)) radial.cancel();
    },
    null,
    true,
  );
  const hud = Object.assign(Object.create(data.exports.TownHUD.prototype), {
    canvas,
    radial,
    tools: tray,
    handbook: book,
  });
  const project = () =>
    hud.projectObject(
      [
        { x: (width / 2 - 60) * dpr, y: (height / 2 - 40) * dpr },
        { x: (width / 2 + 60) * dpr, y: (height / 2 + 40) * dpr },
      ],
      map.interacting || router.active,
    );
  project();
  const nodes = (n = scene) => [n, ...n.children.flatMap((c) => nodes(c))];
  const get = (name) => {
    const n = nodes().find((n) => n.name === name);
    assert.ok(n, name);
    return n;
  };
  const deliver = (node, e) => {
    e.target = node;
    e.propagationStopped = false;
    const route = [];
    for (let n = node; n; n = n.parent) route.unshift(n);
    const invoke = (n, capture) => {
      e.currentTarget = n;
      for (const l of [...(n.events.get(e.type) ?? [])])
        if (l.capture === capture) l.fn.call(l.context ?? n, e);
    };
    for (const n of route.slice(0, -1)) {
      invoke(n, true);
      if (e.propagationStopped) return;
    }
    invoke(node, true);
    invoke(node, false);
    if (e.propagationStopped) return;
    for (const n of route.slice(0, -1).reverse()) {
      invoke(n, false);
      if (e.propagationStopped) return;
    }
  };
  class EventTouch {
    constructor(changed, bubbles, type, all = []) {
      Object.assign(this, {
        type,
        bubbles,
        touch: changed[0],
        changed,
        all,
        code: type,
        simulate: false,
      });
    }
    getTouches() {
      return this.changed;
    }
    getID() {
      return this.touch.getID();
    }
    getAllTouches() {
      return this.all;
    }
    getLocation(out) {
      const point = this.touch.getLocation();
      return out ? Object.assign(out, point) : point;
    }
    getUILocation() {
      return this.touch.getUILocation();
    }
    getEventCode() {
      return this.code;
    }
  }
  const source = realProcessor
    ? require('../fixtures/cocos-input-source.cjs')(Node.EventType, {}, class {}, Vec2)
    : null;
  const processors = new Map();
  const dispatcher = {
    _inDispatchCount: 0,
    _pointerEventProcessorList: [],
    _sortPointerEventProcessorList() {
      for (const node of nodes().filter((n) => n.events.has('start')))
        if (!processors.has(node))
          processors.set(node, {
            node,
            claimedTouchIdList: [],
            shouldHandleEventTouch: true,
            get isEnabled() {
              return node.activeInHierarchy;
            },
            _handleEventTouch(e) {
              if (source) {
                node._getUITransformComp = () => node.getComponent(UITransform);
                node.dispatchEvent = (event) => deliver(node, event);
                return source.processor._handleEventTouch.call(this, e);
              }
              if (e.type === 'start' && !node.getComponent(UITransform)?.hitTest(e.getLocation()))
                return false;
              if (e.type === 'end' && !node.getComponent(UITransform).hitTest(e.getLocation()))
                e.type = 'cancel';
              deliver(node, e);
              return true;
            },
            ...(source
              ? Object.fromEntries(
                  [
                    '_handleTouchStart',
                    '_handleTouchMove',
                    '_handleTouchEnd',
                    '_handleTouchCancel',
                  ].map((name) => [name, source.processor[name]]),
                )
              : {}),
            dispatchEvent: (e) => deliver(node, e),
          });
      this._pointerEventProcessorList = nodes()
        .map((n) => processors.get(n))
        .filter(Boolean)
        .reverse();
    },
    _updatePointerEventProcessorList() {},
    _removeClaimedTouch(index, id) {
      for (const p of this._pointerEventProcessorList.slice(index)) {
        const i = p.claimedTouchIdList.indexOf(id);
        if (i >= 0) p.claimedTouchIdList.splice(i, 1);
      }
    },
  };
  const dispatch = dispatchFactory(
    { TOUCH_START: 'start', TOUCH_MOVE: 'move', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' },
    (a, i) => a.splice(i, 1),
    EventTouch,
  );
  const provenance = load('InputProvenance');
  const releaseProvenance = provenance.bindInputProvenance(cc.input);
  function send(
    type,
    id,
    target = input,
    point = geometry(target),
    { mouse = false, all, simulate = false, origin, button = 0 } = {},
  ) {
    let c = physical.get(id);
    if (!c) {
      c = { target, point };
      c.touch = {
        getID: () => id,
        getLocation: () => new Vec2(c.point.x * dpr, c.point.y * dpr),
        getUILocation: () => new Vec2(c.point.x, c.point.y),
      };
    }
    c.point = point;
    if (type === 'start') physical.set(id, c);
    if (type === 'end' || type === 'cancel') physical.delete(id);
    const e = new EventTouch(
      [c.touch],
      true,
      type,
      all ?? (mouse ? (type === 'end' ? [] : [c.touch]) : touches()),
    );
    if (simulate !== null) e.simulate = simulate;
    if (origin === 'unknown') dispatch.call(dispatcher, e);
    else if (mouse)
      cc.input._mouseInput._eventTarget.emit(
        type === 'start' ? 'mouse-down' : type === 'move' ? 'mouse-move' : 'mouse-up',
        { getButton: () => button, touchEvent: e },
      );
    else cc.input._touchInput._eventTarget.emit(`touch-${type}`, e);
    if (type === 'start')
      assert.equal(e.target, target, `${target.name} must be the foremost visible hit`);
    return e;
  }
  const button = radial.buttons.find((b) => b.node.activeInHierarchy).node;
  const state = () => ({ state: game.exportSave(session.state), values: [...values], writes });
  const baseline = state();
  return {
    map,
    engineInput: cc.input,
    provenance,
    releaseProvenance,
    touchContext: (ray) => touchContexts.get(ray),
    book,
    tray,
    router,
    radial,
    hud,
    canvas,
    input,
    button,
    events,
    physical,
    project,
    send,
    get,
    geometry,
    session,
    storage,
    settings: (flow) => {
      const { SettingsPanel } = load('SettingsPanel');
      const { startMenu } = require('../../.domain-build/application/StartMenu');
      const render = () =>
        panel.render(
          startMenu(flow, () => {}),
          width,
          height,
        );
      const panel = new SettingsPanel(canvas, flow, render);
      render();
      return { panel, render };
    },
    state,
    load,
    unchanged: () => assert.deepEqual(state(), baseline),
    setSnapshot: (fn) => (snapshot = fn),
    tap: (id = 99) => {
      send('start', id, input);
      send('end', id, input);
    },
    reset: () => {
      provenance.clearInputProvenance(cc.input);
      tray.cancel();
      book.cancelGesture();
      map.resetInput();
      radial.cancel();
    },
  };
}
module.exports = { fixture };
