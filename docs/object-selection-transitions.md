# Exclusive object selection

## Reproduced regression

Select a ground wood pile, then long-press and release a shop building. Before this fix, `BuildingDrag.drop` replaced only the selected building ID. The old pile coordinate remained selected too. Object anchoring preferred the building, while the action and description providers preferred the pile. The shop's radial menu therefore showed the old pile's pickup controls, and clicking them picked up the old pile.

The deterministic demonstration fixture reproduces a shop selection of `b3` while showing `木材 · 4/6` and dispatching `pickupStack` for `(7, 9)`.

## Selection contract

- Every selection change replaces all three object fields atomically through `setObjectSelection`. At most one building, pile, or natural resource is selected.
- A committed tap or drag focuses the chosen object in the manage context, closing unrelated crop/tool purchase controls and resetting contextual pagination.
- Building merges select the retained building; stack moves and merges select the destination pile. Recovery, sale, or other consumed-pile drops clear the selection.
- A cancelled or rejected drag leaves the previous selection and saved town untouched. Explicit Cancel, tab changes, and a confirmed town reset clear all object fields together.
- Selection helpers never change inventory, currency, buildings, production, or storage.

## Verification

The new regression test executes production `BuildingDrag`, `StackDrag`, `HudActions`, `HudDescription`, `TownHUD.render`, `RadialActions`, `ActionButton`, and `GameSession` with narrow Cocos scene collaborators. The original regression suite failed four tests before the fix and passed afterward. It covers selected-object transitions, captured old button cancellation, interrupted/rejected drags, house/crate and farm merges, ordinary HUD versus radial routing, recovery, and save round trips.

Six additional independent-review cases are permanent in `tests/object-selection-resilience.test.cjs`, sharing `tests/helpers/selection-fixture.cjs` with the transition suite:

1. Real `ObjectDrag` building/pile dispatch ignores foreign release IDs while retaining the active lift.
2. Ordinary HUD refreshes preserve a still-current pressed radial button, which commits only once.
3. Switching a lifted session into corrupt/recovered mode rejects release without changing selection, state, or storage. This deliberately simulates the mode transition; real corrupt-save loading is covered separately by session tests.
4. Quota failure during a genuinely changed building/pile move commits the in-memory action and new selection, preserves the old saved bytes, and retains the unsaved warning until a successful retry. A no-op move would not test this because identical saves skip writes.
5. A competing session's newer save is detected before release can change the stale session's state or selection.
6. Production `MapGesture` through `ObjectDrag` cancels a lift when a second finger joins, then accepts a fresh single-finger long press and commits a real move exactly once.

This establishes CPU-side input/control and persistence behavior, not Cocos event bubbling/capture, real screen-ray generation, WebGL, browser presentation, or mobile-device acceptance.
