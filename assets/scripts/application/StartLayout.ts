/** Native logical-pixel layout: 44px tap targets and compact columns on short screens. */
export function startLayout(width: number, height: number, count: number, title: boolean) {
  const compact =
    height < 560 || (title && count > 6 && height < 650) || (title && count > 7 && height < 710);
  let columns = compact ? (height < 360 && width >= 480 && count > 5 ? 3 : 2) : 1;
  const cardWidth = Math.min(width - 32, columns > 1 ? 620 : 400);
  let buttonHeight = 44;
  const gap = 9;
  // Keep the established layout when it fits. Insets on short landscape phones can
  // remove enough height to require another column. New compact rows allow two
  // 23px label lines (Widgets' normal line height), without shrinking the text.
  if (title && compact) {
    const detailBottom = height / 2 - 116;
    for (let candidate = columns + 1; candidate <= 4; candidate++) {
      const top =
        -height / 2 +
        70 +
        (Math.ceil(count / columns) - 1) * (buttonHeight + gap) +
        buttonHeight / 2;
      if (top <= detailBottom) break;
      const candidateWidth = (cardWidth - 32 - gap * (candidate - 1)) / candidate;
      // Four 19px CJK glyphs plus the label's 12px horizontal padding.
      if (candidateWidth < 88) break;
      columns = candidate;
      buttonHeight = 52;
    }
  }
  const rows = Math.ceil(count / columns);
  const buttonsHeight = rows * buttonHeight + Math.max(0, rows - 1) * gap;
  const cardHeight = Math.min(height - 28, Math.max(330, buttonsHeight + 190));
  const buttonWidth = Math.min(300, (cardWidth - 32 - gap * (columns - 1)) / columns);
  const bottom = title ? -height / 2 + 70 : -cardHeight / 2 + 40;
  const viewportTop = title && compact ? height / 2 - 116 : Infinity;
  const viewportBottom = bottom - buttonHeight / 2;
  const scrollMax =
    title && compact ? Math.max(0, buttonsHeight - (viewportTop - viewportBottom)) : 0;
  return {
    viewportTop,
    viewportBottom,
    scrollMax,
    cardWidth,
    cardHeight,
    headingY: compact
      ? height / 2 - 34
      : title
        ? height / 2 - Math.max(86, height * 0.13)
        : cardHeight / 2 - 40,
    subtitleY: compact
      ? height / 2 - 76
      : title
        ? height / 2 - Math.max(124, height * 0.13 + 42)
        : cardHeight / 2 - 76,
    detailY: compact
      ? height / 2 - (title ? 104 : 112)
      : title
        ? height / 2 - Math.max(162, height * 0.13 + 80)
        : cardHeight / 2 - 123,
    detailHeight: compact ? (title ? 24 : 50) : title ? 48 : 78,
    buttonWidth,
    buttonHeight,
    buttons: Array.from({ length: count }, (_, i) => ({
      x: ((i % columns) - (columns - 1) / 2) * (buttonWidth + gap),
      y: bottom + (rows - 1 - Math.floor(i / columns)) * (buttonHeight + gap) - scrollMax,
    })),
  };
}
