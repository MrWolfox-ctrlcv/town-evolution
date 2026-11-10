# Phone safe-area support

## Confirmed defect

The HUD and start/settings UI previously used the whole canvas as their control frame. On a 390 × 844 logical canvas with a 59-unit top inset and 34-unit bottom inset, the original settings button extended to y = 838, while the safe top is y = 785. Its hitbox overlapped the unsafe strip by 53 units. `docs/verification.md` already tracked automatic native insets as missing.

## Implementation

- `SafeViewport` samples the official Cocos 3.8.8 `sys.getSafeAreaRect(false)` after design resolution setup. That result is already in UI units; it is not divided by DPR again.
- Web uses CSS `env(safe-area-inset-*)`, intersects the layout viewport, visual viewport and actual canvas rectangle, then converts all four corners through Cocos's public view conversion and viewport scale. An embedded canvas does not inherit unrelated device-edge padding. The preview shell opts into `viewport-fit=cover` and also supplies the CSS custom properties read by Cocos.
- `SafeControls` provides a translated, inset UI frame. Canvas, map input, world camera and title artwork keep their full dimensions. An explicitly empty safe area hides controls and prevents map actions.
- The HUD, title, settings, handbook, navigation and tool controls use the safe frame. Tool drag ghosts and release bounds, radial anchors and radial obstacles use that same coordinate space. World handlers retain original physical event coordinates. Collection animations remain canvas-parented and resolve target world positions normally.
- Full-canvas capture remains active for tool/handbook gestures. Start-screen full-canvas multi-touch cancellation also covers excluded margins, so a second finger there cannot leave a pressed title/settings/confirmation button armed.
- Browser resize, scroll, orientation, visual viewport and canvas resize changes trigger coalesced layout. All added listeners and the observer are released on destruction; the CSS probe is removed after each sample.

## Focused validation

The new tests exercise production presentation source with narrow scene/input collaborators, plus official Cocos declarations. They are not screenshots, WebGL rendering, Creator import, or physical device tests.

- `safe-viewport.test.cjs`: native asymmetric rectangles, embedded/offset canvases, CSS and visual viewport intersection, viewport origin/scales, capped DPR, forced orientation, independent screen/canvas dimensions, invalid measurements, zero safe area and subscription cleanup.
- `safe-controls-ui.test.cjs`: actual HUD and start/settings constructors/layouts at portrait DPR 3, asymmetric landscape and desktop; full map/artwork dimensions; unsafe-margin blocking; rotation and hidden controls; title/settings multi-touch cancellation and disposal.
- `safe-control-input.test.cjs`: actual tool/handbook/radial code, translated ghost location, four release boundaries, original physical point identity, full-canvas capture and listener release, scaled/offset radial projection, and real StartScreen/RecipeHandbook two-finger paper scaling without cancellation.
- Related existing summary-occlusion, map-contact, handbook, radial, crop-purchase, collection and tray-return tests cover unchanged input contracts and save behavior.

## Remaining device acceptance

- Verify native notch, system-navigation insets and orientation changes on actual Android/iOS builds.
- Verify browser safe-area behavior and visual viewport movement in actual mobile WebGL rendering. These paths were not available in this source-validation task.
- Cocos 3.8.8's deprecated public view conversion uses `screen.windowSize.width` during forced rotation; web touch input uses its canvas rectangle height. Extra application CSS scaling can make those paths differ. The bundled preview has no such additional transform. Arbitrary CSS scale/rotation beyond Cocos's own frame rotation is not certified.
- The existing menus retain their normal minimum tap/layout sizes. Extremely small keyboard-clipped or embedded viewports can still be too small to display a complete menu; this change does not add a new scrollable-menu design.

No domain, economy, terrain geometry, storage format or Android storage-lock code changes are included. No preview deployment or device success is claimed.
