<script setup lang="ts">
/**
 * WBetReceipt (T605 · AC5.6/AC6.1 · C10) — token-styled confirmation of a filled
 * bet.
 *
 * PRESENTATIONAL: it renders a receipt the parent already holds. It is surfaced
 * two ways (AC5.6): inline (this component) and as a polite toast the parent
 * enqueues. It NEVER lies about persistence — when `saveError` is set (the bet
 * filled in the simulator but could not be written to `localStorage`: quota /
 * Private-mode / unavailable), it shows the "couldn't save locally" notice
 * INSTEAD of a success receipt (AC6.1), so the user is never told a bet was saved
 * when it wasn't.
 *
 * Figures (outcome, size, avgPrice, cost, shares, payout) all render through
 * `utils/format.ts` (NFR-INTL-1); `payout = shares × $1`.
 */
import { computed } from 'vue'
import type { BetReceipt } from '../../models/bet'
import { formatNumber, formatPercent, formatUsd } from '../../utils/format'
import SJBadge from '../ui/SJBadge.vue'

const props = defineProps<{
  receipt: BetReceipt
  /** The chosen outcome label. */
  outcome: string
  /** Stake in dollars (the position size). */
  size: number
  /** Optional market question for context. */
  question?: string
  /**
   * `true` when the bet filled but could NOT be persisted locally — show the
   * recoverable notice, not a false success (AC6.1).
   */
  saveError?: boolean
}>()

/** Each share resolves to $1 on a win → payout = shares (AC5.3). */
const payout = computed(() => props.receipt.shares * 1)
</script>

<template>
  <!-- Persist failure: a bet that filled in the simulator but couldn't be saved.
       role="status" (recoverable, not an assertive alert) — never a false receipt. -->
  <div v-if="saveError" class="w-bet-receipt w-bet-receipt--unsaved" role="status">
    <p class="w-bet-receipt__unsaved-title">Bet placed, but we couldn’t save it locally</p>
    <p class="w-bet-receipt__unsaved-body">
      Your browser blocked local storage (it may be full or in private mode), so this bet won’t
      appear in your positions after a reload. Nothing was charged — bets are simulated.
    </p>
  </div>

  <div v-else class="w-bet-receipt" role="status">
    <header class="w-bet-receipt__head">
      <SJBadge variant="success">
        <template #icon><span aria-hidden="true">✓</span></template>
        Bet filled
      </SJBadge>
    </header>

    <p v-if="question" class="w-bet-receipt__question">{{ question }}</p>

    <dl class="w-bet-receipt__grid">
      <div class="w-bet-receipt__row">
        <dt class="w-bet-receipt__term">Outcome</dt>
        <dd class="w-bet-receipt__value">{{ outcome }}</dd>
      </div>
      <div class="w-bet-receipt__row">
        <dt class="w-bet-receipt__term">Size</dt>
        <dd class="w-bet-receipt__value">{{ formatUsd(size) }}</dd>
      </div>
      <div class="w-bet-receipt__row">
        <dt class="w-bet-receipt__term">Avg price</dt>
        <dd class="w-bet-receipt__value">{{ formatPercent(receipt.avgPrice) }}</dd>
      </div>
      <div class="w-bet-receipt__row">
        <dt class="w-bet-receipt__term">Cost</dt>
        <dd class="w-bet-receipt__value">{{ formatUsd(receipt.cost) }}</dd>
      </div>
      <div class="w-bet-receipt__row">
        <dt class="w-bet-receipt__term">Shares</dt>
        <dd class="w-bet-receipt__value">{{ formatNumber(receipt.shares) }}</dd>
      </div>
      <div class="w-bet-receipt__row">
        <dt class="w-bet-receipt__term">Potential payout</dt>
        <dd class="w-bet-receipt__value w-bet-receipt__value--emphasis">{{ formatUsd(payout) }}</dd>
      </div>
    </dl>

    <p class="w-bet-receipt__note">Simulated bet — no real funds are involved.</p>
  </div>
</template>

<style scoped>
.w-bet-receipt {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  color: var(--color-text-body);
  background: var(--color-success-surface);
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-lg);
}

.w-bet-receipt--unsaved {
  background: var(--color-warning-surface);
  border-color: var(--color-warning-border);
}

.w-bet-receipt__unsaved-title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-warning-text);
}

.w-bet-receipt__unsaved-body {
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-body);
}

.w-bet-receipt__head {
  display: flex;
}

.w-bet-receipt__question {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-snug);
  color: var(--color-text-heading);
}

.w-bet-receipt__grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.w-bet-receipt__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
}

.w-bet-receipt__term {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.w-bet-receipt__value {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-strong);
  font-variant-numeric: tabular-nums;
}

.w-bet-receipt__value--emphasis {
  font-weight: var(--font-weight-bold);
  color: var(--color-success-text);
}

.w-bet-receipt__note {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
