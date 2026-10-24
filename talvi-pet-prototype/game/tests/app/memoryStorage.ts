/** FX-STORAGE (verification §3): an in-memory DOM `Storage`, plus the quota variant whose writes throw. */
export function createMemoryStorage(): Storage & { writes: number } {
  const data = new Map<string, string>();
  const storage = {
    writes: 0,
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) { storage.writes += 1; data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
  };
  return storage;
}

/** FX-STORAGE quota variant: every `setItem` throws a `QuotaExceededError` DOMException. */
export function createQuotaStorage(): Storage & { writes: number } {
  const storage = createMemoryStorage();
  storage.setItem = () => {
    storage.writes += 1;
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  };
  return storage;
}
