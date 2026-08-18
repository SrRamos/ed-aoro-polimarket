/**
 * localStorage persistence helper (design.md §4). A single tested place for the
 * try/catch-and-recover logic so a missing key, unavailable storage, or a
 * corrupt/unparseable payload degrades to the fallback instead of throwing
 * (AC6.4). Used by `bets.store.ts` and `settings.store.ts`.
 */

/** Read + JSON.parse a key; returns `fallback` on miss, parse error, or no storage. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** JSON.stringify + write a key. Silently ignores quota/serialization/no-storage errors. */
export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable or over quota — non-fatal for a local demo. */
  }
}

/** Remove a key. Silently ignores errors. */
export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* no-op */
  }
}
