# Title and local saves

The Cocos scene now opens on a title screen instead of loading a demonstration immediately.
The title offers Start / Continue, a separate playable demonstration, Saves, the existing
recipe handbook, and Exit. Its background is the actual Cocos-rendered demo island,
using the same TownView, terrain, buildings, crops and ground models as gameplay.
It is not a screenshot, generated illustration or a different renderer.

## Read-only live title island

- The background creates its own immutable copy of the playable demo template. It never
  opens a GameSession, reads the saved demo, advances production/shipments or writes storage.
- Camera drift and crop wind are live. Crop growth uses a fixed display clock so the title
  keeps showing the template's seedling, growing and ripe stages even after a long wait.
- Native menu controls overlay the 3D camera. The title has no map gesture or tool controller.
- Meshes are built once, not per frame. Camera animation is capped at 30 updates per second.
  Entering gameplay disposes the entire title island and camera; returning creates a fresh one.
  Hidden/background pages follow Cocos's ordinary engine suspension.
- Missing/denied/busy Web Locks still allow the title scene and read-only menu to render.
  Actual gameplay and writes remain protected by the existing exclusive storage adapter.
- The old concept PNG remains in the user's files but is never loaded by the title renderer
  or copied into newly built standalone previews.

## Saving and recovery

- Opening the title or browsing saves does not create a new town or write game data.
- Start continues the existing normal town when present. New normal towns are created
  only after the player chooses Start. The demonstration uses its existing separate key space.
- Each town has automatic saves, the previous automatic backup, and three manual save slots.
  A manual slot is not changed by autosaves or a new game.
- A 56×44 logical-pixel Settings button sits at the top right, clear of resource counters.
  It offers Save Now, Save Management, Restart / Reset Demo, Return to Title and Return to Game.
  No unsupported audio options are shown. Drag, extra-finger, resize and suspension input
  cancel the launcher tap; settings hit-testing also blocks map drops through the button.
- The save manager is available from Settings and the in-game Tools panel. Its Back action
  returns to Settings when opened there, including after visiting a manual slot.
  The demo reset is explicitly labeled “重置演示岛…”. Loading a manual slot,
  overwriting one, adopting an automatic backup, and starting over require confirmation.
- Unreadable and unsupported saves remain untouched on inspection. A corrupt primary with
  a readable backup opens recovery instead of silently rolling back. A newer-version primary
  is not silently replaced by an older backup.
- Before a manual slot is overwritten, its previous raw payload is copied to that slot's
  `.before-overwrite` key. Reset and manual load preserve the replaced primary in
  `.before-reset`; backup adoption preserves the unreadable primary in `.unreadable`.
  These archival keys retain the most recent replacement, not an unlimited version history.
- A failed save blocks exit, profile switch and loading another town. The live session remains
  in memory and the warning remains visible. A failed archival write does not overwrite its source.
- The browser entry point acquires a Web Locks exclusive writer lock before enabling game
  writes. One page holds it for the entire page lifetime, including hidden/background periods.
  All normal/demo saves, backups, resets, manual slots and preferences use the same guarded
  storage adapter. Waiting pages are read-only and cannot begin gameplay or overwrite slots.
  Closing the owner lets the next page acquire ownership; the old adapter is revoked first.
- If Web Locks is unavailable or denied, writes fail closed with a visible explanation. There
  is no unlocked fallback. This web-preview implementation needs a secure context with Web
  Locks; a native persistence/locking adapter has not been implemented. Old game tabs loaded
  before this version should be closed or reloaded; they do not participate in its lock.
- Each session retains the exact primary bytes it read or successfully wrote. Before any
  autosave, backup, recovery or reset write, optimistic checks reject a different stored version.
  This detects same-millisecond changes too. A stale tab freezes writes and further commands,
  keeps its in-memory town, and does not rotate the automatic backup.
- The save manager lets a conflicting page preserve its town in an empty manual slot and then
  explicitly read the other page’s latest automatic progress. Manual-slot replacement and load
  confirmations also check the exact slot offered, so a newer slot is not silently substituted.
- Exit inside the game saves and returns to the title. Exit on the title explains that the
  player can close the browser tab. The game never claims it can close the browser.

Saves remain local to the current browser/device and site origin. They are not cloud saves.
Clearing site data, private browsing cleanup or changing site origin can make them unavailable.
Do not describe this implementation as cross-device sync or file export/import.

## Verification

`tests/settings-menu.test.cjs` covers read-only settings navigation, nested back paths,
confirmed/canceled demo resets, manual/normal save isolation, failed saves, stale-save
protection, and resource clearance with 44px touch targets. `settings-interactions.cjs`
is wired into browser capture for real mouse/touch navigation and interrupted gestures.
It is prepared for a graphics-capable environment, not claimed as a runtime pass.

`tests/game-start.test.cjs` covers title reads, re-entry, confirmation cancellation,
normal/demo isolation, manual slot overwrite/load, malformed data, storage denial,
failed writes, retained live sessions, and 44px touch targets for phone and landscape layouts.
Existing storage, session and profile tests also remain required. `save-concurrency.test.cjs`
adds two-session same-time writes, repeated hide/show, blocked exits, stale resets/recovery,
confirmation-window changes, manual-slot conflicts, and explicit conflict resolution. These
cover optimistic stale-state checks. `exclusive-game-storage.test.cjs` models FIFO Web Locks
exclusion and repeats final-check/write interleavings for autosave, reset and manual slots,
plus ownership transfer, unavailable locks and the guarded Cocos entry point. These are
deterministic adapter tests, not an actual two-browser-tab runtime pass or cloud sync.

`capture.cjs`, `demo-interactions.cjs` and `ui-driver.cjs` have been updated for the title
and native save menus. They require a graphics-capable browser; source checks do not
establish a rendered interaction pass. `title-interactions.cjs` additionally covers real
camera/crop motion, immutable growth, menu back/close, a lock-waiting second tab, repeated
start/exit/cancel and disposal of the background during gameplay. It uses isolated browser
storage and real pointer input. All labels and interactive controls are real Cocos nodes.

For the 2026-11-05 live-title change, official Cocos type checks, focused unit tests and a
standalone 3.8.8 engine build passed. The sandboxed local Chromium launch fails before
rendering with `socket() failed: Operation not permitted`; browser interaction, visual
acceptance and device performance are not claimed. No sandbox bypass was attempted.
