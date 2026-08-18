/**
 * Builder / fee configuration (design.md §2.8, AC5.9, NFR-SEC-4).
 *
 * The builderCode (`bytes32`) is public — it travels inside a signed order to
 * attribute volume/fees — but it MUST be replaceable and MUST NEVER be a real
 * value committed to source. Resolution order:
 *   settings.store override (if provided) > VITE_BUILDER_CODE > placeholder.
 *
 * The bps rates default to safe demo values (taker 100 / maker 50 / platform 0)
 * and are env-overridable. This module isolates `import.meta.env` reads so the
 * betting service and `computeFees()` stay pure and trivially testable.
 */
import type { BuilderConfig } from '../models/bet'

/** Visibly-invalid, all-zero placeholder — never a real committed value. */
export const PLACEHOLDER_BUILDER_CODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

function envNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Resolve the active builder config. Pass `{ builderCode }` (e.g. from the
 * settings store) to override the env/placeholder default at a single point.
 */
export function getBuilderConfig(overrides?: Partial<BuilderConfig>): BuilderConfig {
  const env = import.meta.env

  const base: BuilderConfig = {
    builderCode:
      (env.VITE_BUILDER_CODE as string | undefined)?.trim() ||
      PLACEHOLDER_BUILDER_CODE,
    builderTakerBps: envNumber(env.VITE_BUILDER_TAKER_BPS, 100),
    builderMakerBps: envNumber(env.VITE_BUILDER_MAKER_BPS, 50),
    platformBps: envNumber(env.VITE_PLATFORM_BPS, 0),
  }

  if (!overrides) return base

  // Skip nullish/empty overrides so an unset settings value never wins.
  const cleaned: Partial<BuilderConfig> = {}
  if (overrides.builderCode) cleaned.builderCode = overrides.builderCode
  if (overrides.builderTakerBps != null) cleaned.builderTakerBps = overrides.builderTakerBps
  if (overrides.builderMakerBps != null) cleaned.builderMakerBps = overrides.builderMakerBps
  if (overrides.platformBps != null) cleaned.platformBps = overrides.platformBps

  return { ...base, ...cleaned }
}
