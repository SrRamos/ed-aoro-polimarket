/**
 * Maps an outcome label to a DS semantic tone. Yes → success, No → error,
 * everything else → primary. Color is only ever a *secondary* signal here;
 * callers must always pair it with the label text (NFR-A11Y-2 / SC 1.4.1).
 */
export type OutcomeTone = 'success' | 'error' | 'primary'

export function outcomeTone(label: string): OutcomeTone {
  const l = label.trim().toLowerCase()
  if (l === 'yes') return 'success'
  if (l === 'no') return 'error'
  return 'primary'
}
