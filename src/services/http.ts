/**
 * Fetch wrapper (design.md §2.1, NFR-SVC-1). The ONLY module allowed to call
 * the global `fetch()`. Adds a timeout (AbortController), JSON parsing, a short
 * retry on network/5xx/timeout, and a normalized `HttpError` shape so callers
 * never see a raw `Error` from `fetch()`/`JSON.parse()`.
 */

export interface HttpError {
  kind: 'network' | 'timeout' | 'http' | 'parse'
  status?: number // present when kind === 'http'
  message: string
  url: string
}

export interface FetchJsonOptions {
  timeoutMs?: number // default 8000
  signal?: AbortSignal // caller-provided cancellation (e.g. debounce supersede, AC2.2)
  headers?: Record<string, string>
  /** HTTP method. Defaults to GET. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** JSON request body (serialized here; adds a JSON Content-Type when unset). */
  body?: unknown
  /** Total attempts (1 = no retry). Retryable failures: network / timeout / 5xx. */
  retry?: { attempts: number; backoffMs: number }
}

const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_RETRY = { attempts: 1, backoffMs: 0 }

export function isHttpError(e: unknown): e is HttpError {
  return typeof e === 'object' && e !== null && 'kind' in e && 'message' in e && 'url' in e
}

/** Builds a query string (leading `?`), skipping undefined/null values. */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(err: HttpError): boolean {
  return (
    err.kind === 'network' ||
    err.kind === 'timeout' ||
    (err.kind === 'http' && err.status !== undefined && err.status >= 500)
  )
}

interface AttemptInit {
  timeoutMs: number
  callerSignal: AbortSignal | undefined
  headers: Record<string, string> | undefined
  method: string
  body: unknown
}

async function attemptFetch<T>(url: string, init: AttemptInit): Promise<T> {
  const { timeoutMs, callerSignal, headers, method, body } = init
  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onCallerAbort = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', onCallerAbort)
  }

  const hasBody = body !== undefined && body !== null
  const finalHeaders: Record<string, string> | undefined = hasBody
    ? { 'Content-Type': 'application/json', ...headers }
    : headers

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: finalHeaders,
      body: hasBody ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      throw {
        kind: 'http',
        status: response.status,
        message: `Request failed with status ${response.status}`,
        url,
      } satisfies HttpError
    }

    try {
      return (await response.json()) as T
    } catch {
      throw { kind: 'parse', message: 'Response was not valid JSON', url } satisfies HttpError
    }
  } catch (err) {
    if (isHttpError(err)) throw err

    // Aborted: distinguish caller-cancellation from our own timeout.
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (timedOut) {
        throw {
          kind: 'timeout',
          message: `Request timed out after ${timeoutMs}ms`,
          url,
        } satisfies HttpError
      }
      // Caller cancelled (debounce supersede) — re-throw the abort so the
      // caller can detect it via signal.aborted and skip state updates.
      throw err
    }

    throw {
      kind: 'network',
      message: err instanceof Error ? err.message : 'Network request failed',
      url,
    } satisfies HttpError
  } finally {
    clearTimeout(timer)
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort)
  }
}

/**
 * Wraps fetch with timeout, JSON parsing, retry and normalized errors.
 * Never rejects with a raw `Error` for HTTP/network/parse failures — always an
 * `HttpError`. A caller-initiated abort re-throws the original `AbortError`.
 */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retry = opts.retry ?? DEFAULT_RETRY
  const attempts = Math.max(1, retry.attempts)

  let lastError: HttpError | undefined
  for (let i = 0; i < attempts; i++) {
    try {
      return await attemptFetch<T>(url, {
        timeoutMs,
        callerSignal: opts.signal,
        headers: opts.headers,
        method: opts.method ?? 'GET',
        body: opts.body,
      })
    } catch (err) {
      // Caller cancellation is not retryable and not an HttpError — propagate.
      if (!isHttpError(err)) throw err
      lastError = err
      const canRetry = i < attempts - 1 && isRetryable(err) && !opts.signal?.aborted
      if (!canRetry) throw err
      if (retry.backoffMs > 0) await delay(retry.backoffMs)
    }
  }
  // Unreachable, but satisfies the type checker.
  throw lastError as HttpError
}
