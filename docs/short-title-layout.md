# Short landscape title safe-area layout

## Reproduction

At source baseline `3dac3c7`, the eight-action title grid uses three rows in
520×296 and 480×299 logical-pixel safe rectangles. The highest button overlaps
the detail label by 18px and 15px respectively. The uninset 568×320 case still
has a 6px gap, so checking the full viewport alone misses this defect.

## Change

Preserve the established layout if the highest button does not overlap the
compact title detail. On collision, try additional columns, up to four, only
when each button retains at least 88px width. Added-column layouts use 52px
buttons: the existing label's 23px line height fits twice inside its 46px
content height. Fonts, text, action order, footer and title positions remain
unchanged. The 88px minimum allows four 19px CJK glyphs per line plus the
existing 12px horizontal padding, including the longer seven-glyph recovery
label across two lines. No action is removed.

The reported rectangles now use four columns and two rows, leaving 23px and
26px between detail and buttons. Existing fitting portrait/desktop layouts,
the uninset 568×320 title, and non-title layouts retain their prior dimensions.
StartScreen and full-canvas artwork/world geometry are unchanged.

## Boundaries and verification

- Eight actions at width 480: height 314 retains three columns; 313 switches.
- Four columns fit starting at width 443 with the existing margins/gaps.
- Height 273 is the zero-gap lower boundary for the new two-row title layout.
- Below these physical limits this change does not promise a fitting layout:
  it will not force narrower labels or smaller fonts to manufacture a pass.
- `tests/title-safe-layout.test.cjs` checks these boundaries and production
  StartScreen node layout for both reported inset rectangles, repeated render,
  all eight action identities/text/handlers, button/text separation, safe bounds,
  two-line label capacity, and full-size artwork/canvas.
- The test reuses the existing narrow scene fixture; it does not verify font
  rasterization, actual device safe-area reports, WebGL, Android, or screenshots.

Focused verification: domain build, Cocos typecheck, formatting for changed
files, `title-safe-layout.test.cjs` and `safe-controls-ui.test.cjs`. The full
long-running suite and native/browser builds are deliberately outside this task.
