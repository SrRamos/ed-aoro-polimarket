/**
 * `RequestState<T>` discriminated union (T102 / T11 · plan §2).
 *
 * Every list/detail/AI panel models its state with this union so impossible
 * combinations (e.g. `loading && error`) are unrepresentable. Stores/composables
 * (next agent) consume it; it lives here so the models layer owns the shape.
 */
import type { AppError } from './errors'

export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'success'; data: T }

export const idle = (): RequestState<never> => ({ status: 'idle' })
export const loading = (): RequestState<never> => ({ status: 'loading' })
export const errorState = <T>(error: AppError): RequestState<T> => ({ status: 'error', error })
export const successState = <T>(data: T): RequestState<T> => ({ status: 'success', data })
