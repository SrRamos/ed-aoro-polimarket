/**
 * Centralized, validated runtime configuration (T002 / plan §1).
 *
 * Single source of truth for `import.meta.env.VITE_*`. Read once at module load:
 * provides safe defaults, enum-guards the mode flags, and rejects a non-`https://`
 * base URL (AC9.3, AC9.5, AC9.6, NFR-ENV-1). Components/services import `config`
 * — they never touch `import.meta.env` directly.
 */

export const BET_MODES = ['mock', 'real'] as const
export type BetMode = (typeof BET_MODES)[number]

export const AI_MODES = ['user-key', 'proxy'] as const
export type AiMode = (typeof AI_MODES)[number]

export interface AppConfig {
  readonly gammaBaseUrl: string
  readonly openrouterBaseUrl: string
  readonly betMode: BetMode
  readonly aiMode: AiMode
  /**
   * Opt-in demo mode. When `true`, the read services serve local fixtures instead
   * of the (geo-blocked) Polymarket/OpenRouter APIs. Default `false` — the real
   * code path is unchanged unless `VITE_USE_MOCK_DATA=true` is set explicitly.
   */
  readonly useMockData: boolean
}

const DEFAULT_GAMMA_BASE_URL = 'https://gamma-api.polymarket.com'
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_BET_MODE: BetMode = 'mock'
const DEFAULT_AI_MODE: AiMode = 'user-key'
const DEFAULT_USE_MOCK_DATA = false

/** Thrown on invalid configuration — surfaced at startup, never swallowed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(`[config] ${message}`)
    this.name = 'ConfigError'
  }
}

/** Validate that `value` is a well-formed `https://` URL; return it unchanged. */
function requireHttps(value: string, varName: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigError(`${varName} is not a valid URL: "${value}"`)
  }
  if (url.protocol !== 'https:') {
    throw new ConfigError(
      `${varName} must use https:// (got "${url.protocol}//") — HTTPS is required`,
    )
  }
  return value
}

/** Coerce a raw env string into one of `allowed`, falling back when unset. */
function readEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  varName: string,
): T {
  const value = raw?.trim()
  if (value === undefined || value === '') return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new ConfigError(`${varName} must be one of ${allowed.join(' | ')} (got "${value}")`)
}

/** Coerce a raw env string into a boolean; only the literal `"true"` enables it. */
function readBool(raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase()
  if (value === undefined || value === '') return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

/**
 * Build a validated `AppConfig` from an env bag. Pure + injectable so unit tests
 * (Group 7) can exercise defaults, enum guards, and the HTTPS rejection.
 */
export function buildConfig(env: ImportMetaEnv): AppConfig {
  const gammaBaseUrl = requireHttps(
    env.VITE_GAMMA_BASE_URL?.trim() || DEFAULT_GAMMA_BASE_URL,
    'VITE_GAMMA_BASE_URL',
  )
  const openrouterBaseUrl = requireHttps(
    env.VITE_OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
    'VITE_OPENROUTER_BASE_URL',
  )
  const betMode = readEnum(env.VITE_BET_MODE, BET_MODES, DEFAULT_BET_MODE, 'VITE_BET_MODE')
  const aiMode = readEnum(env.VITE_AI_MODE, AI_MODES, DEFAULT_AI_MODE, 'VITE_AI_MODE')
  const useMockData = readBool(env.VITE_USE_MOCK_DATA, DEFAULT_USE_MOCK_DATA)
  return { gammaBaseUrl, openrouterBaseUrl, betMode, aiMode, useMockData }
}

/** The validated, app-wide configuration singleton. */
export const config: AppConfig = buildConfig(import.meta.env)
