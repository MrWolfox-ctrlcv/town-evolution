/** Deterministic campaign fixture. Physical contacts, UI hit tests and projection
 * are adapters; production input sources, gestures, meshes, rules and saves run.
 * Never changes live inventory/buildings/resources to manufacture a passing path.
 */
const assert = require('node:assert/strict');
const game = require('../../.domain-build/domain/game');
const { GameSession } = require('../../.domain-build/application/GameSession');
const { MapGesture } = require('../../.domain-build/application/MapGesture');
const { ContinuousResources } = require('../../.domain-build/art/ContinuousResources');
const { terrainAt } = require('../../.domain-build/domain/terrain');
const { SceneNode, presentation, collaborators } = require('./demo-campaign-scene.cjs');
const inputRoute = require('./cocos-input-route.cjs');
const { load: loadControl, Node: ControlNode } = require('./selection-ui.cjs');
const { ToolTray } = presentation('ToolTray');
const { ToolRouter } = presentation('ToolRouter');
const { TownView } = presentation('TownView');
const { ObjectDrag } = presentation('ObjectDrag');
const { commerceActions } = presentation('CommercePanel');
const E = SceneNode.EventType;

function fixture(source) {
  assert.ok(['native', 'web', 'mouse'].includes(source));
  let now = 100000,
    gestures = 0;
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const session = new GameSession(
    storage,
    () => now,
    () => game.createDemoGame(now),
  );
  const state = () => session.state;
  const parent = new SceneNode('Campaign');
  const town = new TownView(parent);
  let naturalVersion = '';
  function refresh() {
    const signature = state()
      .naturalResources.map((r) => `${r.id}:${r.amount}`)
      .join('|');
    if (signature !== naturalVersion) {
      naturalVersion = signature;
      const generated = new ContinuousResources(
        game.worldSize(state().terrainVersion),
        state().mapSeed,
        (x, z) => terrainAt(x, z, state().mapSeed, state().terrainVersion),
      ).sync(state().naturalResources);
      town.island.naturalSurface = generated.naturalSurface;
      town.island.dropSupport.set('natural', generated.mesh);
    }
    town.sync(state(), null, null, now);
  }
  const map = {
    cancelGesture() {},
    contains: (point) => point.x >= 0,
    screenRay: (point) => ({ o: { x: point.x, y: 20, z: point.y }, d: { x: 0, y: -1, z: 0 } }),
    ground: (point) => ({ x: point.x, z: point.y }),
  };
  const ray = (point) => map.screenRay(point);
  const ui = presentation('UiContracts').createUiState();
  const router = new ToolRouter(parent, session, map, town, ui, refresh);
  const tray = new ToolTray(parent);
  tray.layout(1280, 800, 70);
  tray.setHandlers(router);
  const drag = new ObjectDrag(parent, session, ui, town, refresh, {
    acceptsProductDrop: (point) => point.x < 0,
    highlightProductDrop() {},
  });
  let controls;
  refresh();
  function route(node, types = E, hitTest) {
    return inputRoute(node, types, presentation('InputProvenance'), { hitTest });
  }
  function tool(kind, points) {
    const tile = [...tray.left.entries, ...tray.right.entries].find((e) => e.kind === kind).node;
    const input = route(tile);
    collaborators.cc.input = input.input;
    try {
      input.send(source, E.TOUCH_START, { x: -10, y: 30 }, 7);
      for (const point of points) input.send(source, E.TOUCH_MOVE, point, 7);
      input.send(source, E.TOUCH_END, points.at(-1), 7);
      assert.equal(router.active, false, 'Tool release clears its capture');
    } finally {
      input.release();
      delete collaborators.cc.input;
    }
    gestures++;
    refresh();
  }
  function object(from, to) {
    let time = 0;
    const gesture = new MapGesture(
      {
        candidate: (p) => drag.candidate(ray(p)),
        tap() {
          assert.fail('A deliberate long press must not tap');
        },
        pan() {
          assert.fail('A deliberate long press must not pan');
        },
        pinch() {
          assert.fail('One contact must not pinch');
        },
        drag: (id, p) => drag.move(id, { x: p.x, y: 0, z: p.y }, ray(p), p),
        drop: (id, p) => drag.drop(id, ray(p), p),
        cancel: () => drag.clear(),
      },
      () => time,
    );
    const target = {
      emit(type, event) {
        const id = event.getID(),
          point = event.getLocation();
        if (type === E.TOUCH_START) gesture.begin(id, point, event.getUILocation());
        else if (type === E.TOUCH_MOVE) gesture.move(id, point, event.getUILocation());
        else if (
          type === E.TOUCH_END ||
          (type === E.TOUCH_CANCEL && event.getEventCode() === E.TOUCH_END)
        )
          gesture.end(id, point, event.getUILocation());
        else gesture.clear();
      },
    };
    const input = route(target, E, () => true);
    try {
      input.send(source, E.TOUCH_START, from, 7);
      time = 500;
      gesture.poll();
      input.send(source, E.TOUCH_MOVE, to, 7);
      input.send(source, E.TOUCH_END, to, 7);
      assert.equal(gesture.interacting, false);
    } finally {
      input.release();
    }
    gestures++;
    refresh();
  }
  function visiblePoint(kind, id) {
    const entity =
      kind === 'building'
        ? state().buildings.find((b) => b.id === id)
        : kind === 'tree'
          ? state().trees.find((t) => t.id === id)
          : kind === 'drop'
            ? state().looseDrops.find((d) => d.id === id)
            : kind === 'natural'
              ? state().naturalResources.find((r) => r.id === id)
              : state().groundStacks.find((p) => `pile:${p.x}:${p.z}` === id);
    assert.ok(entity, `Existing ${kind} ${id}`);
    const size =
      kind === 'building'
        ? game.footprint(entity)
        : kind === 'drop'
          ? require('../../.domain-build/application/DropGeometry').dropRect(entity)
          : { width: 1, depth: 1 };
    const origin = kind === 'drop' ? size : entity;
    for (const dx of [0.5, 0.25, 0.75, 0.1, 0.9])
      for (const dz of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const p = { x: origin.x + size.width * dx, y: origin.z + size.depth * dz };
        const hit =
          kind === 'building'
            ? town.pickBuilding(ray(p))
            : kind === 'tree'
              ? town.pickTree(ray(p))
              : kind === 'drop'
                ? town.pickDrop(ray(p))
                : kind === 'natural'
                  ? town.pickNatural(ray(p))
                  : town.pickStack(ray(p))?.id;
        if (hit === id) return p;
      }
    return null;
  }
  function visible(kind, id) {
    const point = visiblePoint(kind, id);
    assert.ok(point, `An actual mesh of ${kind} ${id} is exposed`);
    return point;
  }
  function exposedGround(item, quantity = 1, craftTool = null) {
    const size = game.worldSize(state().terrainVersion);
    for (let z = 1; z < size; z++)
      for (let x = 1; x < size; x++) {
        const p = { x: x + 0.5, y: z + 0.5 },
          r = ray(p);
        if (town.pickBuilding(r) || town.pickTree(r) || town.pickNatural(r) || town.pickStack(r))
          continue;
        // Planning uses pure dispatch snapshots, never patches the live session.
        const dropped = game.dispatch(state(), { type: 'dropProduct', item, quantity, x, z }, now);
        if (
          dropped.ok &&
          (!craftTool ||
            game.dispatch(dropped.state, { type: 'useTool', tool: craftTool, x, z }, now).ok)
        )
          return p;
      }
    assert.fail(`No legal exposed ground for ${item} x${quantity}`);
  }
  function tapAction(action) {
    if (!controls) {
      const { ActionButton } = loadControl('Widgets');
      controls = new ActionButton(new ControlNode('CampaignControls'), (message) =>
        assert.fail(message),
      );
    }
    controls.set(action);
    const types = ControlNode.EventType;
    const input = inputRoute(controls.node, types, loadControl('InputProvenance'), {
      hitTest: () => true,
    });
    try {
      input.send(source, types.TOUCH_START, { x: 100, y: 100 }, 7);
      input.send(source, types.TOUCH_END, { x: 100, y: 100 }, 7);
    } finally {
      input.release();
    }
    gestures++;
  }
  function commerce(buildingId, text) {
    const actions = commerceActions(
      session,
      { selected: buildingId, tradeItem: 'vegetable', quantity: 1 },
      {
        command: (command) => {
          assert.ok(session.run(command), session.message);
          refresh();
        },
        item() {},
        quantity() {},
      },
    );
    const action = actions.find((a) => a.text.includes(text));
    assert.ok(action && action.enabled !== false, action?.reason ?? text);
    tapAction(action);
  }
  return {
    session,
    state,
    storage,
    town,
    tool,
    object,
    visible,
    visiblePoint,
    exposedGround,
    commerce,
    pickupDrops(predicate = () => true) {
      for (const d of state().looseDrops.filter(predicate)) {
        const p = visible('drop', d.id);
        presentation('ObjectContext').pickObject(ui, town, ray(p));
        assert.deepEqual(ui.selectedResource, { kind: 'drop', id: d.id });
        const menu = loadControl('HudActions').actions(session, ui, {
          command: (c) => {
            assert.equal(session.run(c), true, session.message);
            refresh();
          },
        });
        assert.equal(menu.length, 1);
        assert.equal(menu[0].enabled, true, menu[0].reason);
        tapAction(menu[0]);
        refresh();
      }
    },
    now: () => now,
    gestures: () => gestures,
    advanceTo(time) {
      assert.ok(time >= now);
      now = time;
      session.resume();
      refresh();
    },
    persisted() {
      assert.deepEqual(new GameSession(storage, () => now).state, state());
    },
    dispose() {
      controls?.cancelGesture();
      controls?.node.destroy();
      tray.dispose();
      router.dispose();
      drag.dispose();
      town.dispose();
    },
  };
}
module.exports = { fixture };
