/** Image-backed menus keep readable text and 44px targets on portrait and landscape phones. */
export function settingsLayout(width: number, height: number, count: number) {
  const compact = height < 560;
  const columns = compact && width >= 480 ? (height < 360 && count >= 6 ? 3 : 2) : 1;
  const rows = Math.ceil(count / columns);
  const dense = compact || 196 + rows * 58 > height - 24;
  const gap = dense ? 6 : 10;
  const buttonHeight = dense ? 44 : 48;
  const cardWidth = Math.min(width - 24, columns > 1 ? 700 : 428);
  const cardHeight = Math.min(height - 24, 196 + rows * (buttonHeight + gap));
  const buttonWidth = Math.min(326, (cardWidth - 56 - (columns - 1) * gap) / columns);
  const firstButtonY = -cardHeight / 2 + 30 + buttonHeight / 2 + (rows - 1) * (buttonHeight + gap);
  const headingY = cardHeight / 2 - (dense ? 27 : 38);
  const subtitleY = headingY - (dense ? 25 : 31);
  const detailTop = subtitleY - 14;
  const detailBottom = firstButtonY + buttonHeight / 2 + 9;
  return {
    cardWidth,
    cardHeight,
    headingY,
    subtitleY,
    detailY: (detailTop + detailBottom) / 2,
    detailHeight: Math.max(20, detailTop - detailBottom),
    buttonWidth,
    buttonHeight,
    closeX: cardWidth / 2 - 34,
    closeY: cardHeight / 2 - 34,
    buttons: Array.from({ length: count }, (_, i) => ({
      x: ((i % columns) - (columns - 1) / 2) * (buttonWidth + gap),
      y: firstButtonY - Math.floor(i / columns) * (buttonHeight + gap),
    })),
  };
}
