/**
 * Safe `localStorage` access (T302/T303 · AC6.1/AC6.4 · plan §2 localStorage hardening).
 *
 * `localStorage` throws in three real-world situations the stores must survive
 * WITHOUT crashing: Safari Private mode / disabled storage (access throws), and a
 * full quota on write (`QuotaExceededError`). These helpers never throw — reads
 * fall back to `null`, and writes report a typed failure the store maps to a
 * non-blocking "couldn't save locally" notice (never a faked receipt).
 */

/** Result of a write attempt. `unavailable` = storage disabled/blocked. */
export type WriteResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' }

/** Read a key, or `null` when absent OR storage is unavailable (never throws). */
export function readItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

/** Was this failure a quota-exceeded error (vs storage being unavailable)? */
function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    // Firefox uses a distinct name; 22 / 1014 are the legacy codes.
    (e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 ||
      e.code === 1014)
  )
}

/** Write a key; report `quota`/`unavailable` on failure instead of throwing. */
export function writeItem(key: string, value: string): WriteResult {
  try {
    globalThis.localStorage.setItem(key, value)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unavailable' }
  }
}

/** Remove a key; swallow any failure (nothing to recover). */
export function removeItem(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    /* storage unavailable — nothing persisted anyway */
  }
}
