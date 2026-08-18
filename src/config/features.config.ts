/**
 * Feature flags (design.md §2.8, AC10.2). The real CLOB order path is gated;
 * absent/unset it stays disabled and only the mock runs in the demo.
 */

/** True only when `VITE_ENABLE_REAL_ORDERS === '1'` (defaults to false/absent). */
export function isRealOrderPathEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_REAL_ORDERS === '1'
}
