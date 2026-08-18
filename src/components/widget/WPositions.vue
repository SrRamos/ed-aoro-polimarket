<script setup lang="ts">
import type { Position } from '../../models/bet'
import { formatCurrency, formatPercent } from '../../lib/format'
import SJCard from '../ui/SJCard.vue'
import SJBadge from '../ui/SJBadge.vue'
import { outcomeTone } from '../../lib/outcome'

/**
 * Positions list (design.md §3.2, AC6.1–AC6.3). Shows each simulated position
 * with its fee breakdown + builderCode. First-run empty state uses an
 * onboarding tone, distinct from an error (empty-state doctrine).
 */
type WPositionsProps = {
  positions: Position[]
}
defineProps<WPositionsProps>()

function toneFor(outcome: string) {
  return outcomeTone(outcome)
}
</script>

<template>
  <section class="wp" aria-labelledby="wp-heading">
    <h2 id="wp-heading" class="wp__heading">
      Your positions
      <span v-if="positions.length" class="wp__count">({{ positions.length }})</span>
    </h2>

    <!-- First-run empty state (AC6.3) -->
    <SJCard v-if="positions.length === 0">
      <div class="wp__empty">
        <span class="wp__empty-icon" aria-hidden="true">🎟️</span>
        <p class="wp__empty-title">No bets placed yet</p>
        <p class="wp__empty-text">
          Open a market, pick an outcome, and place a simulated bet. Your positions appear here and
          persist across reloads.
        </p>
      </div>
    </SJCard>

    <ul v-else class="wp__list">
      <li v-for="p in positions" :key="p.id">
        <SJCard>
          <article class="pos">
            <header class="pos__head">
              <h3 class="pos__question">{{ p.marketQuestion }}</h3>
              <SJBadge :tone="toneFor(p.outcome)" icon="●">{{ p.outcome }}</SJBadge>
            </header>

            <dl class="pos__grid">
              <div class="pos__item">
                <dt>Size</dt>
                <dd>{{ formatCurrency(p.order.size) }}</dd>
              </div>
              <div class="pos__item">
                <dt>Price</dt>
                <dd>{{ formatPercent(p.order.price) }}</dd>
              </div>
              <div class="pos__item">
                <dt>Cost</dt>
                <dd>{{ formatCurrency(p.receipt.cost) }}</dd>
              </div>
              <div class="pos__item">
                <dt>Shares</dt>
                <dd>{{ p.receipt.shares.toFixed(2) }}</dd>
              </div>
              <div class="pos__item pos__item--accent">
                <dt>Potential payout</dt>
                <dd>{{ formatCurrency(p.receipt.shares) }}</dd>
              </div>
            </dl>

            <div class="pos__fees">
              <span
                >Builder fee ({{ p.receipt.fees.builderBps }} bps):
                {{ formatCurrency(p.receipt.fees.builderFee) }}</span
              >
              <span
                >Platform fee ({{ p.receipt.fees.platformBps }} bps):
                {{ formatCurrency(p.receipt.fees.platformFee) }}</span
              >
              <span class="pos__fees-total">Total: {{ formatCurrency(p.receipt.fees.total) }}</span>
            </div>

            <p class="pos__builder">
              <span class="pos__builder-label">builderCode</span>
              <code :title="p.receipt.builderCode">{{ p.receipt.builderCode }}</code>
            </p>
          </article>
        </SJCard>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.wp {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.wp__heading {
  font-family: var(--font-family-display);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.wp__count {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.wp__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

.wp__empty-icon {
  font-size: var(--font-size-4xl);
}

.wp__empty-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-heading);
}

.wp__empty-text {
  max-width: 46ch;
  color: var(--color-text-secondary);
}

.wp__list {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pos {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.pos__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.pos__question {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-heading);
}

.pos__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3) var(--space-6);
  margin: 0;
}

.pos__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.pos__item dt {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--color-text-secondary);
}

.pos__item dd {
  margin: 0;
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-strong);
}

.pos__item--accent dd {
  color: var(--color-primary-dark);
}

.pos__fees {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  background: var(--color-surface-secondary);
  border-radius: var(--radius-md);
}

.pos__fees-total {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-strong);
}

.pos__builder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.pos__builder-label {
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: var(--font-weight-semibold);
}

.pos__builder code {
  font-family: var(--font-family-alt);
  word-break: break-all;
}

@media (min-width: 769px) {
  .pos__grid {
    grid-template-columns: repeat(5, auto);
  }
}
</style>
