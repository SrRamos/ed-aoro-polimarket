<script setup lang="ts">
import { useId } from 'vue'

/**
 * Native-first input with a persistent visible <label> (design.md §3.1).
 * Placeholder is never the label. Validation styled via :user-invalid /
 * :user-valid (post-interaction). font-size ≥ 16px prevents iOS zoom
 * (NFR-MF-3). Touch target ≥ 44px.
 */
type SJInputProps = {
  label: string
  type?: 'text' | 'search' | 'number' | 'password'
  inputmode?: 'text' | 'search' | 'numeric' | 'decimal'
  autocomplete?: string
  placeholder?: string
  help?: string
  /** External (submit-time) error, shown regardless of :user-invalid. */
  error?: string
  required?: boolean
  disabled?: boolean
  min?: number | string
  max?: number | string
  step?: number | string
  prefix?: string
}
const props = withDefaults(defineProps<SJInputProps>(), {
  type: 'text',
  required: false,
  disabled: false,
})

const model = defineModel<string>({ default: '' })

const uid = useId()
const inputId = `sj-input-${uid}`
const helpId = `${inputId}-help`
const errorId = `${inputId}-error`
</script>

<template>
  <div class="sj-field" :class="{ 'sj-field--invalid': !!props.error }">
    <label class="sj-field__label" :for="inputId">
      {{ props.label }}
      <span v-if="props.required" class="sj-field__req" aria-hidden="true"
        >*</span
      >
    </label>

    <div class="sj-field__control" :class="{ 'sj-field__control--prefixed': !!props.prefix }">
      <span v-if="props.prefix" class="sj-field__prefix" aria-hidden="true">{{
        props.prefix
      }}</span>
      <input
        :id="inputId"
        v-model="model"
        class="sj-field__input"
        :type="props.type"
        :inputmode="props.inputmode"
        :autocomplete="props.autocomplete"
        :placeholder="props.placeholder"
        :required="props.required"
        :disabled="props.disabled"
        :min="props.min"
        :max="props.max"
        :step="props.step"
        :aria-invalid="props.error ? 'true' : undefined"
        :aria-describedby="
          [props.help ? helpId : '', props.error ? errorId : '']
            .filter(Boolean)
            .join(' ') || undefined
        "
      />
    </div>

    <p v-if="props.help" :id="helpId" class="sj-field__help">{{ props.help }}</p>
    <p v-if="props.error" :id="errorId" class="sj-field__error" role="alert">
      {{ props.error }}
    </p>
  </div>
</template>

<style scoped>
.sj-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sj-field__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.sj-field__req {
  color: var(--color-error-text);
}

.sj-field__control {
  display: flex;
  align-items: stretch;
}

.sj-field__prefix {
  display: inline-flex;
  align-items: center;
  padding-inline: var(--space-3);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-light);
  border-right: 0;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.sj-field__input {
  flex: 1 1 auto;
  min-height: var(--space-12);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  /* 16px floor — never below --font-size-base (NFR-MF-3). */
  font-size: var(--font-size-base);
  color: var(--color-text-strong);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  transition: border-color var(--duration-fast) var(--easing-out);
}

.sj-field__control--prefixed .sj-field__input {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.sj-field__input::placeholder {
  color: var(--color-text-muted);
}

.sj-field__input:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}

/* Post-interaction validation (native). */
.sj-field__input:user-invalid {
  border-color: var(--color-error);
}

.sj-field__input:user-valid {
  border-color: var(--color-success);
}

/* External/submit-time error. */
.sj-field--invalid .sj-field__input {
  border-color: var(--color-error);
}

.sj-field__input:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-hover);
  cursor: not-allowed;
}

.sj-field__help {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.sj-field__error {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-error-text);
}
</style>
