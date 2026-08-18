/**
 * Settings store (design.md §4, spec.md AC8.*). Holds the user-supplied
 * OpenRouter key and an optional builderCode override, both persisted to
 * localStorage. The key is NEVER logged and never placed in a URL (NFR-SEC-1/2)
 * — components read it only to pass directly into `openrouter.service.ts`.
 */
import { defineStore } from 'pinia'
import { readJson, writeJson } from './persist'

const SETTINGS_KEY = 'polymarket-widget:settings:v1'

interface SettingsState {
  openRouterKey: string | null
  builderCodeOverride: string | null
}

interface PersistedSettings {
  openRouterKey?: unknown
  builderCodeOverride?: unknown
}

function loadSettings(): SettingsState {
  const raw = readJson<PersistedSettings>(SETTINGS_KEY, {})
  return {
    openRouterKey:
      typeof raw.openRouterKey === 'string' && raw.openRouterKey ? raw.openRouterKey : null,
    builderCodeOverride:
      typeof raw.builderCodeOverride === 'string' && raw.builderCodeOverride
        ? raw.builderCodeOverride
        : null,
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => loadSettings(),

  getters: {
    /** Drives AI availability (AC8.1/8.2). */
    hasKey: (state): boolean => !!state.openRouterKey,
  },

  actions: {
    /** Save the OpenRouter key and enable AI without a reload (AC8.1). */
    saveKey(key: string) {
      const trimmed = key.trim()
      this.openRouterKey = trimmed || null
      this.persist()
    },

    /** Clear the key and return AI to its disabled/CTA state (AC8.2). */
    clearKey() {
      this.openRouterKey = null
      this.persist()
    },

    setBuilderCodeOverride(code: string | null) {
      this.builderCodeOverride = code?.trim() || null
      this.persist()
    },

    /** Persist state. Never logs the key (NFR-SEC-1/2). */
    persist() {
      writeJson(SETTINGS_KEY, {
        openRouterKey: this.openRouterKey,
        builderCodeOverride: this.builderCodeOverride,
      })
    },
  },
})
