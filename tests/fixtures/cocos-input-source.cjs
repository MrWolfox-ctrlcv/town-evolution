/** Verbatim selected Cocos Creator 3.8.8 TypeScript members, revision
 * 411f98df047c25902f93440d4b22925c2fb65461. Coordinates, scene nodes,
 * emitters and touch manager are collaborators; source and dispatch bodies are real.
 * cocos-input-source.test.cjs compares these members against an available engine checkout. */
/*
MIT License

Copyright (c) 2013-2016 Chukong Technologies Inc.
Copyright (c) 2017-2023 Xiamen Yaji Software Co., Ltd.

http://www.cocos.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const sources = {
  event: {
    file: 'cocos/input/types/event/event-touch.ts',
    names: [
      'touch',
      'simulate',
      'windowId',
      'preventSwallow',
      '_eventCode',
      '_touches',
      '_allTouches',
      'constructor',
      'getEventCode',
      'getTouches',
      'getAllTouches',
      'getLocation',
      'getUILocation',
      'getID',
    ],
    text: `
public touch: Touch | null = null;
public simulate = false;
public windowId = 0;
public preventSwallow = false;
private declare _eventCode: SystemEventTypeUnion;
private declare _touches: Touch[];
private declare _allTouches: Touch[];
constructor (changedTouches: Touch[], bubbles: boolean, eventType: SystemEventTypeUnion, touches: Touch[] = []) {
        super(eventType, bubbles);
        this._eventCode = eventType;
        this._touches = changedTouches || [];
        this._allTouches = touches;
    }
public getEventCode (): string {
        return this._eventCode;
    }
public getTouches (): Touch[] {
        return this._touches;
    }
public getAllTouches (): Touch[] {
        return this._allTouches;
    }
public getLocation (out?: Vec2): Vec2 {
        return this.touch ? this.touch.getLocation(out) : new Vec2();
    }
public getUILocation (out?: Vec2): Vec2 {
        return this.touch ? this.touch.getUILocation(out) : new Vec2();
    }
public getID (): number | null {
        return this.touch ? this.touch.getID() : null;
    }
`,
  },
  input: {
    file: 'cocos/input/input.ts',
    names: ['_simulateEventTouch', '_dispatchEventTouch'],
    text: `
private _simulateEventTouch (eventMouse: EventMouse): void {
        const eventType = pointerEventTypeMap[eventMouse.type];
        const touchID = 0;
        const touch = touchManager.getOrCreateTouch(touchID, eventMouse.getLocationX(), eventMouse.getLocationY());
        if (!touch) {
            return;
        }
        const changedTouches = [touch];
        const eventTouch = new EventTouch(changedTouches, false, eventType, (eventType === InputEventType.TOUCH_END ? [] : changedTouches));
        eventTouch.windowId = eventMouse.windowId;

        if (eventType === InputEventType.TOUCH_END) {
            touchManager.releaseTouch(touchID);
        }
        this._dispatchEventTouch(eventTouch);
    }
private _dispatchEventTouch (eventTouch: EventTouch): void {
        const touches = eventTouch.getTouches();
        const touchesLength = touches.length;
        for (let i = 0; i < touchesLength; ++i) {
            eventTouch.touch = touches[i];
            eventTouch.propagationStopped = eventTouch.propagationImmediateStopped = false;
            this._emitEvent(eventTouch);
        }
    }
`,
  },
  web: {
    file: 'pal/input/web/touch-input.ts',
    names: ['_createCallback'],
    text: `
private _createCallback (eventType: InputEventType) {
        return (event: TouchEvent): void => {
            const canvasRect = this._getCanvasRect();
            const handleTouches: Touch[] = [];
            const length = event.changedTouches.length;
            for (let i = 0; i < length; ++i) {
                const changedTouch = event.changedTouches[i];
                const touchID = changedTouch.identifier;
                if (touchID === null) {
                    continue;
                }
                const location = this._getLocation(changedTouch, canvasRect);
                const touch = touchManager.getOrCreateTouch(touchID, location.x, location.y);
                if (!touch) {
                    continue;
                }
                if (eventType === InputEventType.TOUCH_END || eventType === InputEventType.TOUCH_CANCEL) {
                    touchManager.releaseTouch(touchID);
                }
                handleTouches.push(touch);
            }
            event.stopPropagation();
            if (event.target === this._canvas) {
                event.preventDefault();
            }
            if (eventType === InputEventType.TOUCH_START) {
                this._canvas?.focus();
            }
            if (handleTouches.length > 0) {
                const eventTouch = new EventTouch(
                    handleTouches,
                    false,
                    eventType,
                    touchManager.getAllTouches(),
                );
                this._eventTarget.emit(eventType, eventTouch);
            }
        };
    }
`,
  },
  native: {
    file: 'pal/input/native/touch-input.ts',
    names: ['_dispatchEvent'],
    text: `
private _dispatchEvent (eventType: InputEventType, changedTouches: Touch[], windowId: number): void {
        const handleTouches: CCTouch[] = [];
        const length = changedTouches.length;
        const windowSize = this._windowManager.getWindow(windowId).getViewSize() as Size;
        for (let i = 0; i < length; ++i) {
            const changedTouch = changedTouches[i];
            const touchID = changedTouch.identifier;
            if (touchID === null) {
                continue;
            }
            const location = this._getLocation(changedTouch, windowSize);
            const touch = touchManager.getOrCreateTouch(touchID, location.x, location.y);
            if (!touch) {
                continue;
            }
            if (eventType === InputEventType.TOUCH_END || eventType === InputEventType.TOUCH_CANCEL) {
                touchManager.releaseTouch(touchID);
            }
            handleTouches.push(touch);
        }
        if (handleTouches.length > 0) {
            const eventTouch = new EventTouch(
                handleTouches,
                false,
                eventType,
                touchManager.getAllTouches(),
            );
            eventTouch.windowId = windowId;
            this._eventTarget.emit(eventType, eventTouch);
        }
    }
`,
  },
  processor: {
    file: 'cocos/scene-graph/node-event-processor.ts',
    names: [
      '_handleEventTouch',
      '_handleTouchStart',
      '_handleTouchMove',
      '_handleTouchEnd',
      '_handleTouchCancel',
    ],
    text: `
public _handleEventTouch (eventTouch: EventTouch): boolean | void {
        try {
            switch (eventTouch.type) {
            case InputEventType.TOUCH_START:
                return this._handleTouchStart(eventTouch);
            case InputEventType.TOUCH_MOVE:
                return this._handleTouchMove(eventTouch);
            case InputEventType.TOUCH_END:
                return this._handleTouchEnd(eventTouch);
            case InputEventType.TOUCH_CANCEL:
                return this._handleTouchCancel(eventTouch);
            default:
                return false;
            }
        } catch (err) {
            this.claimedTouchIdList.length = 0;
            throw err;
        }
    }
private _handleTouchStart (event: EventTouch): boolean {
        const node = this.node;
        const uiTransformComp = node._getUITransformComp();
        if (!node || !uiTransformComp) {
            return false;
        }

        event.getLocation(pos);

        if (uiTransformComp.hitTest(pos, event.windowId)) {
            event.type = NodeEventType.TOUCH_START;
            event.bubbles = true;
            this._dispatchingTouch = event.touch;
            node.dispatchEvent(event);
            return true;
        }

        return false;
    }
private _handleTouchMove (event: EventTouch): boolean {
        const node = this.node;
        if (!node || !node._getUITransformComp()) {
            return false;
        }

        event.type = NodeEventType.TOUCH_MOVE;
        event.bubbles = true;
        this._dispatchingTouch = event.touch;
        node.dispatchEvent(event);
        return true;
    }
private _handleTouchEnd (event: EventTouch): void {
        const node = this.node;
        const uiTransformComp = node._getUITransformComp();
        if (!node || !uiTransformComp) {
            return;
        }

        event.getLocation(pos);

        if (uiTransformComp.hitTest(pos, event.windowId)) {
            event.type = NodeEventType.TOUCH_END;
        } else {
            event.type = NodeEventType.TOUCH_CANCEL;
        }
        event.bubbles = true;
        node.dispatchEvent(event);
        this._dispatchingTouch = null;
    }
private _handleTouchCancel (event: EventTouch): void {
        const node = this.node;
        if (!node || !node._getUITransformComp()) {
            return;
        }

        event.type = NodeEventType.TOUCH_CANCEL;
        event.bubbles = true;
        node.dispatchEvent(event);
        this._dispatchingTouch = null;
    }
`,
  },
};
module.exports = (InputEventType, touchManager, BaseEvent, Vec2) => {
  const ts = require('typescript');
  const pointerEventTypeMap = {
    [InputEventType.MOUSE_DOWN]: InputEventType.TOUCH_START,
    [InputEventType.MOUSE_MOVE]: InputEventType.TOUCH_MOVE,
    [InputEventType.MOUSE_UP]: InputEventType.TOUCH_END,
  };
  const code = ts.transpileModule(
    [
      'class EventTouch extends Event {' + sources.event.text + '}',
      'class Input {' + sources.input.text + '}',
      'class WebSource {' + sources.web.text + '}',
      'class NativeSource {' + sources.native.text + '}',
      'class Processor {' + sources.processor.text + '}',
    ].join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  return new Function(
    'Event',
    'Vec2',
    'InputEventType',
    'NodeEventType',
    'touchManager',
    'pointerEventTypeMap',
    'pos',
    code +
      '; return { EventTouch, simulate: Input.prototype._simulateEventTouch, dispatch: Input.prototype._dispatchEventTouch, web: WebSource.prototype._createCallback, native: NativeSource.prototype._dispatchEvent, processor: Processor.prototype };',
  )(BaseEvent, Vec2, InputEventType, InputEventType, touchManager, pointerEventTypeMap, new Vec2());
};
module.exports.sources = sources;
