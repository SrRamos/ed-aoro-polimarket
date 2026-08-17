/**
 * useToast (T507 · NFR-A11Y-3, WCAG 2.2.1/1.4.13, C9) — the lightweight toast
 * host state shared across the app.
 *
 * A module-level reactive queue so any component can enqueue a toast and the
 * single `SJToastHost` (mounted once, near the root) renders them into a fixed
 * overlay live region. `error` toasts route to an assertive region (`role=alert`);
 * everything else to a polite one (`role=status`).
 *
 * Timing (WCAG 2.2.1): auto-dismiss defaults to a generous 6s and every toast
 * carries a manual dismiss control; `duration: 0` makes it persistent.
 */
import { reactive, readonly } from 'vue'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastOptions {
  message: string
  variant?: ToastVariant
  /** ms before auto-dismiss; `0` = persist until dismissed. */
  duration?: number
}

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
  duration: number
}

const DEFAULT_DURATION = 6000

const toasts = reactive<Toast[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 0

function dismissToast(id: number): void {
  const idx = toasts.findIndex((t) => t.id === id)
  if (idx !== -1) toasts.splice(idx, 1)
  const timer = timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

function addToast(options: ToastOptions): number {
  const id = nextId++
  const duration = options.duration ?? DEFAULT_DURATION
  toasts.push({
    id,
    message: options.message,
    variant: options.variant ?? 'info',
    duration,
  })
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), duration),
    )
  }
  return id
}

/** Reset all toasts + timers (primarily for tests). */
function clearToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  toasts.splice(0, toasts.length)
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    addToast,
    dismissToast,
    clearToasts,
  }
}
