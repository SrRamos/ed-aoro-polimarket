/**
 * Settings store (design.md §4, spec.md AC8.*). Holds the user-facing AI
 * on/off toggle (`aiEnabled`) and an optional builderCode override, both
 * persisted to localStorage. No secrets live here: the OpenRouter key and model
 * are deploy-time env config (see openrouter.service.ts), never user-supplied.
 */
import { defineStore } from 'pinia'
import { readJson, writeJson } from './persist'

const SETTINGS_KEY = 'polymarket-widget:settings:v1'

interface SettingsState {
  aiEnabled: boolean
  builderCodeOverride: string | null
}

interface PersistedSettings {
  aiEnabled?: unknown
  builderCodeOverride?: unknown
}

function loadSettings(): SettingsState {
  const raw = readJson<PersistedSettings>(SETTINGS_KEY, {})
  return {
    aiEnabled: raw.aiEnabled === true,
    builderCodeOverride:
      typeof raw.builderCodeOverride === 'string' && raw.builderCodeOverride
        ? raw.builderCodeOverride
        : null,
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => loadSettings(),

  actions: {
    /** Turn AI suggestions on/off and persist (AC8.1/8.2). */
    setAiEnabled(enabled: boolean) {
      this.aiEnabled = enabled
      this.persist()
    },

    /** Flip the AI toggle. */
    toggleAi() {
      this.setAiEnabled(!this.aiEnabled)
    },

    setBuilderCodeOverride(code: string | null) {
      this.builderCodeOverride = code?.trim() || null
      this.persist()
    },

    /** Persist state. Holds no secrets. */
    persist() {
      writeJson(SETTINGS_KEY, {
        aiEnabled: this.aiEnabled,
        builderCodeOverride: this.builderCodeOverride,
      })
    },
  },
})
