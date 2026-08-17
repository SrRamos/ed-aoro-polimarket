/**
 * Structured event logger (T005 · plan §6 observability).
 *
 * Phase-1 sink is the dev console; `setLogSink` lets a real sink (Worker analytics
 * / RUM) drop in later without touching call sites. Fields mirror plan §6's
 * structured-log contract.
 *
 * SECURITY: never pass secrets (the OpenRouter key) into an event — not in `data`
 * nor any extra field (NFR-SEC-2). The logger does not redact for you.
 */

export type LogLevel = 'info' | 'warn' | 'error'
export type LogStatus = 'ok' | 'error'

/** A structured log record. Known plan §6 fields are typed; extras are allowed. */
export interface LogEvent {
  /** Dotted event name, e.g. `gamma.searchMarkets` or `vue.unhandledError`. */
  event: string
  service?: 'polymarket' | 'betting' | 'openrouter' | 'app'
  operation?: string
  status?: LogStatus
  durationMs?: number
  errorKind?: string | null
  marketId?: string | null
  modelId?: string | null
  correlationId?: string
  [key: string]: unknown
}

/** A finalized record as handed to the sink (level + timestamp attached). */
export interface LogRecord extends LogEvent {
  level: LogLevel
  timestamp: string
}

export type LogSink = (record: LogRecord) => void

const consoleSink: LogSink = (record) => {
  const label = `[${record.service ?? 'app'}] ${record.event}`
  if (record.level === 'error') console.error(label, record)
  else if (record.level === 'warn') console.warn(label, record)
  else console.info(label, record)
}

let sink: LogSink = consoleSink

/** Swap the active sink (e.g. install a real analytics sink in Phase 2). */
export function setLogSink(next: LogSink): void {
  sink = next
}

/** Reset to the built-in console sink (primarily for tests). */
export function resetLogSink(): void {
  sink = consoleSink
}

/** Emit a structured event through the active sink. */
export function logEvent(event: LogEvent, level: LogLevel = 'info'): void {
  sink({ ...event, level, timestamp: new Date().toISOString() })
}
