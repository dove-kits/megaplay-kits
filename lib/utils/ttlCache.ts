// lib/utils/ttlCache.ts
// Tiny in-memory cache with expiry. Lives for the lifetime of the page
// (cleared on full reload), shared across client-side navigation.

export class TTLCache<V> {
  private store = new Map<string, { value: V; at: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, at: Date.now() });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    Array.from(this.store.keys()).forEach((k) => {
      if (k.startsWith(prefix)) this.store.delete(k);
    });
  }

  clear(): void {
    this.store.clear();
  }
}
