/**
 * Additive builder + platform fee math (design.md §2.5 / AC5.8, D11).
 * fee = notional × bps / 10000. Builder and platform fees are computed
 * independently then summed — a zero platform fee never suppresses a
 * configured builder fee (and vice versa). Pure, no network.
 */
import type { BuilderConfig, FeeBreakdown } from '../models/bet'

export function computeFees(
  notional: number,
  cfg: BuilderConfig,
  side: 'taker' | 'maker',
): FeeBreakdown {
  const safeNotional = Number.isFinite(notional) && notional > 0 ? notional : 0
  const builderBps = side === 'taker' ? cfg.builderTakerBps : cfg.builderMakerBps
  const platformBps = cfg.platformBps

  const builderFee = (safeNotional * builderBps) / 10000
  const platformFee = (safeNotional * platformBps) / 10000

  return {
    notional: safeNotional,
    builderBps,
    builderFee,
    platformBps,
    platformFee,
    total: safeNotional + builderFee + platformFee,
  }
}

/**
 * Placeholder builder config for the demo. The builderCode is a visibly-invalid
 * placeholder (never a real committed value, AC5.9 / NFR-SEC-4). A real build
 * would source it from env/settings.
 */
export const DEMO_BUILDER_CONFIG: BuilderConfig = {
  builderCode: '0x0000000000000000000000000000000000000000000000000000000000000000',
  builderTakerBps: 100,
  builderMakerBps: 50,
  platformBps: 0,
}
