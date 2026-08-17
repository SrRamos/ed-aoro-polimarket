<script setup lang="ts">
/**
 * SJInput (T502 · NFR-DS-5, NFR-MF-3, WCAG 3.3.8) — native-first text field.
 *
 * - Persistent, visible `<label>` (NEVER placeholder-as-label).
 * - Optional help text + inline error message, both wired via `aria-describedby`;
 *   an error sets `aria-invalid="true"`. Native constraint state styles via
 *   `:user-invalid` (post-interaction, no pristine-red).
 * - `font-size ≥ --font-size-base` (16px) to stop iOS focus-zoom.
 * - Passes `type`/`inputmode`/`enterkeyhint`/`autocomplete`/`pattern`… straight
 *   through via `v-bind="attrs"`.
 * - Password variant: a show/hide toggle that swaps `type` only — it NEVER
 *   intercepts paste or blocks password managers (WCAG 3.3.8).
 */
import { computed, ref, useAttrs, useId } from 'vue'
import SJButton from './SJButton.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    label: string
    type?: string
    help?: string
    error?: string
    disabled?: boolean
    /** Hide the visible label for compact contexts (still read by AT). */
    hideLabel?: boolean
  }>(),
  { type: 'text', hideLabel: false, disabled: false, help: undefined, error: undefined },
)

const model = defineModel<string>({ default: '' })
const attrs = useAttrs()

const uid = useId()
const inputId = `sj-input-${uid}`
const helpId = `${inputId}-help`
const errorId = `${inputId}-error`

const isPassword = computed(() => props.type === 'password')
const revealed = ref(false)
const effectiveType = computed(() =>
  isPassword.value ? (revealed.value ? 'text' : 'password') : props.type,
)

const describedBy = computed(() => {
  const ids: string[] = []
  if (props.help) ids.push(helpId)
  if (props.error) ids.push(errorId)
  return ids.length ? ids.join(' ') : undefined
})

function toggleReveal(): void {
  revealed.value = !revealed.value
}
</script>

<template>
  <div class="sj-input" :class="{ 'sj-input--errored': !!error, 'sj-input--disabled': disabled }">
    <label :for="inputId" class="sj-input__label" :class="{ 'sr-only': hideLabel }">
      {{ label }}
    </label>

    <div class="sj-input__control">
      <input
        :id="inputId"
        v-model="model"
        :type="effectiveType"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="sj-input__field"
        :class="{ 'sj-input__field--with-toggle': isPassword }"
        v-bind="attrs"
      />

      <!-- Show/hide sits INSIDE the field frame; it swaps `type` only, so native
           paste + password-manager autofill keep working (WCAG 3.3.8). -->
      <SJButton
        v-if="isPassword"
        class="sj-input__toggle"
        variant="ghost"
        size="sm"
        icon-only
        :aria-label="revealed ? 'Hide value' : 'Show value'"
        :aria-pressed="revealed"
        @click="toggleReveal"
      >
        <span aria-hidden="true">{{ revealed ? '⦸' : '👁' }}</span>
      </SJButton>
    </div>

    <p v-if="help" :id="helpId" class="sj-input__help">{{ help }}</p>
    <!-- role="alert" so a newly-shown validation error is announced (NFR-A11Y-3). -->
    <p v-if="error" :id="errorId" class="sj-input__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.sj-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sj-input__label {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-strong);
}

.sj-input__control {
  position: relative;
  display: flex;
  align-items: center;
}

.sj-input__field {
  width: 100%;
  min-height: var(--space-10);
  padding: var(--space-2) var(--space-3);
  /* ≥16px to prevent iOS focus-zoom (NFR-MF-3). */
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  line-height: var(--leading-normal);
  color: var(--color-text-body);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.sj-input__field--with-toggle {
  padding-right: var(--space-10);
}

.sj-input__field:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}

/* Post-interaction native validity (no pristine-red) + forced error prop. */
.sj-input__field:user-invalid,
.sj-input--errored .sj-input__field {
  border-color: var(--color-error);
}

.sj-input__field:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-secondary);
  cursor: not-allowed;
}

.sj-input__toggle {
  position: absolute;
  right: var(--space-1);
}

.sj-input__help {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}

.sj-input__error {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  font-weight: var(--font-weight-medium);
  color: var(--color-error-text);
}
</style>
