/**
 * Fetch wrapper (T102 / T101 · NFR-SVC-1/2 · AC2.5/2.8/7.9 · plan §2 error-model).
 *
 * The ONE place `fetch` is called. Everything else (services) goes through here,
 * so transport concerns live in a single seam:
 *   - base URL joining + JSON encode/decode,
 *   - 10s timeout via `AbortController`,
 *   - `navigator.onLine === false` short-circuit → distinct `offline` error, no
 *     request fired and no retry-storm (C17 / AC2.8),
 *   - retry ONLY on `network` / `timeout` / `5xx` with exponential backoff —
 *     never on `4xx`, never on `429` (C4),
 *   - `429`/`503` `Retry-After` modelled distinctly (`{kind:'http',status,retryAfter}`)
 *     so the UI backs off without auto-retrying (AC7.9),
 *   - failures mapped to the {@link AppError} union; returns `Result<T,AppError>`
 *     and NEVER throws across the seam.
 *
 * SECURITY: this layer never logs request headers or bodies, so the OpenRouter
 * `Authorization` key can never leak to a log/sink (NFR-SEC-2).
 */
import { appError, err, ok, type AppError, type Result } from '../models/errors'
import { logEvent } from '../utils/logger'

/** Default request timeout (plan §4 budget). */
const DEFAULT_TIMEOUT_MS = 10_000
/** Additional attempts (beyond the first) for retryable failures. */
const DEFAULT_RETRIES = 1
/** Backoff base; delay for attempt n is `base * 2^n`. */
const DEFAULT_RETRY_BASE_MS = 300

export interface HttpRequestOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  /** JSON-serialized into the body when present (implies `Content-Type: application/json`). */
  body?: unknown
  /** Prepended to `url` when `url` is relative. */
  baseUrl?: string
  /** External abort (e.g. a superseded search) — its abort is NOT retried. */
  signal?: AbortSignal
  timeoutMs?: number
  /** Retryable-failure retries (network/timeout/5xx). Default 1. */
  retries?: number
  retryBaseMs?: number
  // --- Injectables for deterministic unit tests ---
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  /** Connectivity probe; defaults to `navigator.onLine`. */
  isOnline?: () => boolean
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function defaultIsOnline(): boolean {
  // Treat "unknown" (non-browser / no navigator) as online; only an explicit
  // `false` short-circuits.
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/** Join a base URL and a possibly-relative path without double slashes. */
function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) return url
  if (/^https?:\/\//i.test(url)) return url
  return `${baseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into seconds. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds)
  const when = Date.parse(header)
  if (Number.isFinite(when)) return Math.max(0, Math.round((when - Date.now()) / 1000))
  return undefined
}

/** Only network/timeout/5xx are worth retrying (C4). */
function isRetryable(error: AppError): boolean {
  if (error.kind === 'timeout') return true
  if (error.kind === 'network') return error.message !== 'aborted'
  if (error.kind === 'http') return error.status >= 500 && error.status !== 503
  return false
}

/** Sanitized identifier for logs — origin + path only, no query string. */
function safeTarget(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return url.split('?')[0] ?? url
  }
}

/**
 * Perform a single JSON request attempt. Resolves to a `Result`; transport
 * failures become an {@link AppError} rather than a thrown exception.
 */
async function attempt(
  fullUrl: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
): Promise<Result<unknown, AppError>> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onExternalAbort = (): void => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }

  try {
    const res = await fetchImpl(fullUrl, { method, headers, body, signal: controller.signal })
    if (res.ok) {
      try {
        return ok((await res.json()) as unknown)
      } catch {
        return err(appError('parse', { message: 'invalid JSON body' }))
      }
    }
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'))
    return err(appError('http', { status: res.status, retryAfter }))
  } catch {
    if (timedOut) return err(appError('timeout'))
    // Distinguish a caller-initiated (superseded) abort from a real network fault:
    // the former is swallowed by the caller and must not be retried.
    if (externalSignal?.aborted) return err(appError('network', { message: 'aborted' }))
    return err(appError('network'))
  } finally {
    clearTimeout(timer)
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * JSON request through the wrapper. Returns the parsed body as `unknown` in a
 * `Result` — the calling service validates it against an explicit schema.
 */
export async function httpRequestJson(
  url: string,
  options: HttpRequestOptions = {},
): Promise<Result<unknown, AppError>> {
  const {
    method = 'GET',
    baseUrl,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    fetchImpl = fetch,
    sleep = realSleep,
    isOnline = defaultIsOnline,
  } = options

  const fullUrl = resolveUrl(url, baseUrl)
  const target = safeTarget(fullUrl)
  const started = Date.now()

  // Offline short-circuit — no request, no retry-storm (C17 / AC2.8).
  if (!isOnline()) {
    logEvent(
      {
        event: 'http.request',
        operation: `${method} ${target}`,
        status: 'error',
        errorKind: 'offline',
      },
      'warn',
    )
    return err(appError('offline'))
  }

  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) }
  let serializedBody: string | undefined
  if (options.body !== undefined) {
    serializedBody = JSON.stringify(options.body)
    if (!('Content-Type' in headers) && !('content-type' in headers)) {
      headers['Content-Type'] = 'application/json'
    }
  }

  let last: Result<unknown, AppError> = err(appError('network'))
  for (let n = 0; n <= retries; n++) {
    last = await attempt(fullUrl, method, headers, serializedBody, timeoutMs, signal, fetchImpl)
    if (last.ok) {
      logEvent({
        event: 'http.request',
        operation: `${method} ${target}`,
        status: 'ok',
        durationMs: Date.now() - started,
      })
      return last
    }
    if (n < retries && isRetryable(last.error)) {
      await sleep(retryBaseMs * 2 ** n)
      continue
    }
    break
  }

  logEvent(
    {
      event: 'http.request',
      operation: `${method} ${target}`,
      status: 'error',
      durationMs: Date.now() - started,
      errorKind: last.ok ? null : last.error.kind,
    },
    'warn',
  )
  return last
}
