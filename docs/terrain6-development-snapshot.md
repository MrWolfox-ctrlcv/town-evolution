# Terrain 6 development snapshot

Status: **work in progress, not a completed or released terrain experience**.

This snapshot was frozen on 2026-11-06 at 09:01 UTC, on top of GitHub main
`fd7ed12ffbf049922a226a0307cedb8831582b70`. It preserves the v5 cross-runtime CI
fix and contains the current terrain 6 domain, save/material/edit rules,
application integration, surface rendering, controls, and compatibility tests.
Independent sibling lab experiments and generated build directories are excluded.

Known unfinished work at this exact snapshot:

- The far-tree visibility callback is not yet connected in TownView; fallback
  behavior can leave distant trees invisible.
- The final BuildingGroundReady and TownFarmPicking additions were saved but had
  not yet been compiled or tested when the snapshot was frozen.
- Terrain 6 bridge construction remains behind its safety gate. The independent
  piled-bridge prototype is not part of this production source snapshot.
- Final terrain 6 integration, whole-project acceptance, real Cocos visuals,
  device behavior, and performance validation are not complete.

The successful CI on `fd7ed12` applies to the previous source, not this snapshot.
The new commit's GitHub Actions result must be checked separately. A source CI
pass alone does not prove a Cocos build, visual acceptance, or device performance.
Work continued after freezing; later edits are not included in this snapshot.
