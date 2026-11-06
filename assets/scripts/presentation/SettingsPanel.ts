import { Node, Label, UITransform, EventTouch, input, Input, EventKeyboard, KeyCode } from 'cc';
import type { StartMenuData, MenuAction } from '../application/StartMenu';
import type { GameStart } from '../application/GameStart';
import { settingsLayout } from '../application/SettingsLayout';
import { uiNode, label, consumeTouches, ActionButton } from './Widgets';
import { SettingsArtwork } from './SettingsArtwork';
import { color } from './Palette';
import { hasMultipleContacts } from './InputProvenance';
const READ_ONLY_ACTIONS = new Set([
  'saves',
  'guide',
  'exit',
  'back',
  'cancel',
  'profile',
  'slot-1',
  'slot-2',
  'slot-3',
]);
/** The illustrated shell is assembled from image pieces; every label and action remains native. */
export class SettingsPanel {
  readonly root: Node;
  private readonly art = new SettingsArtwork();
  private readonly panel: Node;
  private readonly heading: Label;
  private readonly subtitle: Label;
  private readonly detail: Label;
  private readonly close: ActionButton;
  private readonly buttons: ActionButton[] = [];
  private readonly cancelMultiTouch = (event: EventTouch) => {
    if (hasMultipleContacts(event, input)) this.cancelGestures();
  };
  private readonly onKey = (event: EventKeyboard) => {
    if (event.keyCode === KeyCode.ESCAPE && this.root.activeInHierarchy) this.dismiss();
  };
  constructor(
    parent: Node,
    private readonly flow: GameStart,
    private readonly changed: () => void,
  ) {
    this.root = uiNode('IllustratedSettings', parent);
    this.root.active = false;
    consumeTouches(this.root);
    this.root.on(Node.EventType.TOUCH_START, this.cancelMultiTouch, this, true);
    this.panel = uiNode('WoodenMenuFrame', this.root);
    this.heading = this.text(29);
    this.subtitle = this.text(13);
    this.detail = this.text(14);
    this.close = new ActionButton(this.root, (text) => this.explain(text), undefined, this.art);
    this.close.node.name = 'Menu-close';
    this.close.set({ text: '关闭菜单', run: () => this.dismiss() });
    input.on(Input.EventType.KEY_DOWN, this.onKey);
  }
  private text(size: number): Label {
    const value = label(this.root, '', size);
    value.horizontalAlign = Label.HorizontalAlign.CENTER;
    value.color = color('#3C4A28');
    return value;
  }
  private explain(text: string): void {
    this.flow.message = text === this.flow.storageWarning ? '' : text;
    this.changed();
  }
  private dismiss(): void {
    this.cancelGestures();
    this.flow.back();
    this.changed();
  }
  render(data: StartMenuData, width: number, height: number): void {
    this.root.active = true;
    this.root.getComponent(UITransform)!.setContentSize(width, height);
    const layout = settingsLayout(width, height, data.actions.length);
    this.art.bind(this.panel, 'panel', layout.cardWidth, layout.cardHeight);
    this.heading.string = data.title;
    this.subtitle.string = data.subtitle;
    const notice =
      this.flow.storageWarning ||
      this.flow.message ||
      (this.flow.session?.hasUnsavedChanges ? this.flow.session.statusMessage : '');
    this.detail.string =
      notice && this.flow.page !== 'confirm'
        ? notice
        : [data.detail, notice].filter(Boolean).join('\n');
    this.detail.color = color(notice ? '#8A3928' : '#58613E');
    for (const [value, y, h] of [
      [this.heading, layout.headingY, 40],
      [this.subtitle, layout.subtitleY, 24],
      [this.detail, layout.detailY, layout.detailHeight],
    ] as const) {
      value.node.setPosition(0, y);
      value.node.getComponent(UITransform)!.setContentSize(layout.cardWidth - 78, h);
    }
    this.close.layout(layout.closeX, layout.closeY, 44, { height: 44, iconOnly: true });
    data.actions.forEach((action, index) => {
      const button =
        this.buttons[index] ??
        new ActionButton(this.root, (text) => this.explain(text), undefined, this.art);
      this.buttons[index] = button;
      button.node.name = `Menu-${action.id}`;
      button.cancelGesture();
      button.set(this.guarded(action));
      button.layout(layout.buttons[index].x, layout.buttons[index].y, layout.buttonWidth, {
        height: layout.buttonHeight,
        fontSize: 16,
      });
    });
    this.buttons.slice(data.actions.length).forEach((button) => button.set(null));
  }
  progress(text: string): void {
    this.detail.string = text;
  }
  private guarded(action: MenuAction): MenuAction {
    const blocked = this.flow.storageWarning && !READ_ONLY_ACTIONS.has(action.id);
    return {
      ...action,
      ...(blocked ? { enabled: false, reason: this.flow.storageWarning } : {}),
      run: () => {
        action.run();
        this.changed();
      },
    };
  }
  hide(): void {
    this.cancelGestures();
    this.root.active = false;
  }
  cancelGestures(): void {
    this.close.cancelGesture();
    this.buttons.forEach((button) => button.cancelGesture());
  }
  dispose(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKey);
    this.root.off(Node.EventType.TOUCH_START, this.cancelMultiTouch, this, true);
    this.cancelGestures();
    this.art.dispose();
    this.root.destroy();
  }
}
