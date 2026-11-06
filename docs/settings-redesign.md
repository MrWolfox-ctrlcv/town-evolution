# Illustrated settings and navigation

The top-right launcher now reuses the exact `tools` toolbox region from the existing
`assets/resources/handbook/actions.png` atlas. It has no visible “设置” text and keeps
a 56 × 44 logical-pixel hit area. The bottom navigation retains only **订单**;
**经营** and **工具** are removed as navigation entries.

## Reachability

- Settings: top-right toolbox → save now, save manager, town affairs, reset, exit to title, return.
- Town affairs: settings → **小镇事务** → crop purchases, tree planting, profile switch,
  save manager and exit. Tool supply remains conditional on finite durability.
- Orders: the retained bottom order entry, or selecting an order board.
- Trade, shipping and building actions: select the corresponding object. Its contextual
  controls are provided by the object menu rather than a bottom “经营” tab.
- Save failures direct the player to the top-right settings, rather than the removed tool tab.

The new route does not modify game state or storage merely by opening it. A one-shot
application request is consumed after the live session resumes. A write-lock warning
blocks the town-affairs transition. Existing save-conflict, corrupt-save preservation,
explicit reset/overwrite confirmations and successful-save-before-exit checks remain.

## Image source and assembly

`assets/resources/ui/settings.png` is an ImageGen-produced 1536 × 1024 RGBA atlas.
The image contains a wooden frame with cream paper, green/paper/red blank buttons,
and a separate wooden close button. Transparent exterior pixels were inspected over
a cyan background. SettingsArtwork selects fixed SpriteFrame rectangles and uses native
nine-slice rendering; corner borders are scaled uniformly, while the central paper or
button fill stretches. No vector-painted frame or button substitutes are used.

Settings, save pages and confirmation pages share this image shell. Text is rendered as
native Cocos labels, and buttons retain the shared tap gesture gate. Button hit areas
are at least 44 logical pixels, with responsive columns on short landscape displays.
The X and Escape both use the same safe Back/Cancel path. Multi-touch interruptions,
layout changes and suspended menus cancel pending button gestures.

## Verification scope

Source validation covers real Cocos 3.8.8 API typing, asset metadata, module layering,
responsive geometry, navigation and preservation of saves. The preview copies the
new atlas, and its input driver finds the icon-only launcher by its active native node
rather than looking for a visible “设置” text label. Earlier tool-entry calls now go
through the real settings → town-affairs route.

These checks are not a Creator import, GPU/browser pixel review, Android export or
physical-device acceptance. No such verification is claimed here.
