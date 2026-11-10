/** V6-only bounded FIFO. Reads and replacements never refresh insertion order.
 * Keep one live cursor so eviction does not rescan Map's deleted leading entries.
 * Advance only when full: calling next() on an empty Map would exhaust the cursor.
 */
export class V6FifoCache<K, V> {
  private readonly values = new Map<K, V>();
  private readonly oldest = this.values.keys();
  constructor(private readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw Error('Invalid v6 FIFO capacity');
  }
  get size(): number {
    return this.values.size;
  }
  get(key: K): V | undefined {
    return this.values.get(key);
  }
  set(key: K, value: V): void {
    if (!this.values.has(key) && this.values.size >= this.capacity)
      this.values.delete(this.oldest.next().value!);
    this.values.set(key, value);
  }
}
