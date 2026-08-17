<script setup lang="ts">
/**
 * WSettings (T608 · AC8.1–AC8.6 · NFR-SEC-1) — the OpenRouter API-key form.
 *
 *   - KEY FIELD: SJInput `type="password"` (≥16px, persistent visible label) with
 *     the built-in show/hide toggle; paste + password managers stay enabled and
 *     `autocomplete`/`autocapitalize`/`autocorrect`/`spellcheck` are all off
 *     (AC8.6, WCAG 3.3.8).
 *   - SAVE / CLEAR: bound to the settings store; saving a key enables AI without a
 *     reload (AC8.1), clearing returns AI to its disabled/CTA state (AC8.2).
 *   - DISCLAIMER: states the key is stored locally (and is therefore readable by
 *     any script on the page), is sent directly to OpenRouter, and recommends a
 *     scoped, spend-capped, revocable key (AC8.3). No key is ever bundled (AC8.4).
 *   - Notes that bets are simulated.
 *
 * The store is injectable so tests exercise save/clear without Pinia.
 */
import { computed, ref } from 'vue'
import { useSettingsStore } from '../../stores/settings.store'
import SJInput from '../ui/SJInput.vue'
import SJButton from '../ui/SJButton.vue'

/** Minimal settings surface (the settings store satisfies it structurally). */
interface SettingsSource {
  openrouterKey: string
  hasKey: boolean
  saveError: boolean
  saveKey: (key: string) => void
  clearKey: () => void
}

const props = defineProps<{
  /** Inject a settings source (defaults to the settings store). */
  store?: SettingsSource
}>()

const emit = defineEmits<{ (e: 'saved'): void; (e: 'cleared'): void }>()

const source: SettingsSource = props.store ?? useSettingsStore()

// Local draft seeded from the persisted key; the store is the source of truth.
const draft = ref(source.openrouterKey)

const hasKey = computed(() => source.hasKey)
const saveError = computed(() => source.saveError)
const canSave = computed(() => draft.value.trim().length > 0)

function onSave(): void {
  source.saveKey(draft.value)
  emit('saved')
}

function onClear(): void {
  source.clearKey()
  draft.value = ''
  emit('cleared')
}
</script>

<template>
  <section class="w-settings" aria-labelledby="w-settings-title">
    <h2 id="w-settings-title" class="w-settings__title">Settings</h2>

    <form class="w-settings__form" novalidate @submit.prevent="onSave">
      <SJInput
        v-model="draft"
        class="w-settings__key"
        label="OpenRouter API key"
        type="password"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        placeholder="sk-or-…"
        help="Used only for AI suggestions. Leave blank to keep AI disabled."
      />

      <div class="w-settings__actions">
        <SJButton type="submit" variant="primary" :disabled="!canSave">Save key</SJButton>
        <SJButton type="button" variant="secondary" :disabled="!hasKey" @click="onClear"
          >Clear key</SJButton
        >
      </div>

      <p v-if="hasKey" class="w-settings__status" role="status">
        A key is saved — AI suggestions are enabled.
      </p>

      <!-- Non-blocking persist-failure notice (quota / private mode). -->
      <p v-if="saveError" class="w-settings__save-error" role="status">
        We couldn’t save the key locally (storage may be full or unavailable). It’ll work for this
        session but won’t persist after a reload.
      </p>
    </form>

    <!-- Security disclosure (AC8.3). -->
    <div class="w-settings__disclaimer">
      <p class="w-settings__disclaimer-title">About your key</p>
      <ul class="w-settings__disclaimer-list">
        <li>
          It’s stored locally in this browser (in <code>localStorage</code>) and is therefore
          readable by any script running on this page.
        </li>
        <li>It’s sent directly to OpenRouter to generate suggestions — never to our servers.</li>
        <li>
          Use a <strong>scoped, spend-capped</strong> key you can <strong>revoke</strong> at
          OpenRouter at any time.
        </li>
        <li>Bets in this app are simulated — no real funds are ever involved.</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.w-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.w-settings__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.w-settings__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.w-settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.w-settings__status {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-success-text);
}

.w-settings__save-error {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-warning-text);
}

.w-settings__disclaimer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
}

.w-settings__disclaimer-title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.w-settings__disclaimer-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-left: var(--space-5);
  font-size: var(--font-size-sm);
  line-height: var(--leading-relaxed);
  color: var(--color-text-secondary);
  list-style: disc;
}

.w-settings__disclaimer-list code {
  font-family: var(--font-family-alt);
  font-size: var(--font-size-xs);
}
</style>
