<script setup lang="ts">
/**
 * Status/outcome chip (design.md §3.1, NFR-DS-8, NFR-A11Y-2).
 * --radius-pill + semantic triad (-surface / -border / -text). Meaning is
 * always carried by text (the slot), never color alone — an optional `icon`
 * glyph adds a second non-color signal.
 */
type SJBadgeProps = {
  tone?: 'neutral' | 'success' | 'error' | 'warning' | 'info' | 'primary'
  icon?: string
}
withDefaults(defineProps<SJBadgeProps>(), {
  tone: 'neutral',
})
</script>

<template>
  <span class="sj-badge" :class="`sj-badge--${tone}`">
    <span v-if="icon" class="sj-badge__icon" aria-hidden="true">{{ icon }}</span>
    <span class="sj-badge__text"><slot /></span>
  </span>
</template>

<style scoped>
.sj-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-none);
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
}

.sj-badge__icon {
  font-size: var(--font-size-sm);
  line-height: 1;
}

.sj-badge--neutral {
  color: var(--color-text-secondary);
  background: var(--color-surface-secondary);
  border-color: var(--color-border-light);
}

.sj-badge--success {
  color: var(--color-success-text);
  background: var(--color-success-surface);
  border-color: var(--color-success-border);
}

.sj-badge--error {
  color: var(--color-error-text);
  background: var(--color-error-surface);
  border-color: var(--color-error-border);
}

.sj-badge--warning {
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  border-color: var(--color-warning-border);
}

.sj-badge--info {
  color: var(--color-info-text);
  background: var(--color-info-surface);
  border-color: var(--color-info-border);
}

.sj-badge--primary {
  color: var(--color-primary-dark);
  background: var(--color-primary-surface);
  border-color: var(--color-indigo-200);
}
</style>
