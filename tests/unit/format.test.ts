/**
 * Intl formatter determinism (T712 · NFR-INTL-1).
 * Pinned locale/timezone → identical output regardless of host environment.
 */
import { describe, it, expect } from 'vitest'
import {
  PLACEHOLDER,
  formatPercent,
  formatUsd,
  formatUsdCompact,
  formatNumber,
  formatEndDate,
} from '../../src/utils/format'

describe('formatPercent', () => {
  it('renders an implied probability as a percentage', () => {
    expect(formatPercent(0.62)).toBe('62%')
    expect(formatPercent(0.385)).toBe('38.5%')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })

  it('never renders NaN/Infinity', () => {
    expect(formatPercent(NaN)).toBe(PLACEHOLDER)
    expect(formatPercent(Infinity)).toBe(PLACEHOLDER)
  })
})

describe('formatUsd', () => {
  it('formats exact dollars with cents', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
    expect(formatUsd(0)).toBe('$0.00')
  })
  it('guards non-finite', () => {
    expect(formatUsd(NaN)).toBe(PLACEHOLDER)
    expect(formatUsd(1 / 0)).toBe(PLACEHOLDER)
  })
})

describe('formatUsdCompact', () => {
  it('formats large figures compactly', () => {
    expect(formatUsdCompact(5_250_000)).toBe('$5.3M')
    expect(formatUsdCompact(125_000)).toBe('$125K')
  })
  it('guards non-finite', () => {
    expect(formatUsdCompact(NaN)).toBe(PLACEHOLDER)
  })
})

describe('formatNumber', () => {
  it('formats a plain quantity with up to 2 decimals, no currency', () => {
    expect(formatNumber(20)).toBe('20')
    expect(formatNumber(19.999)).toBe('20')
    expect(formatNumber(12.5)).toBe('12.5')
    expect(formatNumber(1234.5)).toBe('1,234.5')
  })
  it('guards non-finite', () => {
    expect(formatNumber(NaN)).toBe(PLACEHOLDER)
    expect(formatNumber(Infinity)).toBe(PLACEHOLDER)
  })
})

describe('formatEndDate', () => {
  it('formats an ISO timestamp as a UTC calendar date', () => {
    expect(formatEndDate('2025-12-31T23:59:59Z')).toBe('Dec 31, 2025')
  })
  it('is timezone-stable (UTC pinned)', () => {
    // An instant just after midnight UTC stays on the UTC calendar day.
    expect(formatEndDate('2025-01-01T00:30:00Z')).toBe('Jan 1, 2025')
  })
  it('guards empty/invalid input', () => {
    expect(formatEndDate('')).toBe(PLACEHOLDER)
    expect(formatEndDate('not-a-date')).toBe(PLACEHOLDER)
  })
})
