import { LabelOutline, UITransform } from 'cc';
import type { Label } from 'cc';
import type { startLayout } from '../application/StartLayout';
import type { ActionButton } from './Widgets';
import { color } from './Palette';
/** Title geometry stays independent of navigation and input ownership. */
export function layoutTitleButtons(
  buttons: readonly ActionButton[],
  layout: ReturnType<typeof startLayout>,
  offset: number,
): void {
  buttons.forEach((button, i) => {
    const position = layout.buttons[i];
    if (!position) {
      button.node.active = false;
      return;
    }
    const y = position.y + offset;
    // Only whole targets render or receive input. No clipped half-button can launch a world.
    const visible =
      !layout.scrollMax ||
      (y - layout.buttonHeight / 2 >= layout.viewportBottom - 1e-7 &&
        y + layout.buttonHeight / 2 <= layout.viewportTop + 1e-7);
    button.layout(position.x, y, layout.buttonWidth, {
      height: layout.buttonHeight,
      fontSize: i === 0 ? 19 : 16,
    });
    button.node.active = visible;
  });
}
export function layoutTitleText(
  entries: readonly (readonly [Label, number, number])[],
  width: number,
): void {
  for (const [text, y, h] of entries) {
    text.node.setPosition(0, y);
    text.node.getComponent(UITransform)!.setContentSize(width - 40, h);
    text.color = color('#214F45');
    if (!text.node.getComponent(LabelOutline)) {
      const outline = text.node.addComponent(LabelOutline);
      outline.color = color('#FFF6DD');
      outline.width = 2;
    }
  }
}
