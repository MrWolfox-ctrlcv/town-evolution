import { Node, Label, UITransform, Graphics, Vec3, Tween, tween } from 'cc';
import { uiNode, label } from './Widgets';
import { color } from './Palette';
/** Persistent high-contrast warnings; routine feedback quietly expires without stealing input. */
export class StatusToast {
  private readonly root: Node;
  private readonly heading: Label;
  private readonly body: Label;
  private readonly mark: Label;
  private message = '';
  private warning = false;
  private expiry = 0;
  private width = 390;
  private height = 844;
  private noticeY = -320;
  constructor(parent: Node) {
    this.root = uiNode('StatusToast', parent);
    this.heading = label(this.root, '', 17);
    this.heading.isBold = true;
    this.heading.color = color('#FFE19A');
    this.body = label(this.root, '', 15);
    this.body.color = color('#FFF9E8');
    this.mark = label(this.root, '!', 25);
    this.mark.isBold = true;
    this.mark.color = color('#493821');
    this.mark.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.mark.node.getComponent(UITransform)!.setContentSize(28, 32);
    this.root.active = false;
  }
  layout(width: number, height: number, noticeY: number): void {
    this.width = width;
    this.height = height;
    this.noticeY = noticeY;
    this.draw();
  }
  render(message: string, noticeY: number): void {
    const changed = message !== this.message;
    this.noticeY = noticeY;
    if (changed) {
      this.message = message;
      this.warning = /不足|耗尽|已满|满仓|未成熟|无法|失败|损坏|备份|未开放|请先取消/.test(message);
      this.expiry = Date.now() + 4500;
      const shortage = message.match(/仓储空间不足：剩(\d+)，收获需(\d+)/);
      this.heading.string = shortage ? '仓储空间不足' : this.warning ? '暂时无法完成' : '';
      this.body.string = shortage
        ? `剩余 ${shortage[1]} 格 / 收获需 ${shortage[2]} 格\n请先出售物品或扩建仓库`
        : message;
      Tween.stopAllByTarget(this.root);
      this.root.setScale(0.94, 0.94, 1);
      tween(this.root)
        .to(0.14, { scale: new Vec3(1.025, 1.025, 1) })
        .to(0.12, { scale: new Vec3(1, 1, 1) })
        .start();
    }
    this.draw();
  }
  private draw(): void {
    this.root.active = !!this.message && (this.warning || Date.now() < this.expiry);
    if (!this.root.active) return;
    const width = Math.min(this.width - 24, 480),
      height = this.warning ? 88 : 42;
    this.root.setPosition(
      0,
      Math.min(this.height / 2 - 52 - height / 2, this.noticeY + height / 2 - 16),
    );
    this.root.getComponent(UITransform)!.setContentSize(width, height);
    const g = this.root.getComponent(Graphics) ?? this.root.addComponent(Graphics);
    g.clear();
    g.fillColor = color(this.warning ? '#493826F5' : '#28463EE6');
    g.roundRect(-width / 2, -height / 2, width, height, 12);
    g.fill();
    if (this.warning) {
      g.lineWidth = 2;
      g.strokeColor = color('#EBC267');
      g.stroke();
      g.fillColor = color('#FFD369');
      g.moveTo(-width / 2 + 30, 18);
      g.lineTo(-width / 2 + 12, -17);
      g.lineTo(-width / 2 + 48, -17);
      g.close();
      g.fill();
    }
    this.heading.node.active = this.warning;
    this.mark.node.active = this.warning;
    this.mark.node.setPosition(-width / 2 + 30, -3);
    this.heading.node.setPosition(24, 25);
    this.heading.node.getComponent(UITransform)!.setContentSize(width - 80, 24);
    this.body.node.setPosition(this.warning ? 24 : 0, this.warning ? -10 : 0);
    this.body.node
      .getComponent(UITransform)!
      .setContentSize(width - (this.warning ? 80 : 24), this.warning ? 44 : 32);
    this.body.horizontalAlign = this.warning
      ? Label.HorizontalAlign.LEFT
      : Label.HorizontalAlign.CENTER;
  }
  dispose(): void {
    Tween.stopAllByTarget(this.root);
    this.root.destroy();
  }
}
