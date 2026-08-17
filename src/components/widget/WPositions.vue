<script setup lang="ts">
/**
 * WPositions (T606 · AC6.2/AC6.3/AC6.4 · NFR-MF-5/NFR-INTL-1 · T17) — the list of
 * persisted (simulated) positions.
 *
 * Three distinct surfaces, never conflated (empty-state doctrine, T13/T17):
 *   - CORRUPT NOTICE: a `role="status"` recoverable warning shown when the stored
 *     payload was partially invalid and some item(s) were dropped (AC6.4). It is
 *     NOT the first-run empty state — it is a dismissible recovery message, and it
 *     can coexist with surviving positions.
 *   - FIRST-RUN EMPTY: onboarding tone ("no bets yet") with a next-step CTA toward
 *     search (AC6.3) — shown only when there are zero positions AND storage is not
 *     corrupt (`isFirstRun`).
 *   - LIST: stacked rows on mobile, a real `<table>` at md+ (NFR-MF-5). Every
 *     figure (size, price, cost, shares, payout) renders via `utils/format.ts`.
 *
 * The store is injectable so tests drive each surface without Pinia/localStorage.
 */
import { computed } from 'vue'
import type { Position } from '../../models/bet'
import { formatNumber, formatPercent, formatUsd } from '../../utils/format'
import { useBetsStore } from '../../stores/bets.store'
import SJButton from '../ui/SJButton.vue'
import SJBadge from '../ui/SJBadge.vue'

/** Minimal store surface the widget reads (the bets store satisfies it). */
interface PositionsSource {
  positions: Position[]
  isFirstRun: boolean
  corruptNotice: boolean
  dismissCorruptNotice: () => void
}

const props = defineProps<{
  /** Inject a positions source (defaults to the bets store). */
  store?: PositionsSource
}>()

const emit = defineEmits<{ (e: 'browse'): void }>()

const source: PositionsSource = props.store ?? useBetsStore()

const positions = computed(() => source.positions)
const isFirstRun = computed(() => source.isFirstRun)
const corruptNotice = computed(() => source.corruptNotice)
const hasPositions = computed(() => positions.value.length > 0)

/** Each share resolves to $1 on a win → payout = shares (AC5.3/AC6.2). */
function payoutOf(p: Position): number {
  return p.shares * 1
}
</script>

<template>
  <section class="w-positions" aria-labelledby="w-positions-title">
    <h2 id="w-positions-title" class="w-positions__title">Your positions</h2>

    <!-- Corrupt-storage recovery notice (AC6.4) — distinct from onboarding, and it
         may appear alongside surviving positions. -->
    <div v-if="corruptNotice" class="w-positions__notice" role="status">
      <p class="w-positions__notice-text">
        Some saved positions couldn’t be read and were skipped. Any valid positions are still shown
        below.
      </p>
      <SJButton variant="ghost" size="sm" @click="source.dismissCorruptNotice()">Dismiss</SJButton>
    </div>

    <!-- First-run onboarding empty state (AC6.3) — only when truly nothing yet. -->
    <div v-if="isFirstRun" class="w-positions__empty">
      <p class="w-positions__empty-title">No bets yet</p>
      <p class="w-positions__empty-body">
        When you place a simulated bet, it’ll show up here with its cost, shares, and potential
        payout. Find a market to get started.
      </p>
      <SJButton variant="primary" @click="emit('browse')">Browse markets</SJButton>
    </div>

    <!-- The positions themselves: stacked rows (base) → table (md+). -->
    <table v-else-if="hasPositions" class="w-positions__table">
      <caption class="sr-only">
        Your simulated positions
      </caption>
      <thead>
        <tr>
          <th scope="col">Market</th>
          <th scope="col">Outcome</th>
          <th scope="col">Size</th>
          <th scope="col">Price</th>
          <th scope="col">Cost</th>
          <th scope="col">Shares</th>
          <th scope="col">Payout</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in positions" :key="p.id" class="w-positions__row">
          <td class="w-positions__cell w-positions__cell--question" data-label="Market">
            {{ p.question }}
          </td>
          <td class="w-positions__cell" data-label="Outcome">
            <SJBadge variant="neutral">{{ p.outcome }}</SJBadge>
          </td>
          <td class="w-positions__cell w-positions__cell--num" data-label="Size">
            {{ formatUsd(p.size) }}
          </td>
          <td class="w-positions__cell w-positions__cell--num" data-label="Price">
            {{ formatPercent(p.price) }}
          </td>
          <td class="w-positions__cell w-positions__cell--num" data-label="Cost">
            {{ formatUsd(p.cost) }}
          </td>
          <td class="w-positions__cell w-positions__cell--num" data-label="Shares">
            {{ formatNumber(p.shares) }}
          </td>
          <td
            class="w-positions__cell w-positions__cell--num w-positions__cell--payout"
            data-label="Payout"
          >
            {{ formatUsd(payoutOf(p)) }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.w-positions {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.w-positions__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.w-positions__notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
}

.w-positions__notice-text {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-body);
}

.w-positions__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-6);
  text-align: left;
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
}

.w-positions__empty-title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-heading);
}

.w-positions__empty-body {
  max-width: 60ch;
  font-size: var(--font-size-base);
  line-height: var(--leading-relaxed);
  color: var(--color-text-secondary);
}

/* --- Table: stacked cards on mobile, real table at md+ (NFR-MF-5) --- */
.w-positions__table {
  width: 100%;
  border-collapse: collapse;
}

/* Base (mobile): hide the header row visually and stack each cell with its label. */
.w-positions__table thead {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.w-positions__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.w-positions__cell {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
  font-size: var(--font-size-base);
  color: var(--color-text-body);
}

/* The row label on mobile comes from data-label (DOM attr, not a design value). */
.w-positions__cell::before {
  content: attr(data-label);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.w-positions__cell--question {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-heading);
}

.w-positions__cell--num {
  font-variant-numeric: tabular-nums;
}

.w-positions__cell--payout {
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary-dark);
}

@media (min-width: 769px) {
  .w-positions__table thead {
    position: static;
    width: auto;
    height: auto;
    clip: auto;
  }

  .w-positions__table th {
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-family-sans);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }

  .w-positions__row {
    display: table-row;
    padding: 0;
    margin-bottom: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .w-positions__cell {
    display: table-cell;
    padding: var(--space-3);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .w-positions__cell::before {
    content: none;
  }

  .w-positions__cell--num {
    text-align: right;
  }
}
</style>
