/**
 * Deterministic formatting (T104 · NFR-INTL-1).
 *
 * The SINGLE source of truth for every `%`, currency (volume/liquidity/cost/
 * payout), and date rendered in the app. Formatters are pinned to a fixed locale
 * and time zone so output is identical across environments — no `62%`/`62.0%`
 * drift, no locale-dependent `toLocaleString` test flakiness. Non-finite / invalid
 * inputs render a fixed placeholder, never `NaN`/`Invalid Date`.
 */

/** Pinned locale — output must not vary with the host's locale. */
const LOCALE = 'en-US'
/** Rendered when a value is missing / non-finite / unparseable. */
export const PLACEHOLDER = '—'

// Prices are implied probabilities in [0,1] → percent. One optional decimal.
const percentFmt = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

// Cost / payout — exact dollars with cents.
const usdFmt = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Volume / liquidity — compact ("$5.3M") to keep cards tidy.
const usdCompactFmt = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

// endDate — fixed to UTC so the same instant renders identically everywhere.
const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** Format an implied probability in [0,1] as a percentage (e.g. `0.62` → `62%`). */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return PLACEHOLDER
  return percentFmt.format(value)
}

/** Format an exact dollar amount with cents (cost/payout). */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return PLACEHOLDER
  return usdFmt.format(value)
}

/** Format a large dollar figure compactly (volume/liquidity), e.g. `$5.3M`. */
export function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value)) return PLACEHOLDER
  return usdCompactFmt.format(value)
}

/** Format an ISO-8601 timestamp as a UTC calendar date, e.g. `Dec 31, 2025`. */
export function formatEndDate(iso: string): string {
  if (!iso) return PLACEHOLDER
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return PLACEHOLDER
  return dateFmt.format(ms)
}
