/**
 * Settings store (T303 · AC8.1/AC8.2/AC6.5 · C12).
 *
 * Holds the user-supplied OpenRouter key (the ONLY key the app ever uses — never
 * bundled, AC8.4) plus the env-driven `bet.mode` / `ai.mode` flags surfaced from
 * `config`. The key is persisted in `localStorage` and reconciled across tabs via
 * a `window` `storage` listener so saving/clearing it in one tab toggles the AI
 * feature everywhere without a reload (AC6.5). The key travels ONLY in the
 * `Authorization` header downstream (openrouter.service) — never logged, never in
 * a URL (AC8.3).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { config } from '../config'
import { readItem, removeItem, writeItem } from '../utils/storage'
import { logEvent } from '../utils/logger'

const STORAGE_KEY = 'aora:openrouter-key'

/** Read the persisted key, tolerating unavailable storage (→ empty). */
export function loadKey(): string {
  const raw = readItem(STORAGE_KEY)
  return typeof raw === 'string' ? raw : ''
}

export const useSettingsStore = defineStore('settings', () => {
  const openrouterKey = ref('')
  /** Non-blocking flag when the key could not be persisted (quota/unavailable). */
  const saveError = ref(false)

  /** AI is enabled exactly when a non-empty key is configured (AC7.1/AC8.1). */
  const hasKey = computed(() => openrouterKey.value.length > 0)

  // Env-driven flags (read-only mirror of `config`, plan §8).
  const betMode = computed(() => config.betMode)
  const aiMode = computed(() => config.aiMode)

  function load(): void {
    openrouterKey.value = loadKey()
  }

  /**
   * Persist a key and enable AI without a reload (AC8.1). An empty/blank value is
   * treated as a clear. Persist failure keeps the key in memory for the session
   * but raises the non-blocking `saveError` flag.
   */
  function saveKey(key: string): void {
    const trimmed = key.trim()
    if (trimmed === '') {
      clearKey()
      return
    }
    openrouterKey.value = trimmed
    const res = writeItem(STORAGE_KEY, trimmed)
    if (!res.ok) {
      saveError.value = true
      logEvent(
        { event: 'settings.persist', service: 'app', status: 'error', errorKind: res.reason },
        'warn',
      )
      return
    }
    saveError.value = false
  }

  /** Remove the key from storage + memory → AI returns to its disabled/CTA state. */
  function clearKey(): void {
    removeItem(STORAGE_KEY)
    openrouterKey.value = ''
    saveError.value = false
  }

  // --- Cross-tab reconciliation (AC6.5 / C12) --------------------------------

  function onStorage(e: StorageEvent): void {
    if (e.key !== null && e.key !== STORAGE_KEY) return
    load()
  }

  let listening = false
  function startCrossTabSync(): void {
    if (listening || typeof window === 'undefined') return
    window.addEventListener('storage', onStorage)
    listening = true
  }
  function stopCrossTabSync(): void {
    if (!listening || typeof window === 'undefined') return
    window.removeEventListener('storage', onStorage)
    listening = false
  }

  load()
  startCrossTabSync()

  return {
    openrouterKey,
    saveError,
    hasKey,
    betMode,
    aiMode,
    load,
    saveKey,
    clearKey,
    startCrossTabSync,
    stopCrossTabSync,
  }
})
