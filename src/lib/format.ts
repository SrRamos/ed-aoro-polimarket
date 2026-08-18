/** Pure display formatters. No side effects, no network. */

/** Clamp a number to [min, max]. */
export function clamp(n: number, min = 0, max = 1): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/** A price in [0,1] as an integer-ish percentage string, e.g. 0.623 → "62%". */
export function formatPercent(price: number, fractionDigits = 0): string {
  const pct = clamp(price) * 100
  return `${pct.toFixed(fractionDigits)}%`
}

/** USD with cents, e.g. 1234.5 → "$1,234.50". */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

/** Compact USD for big figures, e.g. 1_240_000 → "$1.2M". */
export function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0)
}

/** Human date like "26/jun/2026" from an ISO string (or "—" when absent). */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase()
  return `${day}/${month}/${d.getUTCFullYear()}`
}
