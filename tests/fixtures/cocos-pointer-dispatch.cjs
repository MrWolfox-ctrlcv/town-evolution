/** Exact Cocos Creator 3.8.8 PointerEventDispatcher dispatchEventTouch body.
 * Source: cocos/2d/event/pointer-event-dispatcher.ts, revision
 * 411f98df047c25902f93440d4b22925c2fb65461 (MIT; see the notice below).
 * Extracted from the real unminified engine build, not a rewritten event algorithm.
 * Scene nodes/hit tests and event construction are supplied by the test harness.
 * SHA256 of the extracted function before formatting: e02663971a94a91b419f29352491bd4a0383fe2f97f9ca6ba9c9d712c45ae292
 */
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
module.exports = (InputEventType, removeAt, EventTouch) =>
  function dispatchEventTouch(eventTouch) {
    this._inDispatchCount++;
    this._sortPointerEventProcessorList();
    var pointerEventProcessorList = this._pointerEventProcessorList;
    var length = pointerEventProcessorList.length;
    var touch = eventTouch.touch;
    var dispatchToNextEventDispatcher = true;
    for (var i = 0; i < length; ++i) {
      var pointerEventProcessor = pointerEventProcessorList[i];
      if (pointerEventProcessor.isEnabled && pointerEventProcessor.shouldHandleEventTouch) {
        if (eventTouch.type === InputEventType.TOUCH_START) {
          if (pointerEventProcessor._handleEventTouch(eventTouch)) {
            if (pointerEventProcessor.isEnabled) {
              pointerEventProcessor.claimedTouchIdList.push(touch.getID());
            } else {
              var cancelEvent = new EventTouch(
                [eventTouch.touch],
                true,
                InputEventType.TOUCH_CANCEL,
              );
              cancelEvent.touch = eventTouch.touch;
              pointerEventProcessor.dispatchEvent(cancelEvent);
              pointerEventProcessor.claimedTouchIdList.length = 0;
            }
            dispatchToNextEventDispatcher = false;
            if (!eventTouch.preventSwallow) {
              break;
            } else {
              eventTouch.preventSwallow = false;
            }
          }
        } else if (pointerEventProcessor.claimedTouchIdList.length > 0) {
          var index = pointerEventProcessor.claimedTouchIdList.indexOf(touch.getID());
          if (index !== -1) {
            pointerEventProcessor._handleEventTouch(eventTouch);
            if (
              eventTouch.type === InputEventType.TOUCH_END ||
              eventTouch.type === InputEventType.TOUCH_CANCEL
            ) {
              removeAt(pointerEventProcessor.claimedTouchIdList, index);
              if (!eventTouch.preventSwallow) {
                this._removeClaimedTouch(i + 1, touch.getID());
              }
            }
            dispatchToNextEventDispatcher = false;
            if (!eventTouch.preventSwallow) {
              break;
            } else {
              eventTouch.preventSwallow = false;
            }
          }
        }
      }
    }
    if (--this._inDispatchCount <= 0) {
      this._updatePointerEventProcessorList();
    }
    return dispatchToNextEventDispatcher;
  };
