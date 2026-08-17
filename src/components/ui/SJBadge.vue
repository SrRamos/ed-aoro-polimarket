<script setup lang="ts">
/**
 * SJBadge (T504 · NFR-DS-8, NFR-A11Y-2) — pill status chip.
 *
 * `--radius-pill` + the DS semantic triad (`-surface` + `-border` + `-text`) per
 * variant. `neutral` is the non-committal encoding for >2-outcome markets
 * (AC4.6) — color never forced to success/error. Content is ALWAYS text (with an
 * optional leading icon), so meaning is never carried by color alone (SC 1.4.1).
 */
withDefaults(
  defineProps<{
    variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  }>(),
  { variant: 'neutral' },
)
</script>

<template>
  <span :class="['sj-badge', `sj-badge--${variant}`]">
    <span v-if="$slots.icon" class="sj-badge__icon" aria-hidden="true"><slot name="icon" /></span>
    <span class="sj-badge__label"><slot /></span>
  </span>
</template>

<style scoped>
.sj-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: var(--leading-snug);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
}

.sj-badge__icon {
  display: inline-flex;
  align-items: center;
}

.sj-badge--success {
  color: var(--color-success-text);
  background: var(--color-success-surface);
  border-color: var(--color-success-border);
}

.sj-badge--warning {
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  border-color: var(--color-warning-border);
}

.sj-badge--error {
  color: var(--color-error-text);
  background: var(--color-error-surface);
  border-color: var(--color-error-border);
}

.sj-badge--info {
  color: var(--color-info-text);
  background: var(--color-info-surface);
  border-color: var(--color-info-border);
}

.sj-badge--neutral {
  color: var(--color-text-secondary);
  background: var(--color-surface-secondary);
  border-color: var(--color-border);
}
</style>
