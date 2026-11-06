/** Native logical-pixel layout: 44px tap targets and compact columns on short screens. */
export function startLayout(width: number, height: number, count: number, title: boolean) {
  const compact = height < 560 || (title && count > 6 && height < 650);
  const columns = compact ? (height < 360 && width >= 480 && count > 5 ? 3 : 2) : 1;
  const rows = Math.ceil(count / columns);
  const cardWidth = Math.min(width - 32, columns > 1 ? 620 : 400);
  const buttonHeight = 44;
  const gap = 9;
  const buttonsHeight = rows * buttonHeight + Math.max(0, rows - 1) * gap;
  const cardHeight = Math.min(height - 28, Math.max(330, buttonsHeight + 190));
  const buttonWidth = Math.min(300, (cardWidth - 32 - gap * (columns - 1)) / columns);
  const bottom = title ? -height / 2 + 70 : -cardHeight / 2 + 40;
  return {
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
      y: bottom + (rows - 1 - Math.floor(i / columns)) * (buttonHeight + gap),
    })),
  };
}
