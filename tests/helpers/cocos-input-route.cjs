/** Real engine source -> Input -> pointer dispatcher -> node processor route.
 * Only physical contacts, coordinate conversion and scene hit testing are collaborators. */
const sourceFactory = require('../fixtures/cocos-input-source.cjs');
const dispatchFactory = require('../fixtures/cocos-pointer-dispatch.cjs');
module.exports = function inputRoute(
  node,
  types,
  provenance,
  { adapter = 'known', hitTest = (point) => point.x < 0 } = {},
) {
  const E = { ...types, MOUSE_DOWN: 'mouse-down', MOUSE_MOVE: 'mouse-move', MOUSE_UP: 'mouse-up' };
  const contacts = new Map();
  const manager = {
    getOrCreateTouch(id, x, y) {
      const touch = contacts.get(id) ?? {
        getID: () => id,
        getLocation(out = {}) {
          return Object.assign(out, { x: this.x, y: this.y });
        },
        getUILocation(out) {
          return this.getLocation(out);
        },
      };
      Object.assign(touch, { x, y });
      contacts.set(id, touch);
      return touch;
    },
    releaseTouch: (id) => contacts.delete(id),
    getAllTouches: () => [...contacts.values()],
  };
  class BaseEvent {
    constructor(type, bubbles) {
      Object.assign(this, { type, bubbles });
    }
  }
  class Vec2 {
    constructor(x = 0, y = 0) {
      Object.assign(this, { x, y });
    }
  }
  const source = sourceFactory(E, manager, BaseEvent, Vec2);
  const delivered = [];
  const scene = {
    _getUITransformComp: () => ({ hitTest }),
    dispatchEvent(event) {
      delivered.push({
        type: event.type,
        code: event.getEventCode(),
        simulate: event.simulate,
        finger: provenance.isTouchEvent(event),
        id: event.getID(),
      });
      node.emit(event.type, event);
    },
  };
  const processor = Object.assign(Object.create(source.processor), {
    node: scene,
    isEnabled: true,
    shouldHandleEventTouch: true,
    claimedTouchIdList: [],
  });
  const dispatcher = {
    _inDispatchCount: 0,
    _pointerEventProcessorList: [processor],
    _sortPointerEventProcessorList() {},
    _updatePointerEventProcessorList() {},
    _removeClaimedTouch() {},
  };
  const pointerDispatch = dispatchFactory(E, (a, i) => a.splice(i, 1), source.EventTouch);
  const input = {
    getAllTouches: manager.getAllTouches,
    _dispatchEventTouch: source.dispatch,
    _emitEvent: (event) => pointerDispatch.call(dispatcher, event),
  };
  const touchTarget = { emit: (_, event) => input._dispatchEventTouch(event) };
  const mouseTarget = { emit: (_, event) => source.simulate.call(input, event) };
  if (adapter === 'known' || adapter === 'frozen') {
    input._touchInput = { _eventTarget: touchTarget };
    input._mouseInput = { _eventTarget: mouseTarget };
  } else if (adapter === 'unknown') {
    input._touchInput = {};
    input._mouseInput = {};
  }
  if (adapter === 'frozen') {
    Object.freeze(touchTarget);
    Object.freeze(mouseTarget);
  }
  const originalMouseEmit = mouseTarget.emit;
  const originalTouchEmit = touchTarget.emit;
  const release = provenance.bindInputProvenance(input);
  const touchSource = {
    _eventTarget: touchTarget,
    _canvas: { focus() {} },
    _getCanvasRect: () => ({}),
    _getLocation: (point) => point,
    _windowManager: { getWindow: () => ({ getViewSize: () => ({}) }) },
  };
  function send(route, type, point, id = 0, button = 0) {
    if (route === 'mouse') {
      const mouseType = {
        [E.TOUCH_START]: E.MOUSE_DOWN,
        [E.TOUCH_MOVE]: E.MOUSE_MOVE,
        [E.TOUCH_END]: E.MOUSE_UP,
      }[type];
      if (!mouseType) throw new Error('Mouse source has no touch-cancel event');
      mouseTarget.emit(mouseType, {
        type: mouseType,
        windowId: 0,
        getButton: () => button,
        getLocationX: () => point.x,
        getLocationY: () => point.y,
      });
    } else {
      const changedTouches = [{ identifier: id, ...point }];
      if (route === 'native') source.native.call(touchSource, type, changedTouches, 0);
      else
        source.web.call(
          touchSource,
          type,
        )({
          changedTouches,
          target: touchSource._canvas,
          stopPropagation() {},
          preventDefault() {},
        });
    }
  }
  return {
    input,
    send,
    release,
    delivered,
    processor,
    touchTarget,
    originalTouchEmit,
    mouseTarget,
    originalMouseEmit,
  };
};
