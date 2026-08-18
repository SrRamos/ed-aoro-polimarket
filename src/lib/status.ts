/**
 * The 4-state async status used across every async-driven view (design.md §5).
 * A bare boolean `loading` is never used, so empty and error stay distinct.
 */
export type ViewStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error'
