# Small physical targets on touchscreens

Object selection, long-press candidates and object tools retain real mesh picking.
Mouse-derived events remain single-ray exact. Cocos 3.8.8 leaves
`EventTouch.simulate` false even in `_simulateEventTouch`, so that flag and numeric
pointer IDs are not device evidence. The adapter temporarily marks events at the
engine's trusted `_touchInput._eventTarget.emit` boundary. Mouse ownership is
captured at `_mouseInput._eventTarget.emit`, including its actual button. Both
web and native routes dispatch synchronously from those boundaries. Missing,
changed or non-writable adapters remain exact; no DOM/device sniffing or ID guess
can grant tolerance. Source wrappers are reference-counted and restored on dispose.

Map, tray, buttons, paging and handbook gestures retain their starting source and
mouse button. Foreign moves/releases cancel rather than complete a gesture, even
when a real finger and mouse both use ID 0 or an unrelated mouseup originates
outside the canvas. Mixed sources and multiple mouse buttons are cancelled;
two real fingers can still pinch. Capture cleanup discards orphan map gestures
when Cocos routes an aliased release to another target. Hide/blur clears observed
source contacts, and fresh gestures ignore stale engine-manager contacts. The
browser guard also cancels partially lost button presses before Cocos sees them.

Release coordinates also participate in the twelve-logical-pixel tap threshold.
A platform may deliver a final position without an intervening MOVE; buttons,
paging and pending map gestures reject such displaced releases. A pending map
gesture cannot become a new long-press drop merely because its END arrived late.
Already-established long-press dragging and real two-finger pinch are unchanged.
The actual Cocos node processor may relabel an outside-target END as CANCEL while
retaining its original event code. Map releases over screen-interior sidebars still
allow pile recovery, but releases outside the full screen cancel. A tray release
also checks logical screen bounds before handing off to farming, so it cannot
interpolate a final off-screen release into unintended planting or harvesting.
Cells already completed during an actual MOVE stay committed. Button
CANCEL never confirms an action. Menu tests use the production SettingsPanel,
ActionButton and GameStart with the real Cocos node-processor/dispatch methods:
displaced releases leave save bytes, write counts, sessions and confirmations intact;
fresh deliberate taps still save, restore, reset or exit exactly once. These are
source-level integration checks, not browser/GPU or physical-touchscreen evidence.

For a finger, an exact center-ray hit on any object wins immediately, even when
that object cannot be used by the current tool. If the center misses all objects,
the picker checks up to 28 exact neighboring rays on a two-logical-pixel lattice
inside a six-logical-pixel radius. Coordinates use the engine DPR once. Samples
outside the map viewport or over covered HUD regions are rejected. The first
screen-distance group containing a hit wins, then actual ray depth and stable
object ID resolve ties. This is finite sampling of nearby real surfaces, not an
inflated world-space object, cell hitbox, or continuous-distance silhouette solver.

Each contact first projects the current mesh bounds to discard distant models.
Natural-resource candidates share the same immutable rendered geometry. Bounds
only reject candidates: neighboring rays still intersect actual front-facing
triangles, including current transforms. Buildings, piles, trees and natural
surfaces all participate in occlusion. The shared result is cached only for that
input ray; a later input callback gets a new ray. Scene sync and lifting clear
the cache. Ground projection and placement coordinates are not snapped.

Tests cover single lettuce/tree-seed piles at 390-pixel portrait projection,
DPR 1/2/3, alternate directions, exact and neighboring foreground blockers,
hidden/lifted models, triangle air, viewport/HUD boundaries, stable ties and the
28-sample upper bound. Input tests cover real finger ID 0, arbitrary numeric
IDs, unknown provenance, same-ID source collisions, mouse-button ownership,
foreign releases, hidden controls, cancellation, hide/blur and recovery.
Vendored official source members are compared byte-for-byte with the available
pinned Cocos checkout. Actual `_simulateEventTouch`, web/native touch-source,
pointer-dispatch and node-processor methods feed a production tray/router/saw/
mesh/session/save test: mouse `simulate=false` issues no command or storage write
at the nearby blank point, while trusted finger ID 0 crafts once. Restoring only
the rejected `simulate === false` classifier makes this same test fail. The
long-press candidate uses the same mesh target.

The CPU stress fixture contains 192 trees and 1,329 natural surfaces. Its near-pile
query performs one full center pass, then checks only one nearby pile model;
all later category queries for that ray reuse the result. Tests assert candidate
and mesh-query bounds and no repeated mesh-data reads. Timing diagnostics are
container CPU observations, not rendering or physical-device performance.

This does not prove Cocos GPU output or comfortable finger targeting on hardware.
At extreme zoom-out, geometry narrower than the two-pixel sample spacing can
still be missed; users can zoom in. Actual-device touch tuning remains unverified.
