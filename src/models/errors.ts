/**
 * Unified error taxonomy + Result contract (T102 / T11 · plan §2).
 *
 * ONE `AppError` discriminated union spans all four services so the UI can map a
 * single `error.kind` to fixed, friendly copy (never surfacing raw upstream
 * messages — C13/C19). Services return `Result<T, AppError>` and DO NOT throw
 * across the service boundary; `normalizeMarket` returns `null` for a malformed
 * item instead (plan §2 "Throw-vs-Result contract").
 */

/**
 * The kinds of failure the app can represent.
 *
 * - transport (`http.ts`): `network` | `timeout` | `cors` | `parse` | `offline`
 *   and `http` (non-2xx; `429` carries `retryAfter`).
 * - betting (`betting.service.ts`): `validation` | `sim-failure`.
 * - AI (`openrouter.service.ts`): `no-key` | `rate-limit` | `parse-fail` |
 *   `outcome-mismatch`.
 */
export type AppError =
  | { kind: 'network' | 'timeout' | 'cors' | 'parse' | 'offline'; message?: string }
  | { kind: 'http'; status: number; retryAfter?: number; message?: string }
  | { kind: 'validation' | 'sim-failure'; message?: string }
  | { kind: 'no-key' | 'rate-limit' | 'parse-fail' | 'outcome-mismatch'; message?: string }

/** Every discriminant value of {@link AppError} (handy for exhaustive UI maps). */
export type AppErrorKind = AppError['kind']

/**
 * A success/failure envelope. `E` defaults to {@link AppError}. Callers narrow on
 * `.ok` — no exceptions cross the seam.
 */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E }

/** Wrap a success value. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

/** Wrap a failure. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/** Construct an {@link AppError}. Message is optional and only for logging/debug. */
export function appError(kind: AppError['kind'], extra?: Partial<AppError>): AppError {
  return { ...(extra ?? {}), kind } as AppError
}
