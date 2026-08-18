<script setup lang="ts">
import { ref, watch } from 'vue'
import SJModal from '../ui/SJModal.vue'
import SJInput from '../ui/SJInput.vue'
import SJButton from '../ui/SJButton.vue'

/**
 * Settings modal (design.md §3.2, AC8.1–AC8.5). Persistent <label> for the
 * OpenRouter key, native input, font-size ≥16px (via SJInput). Shows the
 * "stored locally, sent directly to OpenRouter" security disclaimer.
 */
type WSettingsProps = {
  open: boolean
  apiKey: string | null
}
const props = defineProps<WSettingsProps>()

type WSettingsEmits = {
  close: []
  save: [key: string]
  clear: []
}
const emit = defineEmits<WSettingsEmits>()

const draft = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) draft.value = props.apiKey ?? ''
  },
)

function save() {
  emit('save', draft.value.trim())
}
</script>

<template>
  <SJModal :open="open" title="Settings" @close="emit('close')">
    <div class="set">
      <section class="set__section">
        <h3 class="set__label">OpenRouter API key</h3>
        <p class="set__desc">
          Optional. Enables the AI suggestion features (outcome + market picks) using free
          OpenRouter models.
        </p>

        <SJInput
          v-model="draft"
          label="API key"
          type="password"
          autocomplete="off"
          placeholder="sk-or-v1-…"
          help="Paste your key from openrouter.ai/keys."
        />

        <div class="set__disclaimer" role="note" aria-label="Security disclaimer">
          <span class="set__disclaimer-icon" aria-hidden="true">🔐</span>
          <p>
            Your key is stored <strong>locally in this browser</strong> (localStorage) and is sent
            <strong>directly to OpenRouter</strong>
            only when you request a suggestion. It is never logged, never placed in a URL, and never
            sent anywhere else. No key is bundled with this app.
          </p>
        </div>
      </section>

      <div class="set__status">
        <span v-if="apiKey" class="set__status-on">
          <span aria-hidden="true">●</span> AI features are enabled.
        </span>
        <span v-else class="set__status-off">
          <span aria-hidden="true">○</span> AI features are disabled (no key set).
        </span>
      </div>
    </div>

    <template #footer>
      <div class="set__actions">
        <SJButton v-if="apiKey" variant="ghost" @click="emit('clear')">Clear key</SJButton>
        <SJButton variant="secondary" @click="emit('close')">Cancel</SJButton>
        <SJButton variant="primary" :disabled="draft.trim() === ''" @click="save"
          >Save key</SJButton
        >
      </div>
    </template>
  </SJModal>
</template>

<style scoped>
.set {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.set__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.set__label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.set__desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.set__disclaimer {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-info-text);
  background: var(--color-info-surface);
  border: 1px solid var(--color-info-border);
  border-radius: var(--radius-md);
}

.set__disclaimer-icon {
  font-size: var(--font-size-lg);
}

.set__status {
  font-size: var(--font-size-sm);
}

.set__status-on {
  color: var(--color-success-text);
  font-weight: var(--font-weight-medium);
}

.set__status-off {
  color: var(--color-text-secondary);
}

.set__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>
