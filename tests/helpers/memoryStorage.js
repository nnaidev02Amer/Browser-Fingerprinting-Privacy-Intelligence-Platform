/** In-memory Storage double, with switches to simulate a full or blocked storage. */
export class MemoryStorage {
  constructor(initial = {}) {
    this.data = new Map(Object.entries(initial));
    this.failWrites = null; // set to 'quota' | 'security' to make setItem throw
    this.failReads = false;
  }

  get length() {
    return this.data.size;
  }

  getItem(key) {
    if (this.failReads) throw new DOMException('denied', 'SecurityError');
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    if (this.failWrites === 'quota') throw new DOMException('full', 'QuotaExceededError');
    if (this.failWrites === 'security') throw new DOMException('denied', 'SecurityError');
    this.data.set(key, String(value));
  }

  removeItem(key) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }

  key(i) {
    return [...this.data.keys()][i] ?? null;
  }
}
