import { input } from 'cc';
import type { EventTouch } from 'cc';
import { TapGesture } from '../application/TapGesture';
import { hasMultipleContacts, inputOwner } from './InputProvenance';

/** A numeric Cocos touch ID is not enough to own a tap across devices/buttons. */
export class InputTapGesture {
  private readonly gesture = new TapGesture();
  private id: number | null = null;
  private owner: string | null = null;
  begin(event: EventTouch): boolean {
    if (hasMultipleContacts(event, input)) {
      this.cancel();
      return false;
    }
    const id = event.getID() ?? 0;
    if (this.id === id && this.owner !== inputOwner(event)) this.cancel();
    if (!this.gesture.begin(id, event.getUILocation())) return false;
    this.id = id;
    this.owner = inputOwner(event);
    return true;
  }
  move(event: EventTouch): boolean {
    return this.accepts(event) && this.gesture.move(this.id!, event.getUILocation());
  }
  end(event: EventTouch): boolean {
    if (!this.accepts(event)) return false;
    const tap = this.gesture.end(this.id!, event.getUILocation());
    this.cancel();
    return tap;
  }
  cancel(event?: EventTouch): void {
    if (event && this.id !== (event.getID() ?? 0)) return;
    this.gesture.cancel();
    this.id = this.owner = null;
  }
  private accepts(event: EventTouch): boolean {
    if (this.id === null || this.id !== (event.getID() ?? 0)) return false;
    if (this.owner === inputOwner(event)) return true;
    this.cancel();
    return false;
  }
}
