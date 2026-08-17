<script setup lang="ts">
/**
 * WMarketDetailBody (T603 · AC4.1/AC4.2/AC4.5/AC4.6 · NFR-INTL-1 · NFR-A11Y-2) —
 * the shared inner content of a market detail, rendered identically whether the
 * detail is presented as a mobile sheet/modal or an inline two-pane panel.
 *
 * It is a pure composition (WMarketDetail owns the responsive chrome):
 *   - META: volume / liquidity / close date via `utils/format.ts` (NFR-INTL-1).
 *   - CLOSED/INACTIVE NOTICE: a text reason (never colour alone) when the market
 *     is not open for betting (AC4.5); WBetForm additionally disables the CTA.
 *   - OUTCOMES OVERVIEW: every outcome with its label + implied-probability % and
 *     a proportional bar (`SJProgressBar`, `aria-hidden`; the numeric label carries
 *     the meaning — SC 1.4.1). Neutral chips throughout, so a >2-outcome market is
 *     never forced into a Yes/No framing (AC4.6). The *selectable* triad/neutral
 *     controls live in WBetForm.
 *   - BET FORM: `WBetForm` bound to `outcomeIndex` (selection drives the bet, AC4.3).
 *   - AI: `WAiPrediction` opt-in, bubbling `open-settings` up (US7).
 *
 * Services/controllers are injectable so the assembled flow needs no live network.
 */
import { computed } from 'vue'
import type { Market } from '../../models/market'
import type { BetReceipt } from '../../models/bet'
import type { BettingService } from '../../services/betting.service'
import type { RecordBetParams } from '../../stores/bets.store'
import type { UseAiPrediction } from '../../composables/useAiPrediction'
import { formatEndDate, formatPercent, formatUsdCompact } from '../../utils/format'
import SJBadge from '../ui/SJBadge.vue'
import SJProgressBar from '../ui/SJProgressBar.vue'
import WBetForm from './WBetForm.vue'
import WAiPrediction from './WAiPrediction.vue'

interface BetsRecorder {
  recordFilledBet(params: RecordBetParams): boolean
}

const props = defineProps<{
  market: Market
  /** Forwarded to WBetForm (defaults there to the mock service / bets store). */
  bettingService?: BettingService
  betsRecorder?: BetsRecorder
  /** Forwarded to WAiPrediction (defaults there to `useAiPrediction()`). */
  aiController?: UseAiPrediction
}>()

const emit = defineEmits<{
  (e: 'open-settings'): void
  (e: 'filled', payload: { receipt: BetReceipt; persisted: boolean }): void
}>()

/** Selection is shared with the store (AC4.3) — bindable, defaults standalone. */
const outcomeIndex = defineModel<number | null>('outcomeIndex', { default: null })

/** Not open for betting when the market is closed or no longer active (AC4.5). */
const notOpen = computed(() => props.market.closed || !props.market.active)

const rows = computed(() =>
  props.market.outcomes.map((label, i) => ({
    label,
    // `prices[i]` is positionally aligned with `outcomes[i]` (AC1.2); guard the
    // short-array case (noUncheckedIndexedAccess) so we never render NaN.
    price: props.market.prices[i] ?? 0,
  })),
)
</script>

<template>
  <div class="w-market-detail-body">
    <!-- Closed / inactive: a text reason, never colour alone (AC4.5). -->
    <p v-if="notOpen" class="w-market-detail-body__closed" role="status">
      This market is closed — it is no longer open for betting.
    </p>

    <p v-if="!market.pricingReliable" class="w-market-detail-body__flag">
      <SJBadge variant="warning">Pricing unreliable</SJBadge>
    </p>

    <dl class="w-market-detail-body__meta">
      <div class="w-market-detail-body__meta-item">
        <dt class="w-market-detail-body__meta-term">Volume</dt>
        <dd class="w-market-detail-body__meta-value">{{ formatUsdCompact(market.volume) }}</dd>
      </div>
      <div class="w-market-detail-body__meta-item">
        <dt class="w-market-detail-body__meta-term">Liquidity</dt>
        <dd class="w-market-detail-body__meta-value">{{ formatUsdCompact(market.liquidity) }}</dd>
      </div>
      <div class="w-market-detail-body__meta-item">
        <dt class="w-market-detail-body__meta-term">Closes</dt>
        <dd class="w-market-detail-body__meta-value">{{ formatEndDate(market.endDate) }}</dd>
      </div>
    </dl>

    <!-- Outcomes overview: label + % + proportional bar (numeric label carries the
         meaning; neutral chips so >2 outcomes stay generic — AC4.2/AC4.6). -->
    <section class="w-market-detail-body__outcomes" aria-labelledby="w-market-detail-outcomes">
      <h3 id="w-market-detail-outcomes" class="w-market-detail-body__outcomes-title">Outcomes</h3>
      <ul class="w-market-detail-body__outcome-list">
        <li v-for="row in rows" :key="row.label" class="w-market-detail-body__outcome">
          <span class="w-market-detail-body__outcome-head">
            <SJBadge variant="neutral">{{ row.label }}</SJBadge>
            <span class="w-market-detail-body__pct">{{ formatPercent(row.price) }}</span>
          </span>
          <SJProgressBar :value="row.price" tone="neutral" />
        </li>
      </ul>
    </section>

    <!-- Selection drives the bet form against that outcome + its price (AC4.3). -->
    <WBetForm
      v-model:outcome-index="outcomeIndex"
      :market="market"
      :betting-service="bettingService"
      :bets-recorder="betsRecorder"
      @filled="emit('filled', $event)"
    />

    <!-- Opt-in AI suggestion; open-settings bubbles to the app shell (US7). -->
    <WAiPrediction
      :market="market"
      :controller="aiController"
      @open-settings="emit('open-settings')"
    />
  </div>
</template>

<style scoped>
.w-market-detail-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.w-market-detail-body__closed {
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  line-height: var(--leading-normal);
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
}

.w-market-detail-body__flag {
  display: flex;
}

.w-market-detail-body__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-8);
  margin: 0;
}

.w-market-detail-body__meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.w-market-detail-body__meta-term {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.w-market-detail-body__meta-value {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
  font-variant-numeric: tabular-nums;
}

.w-market-detail-body__outcomes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.w-market-detail-body__outcomes-title {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-heading);
}

.w-market-detail-body__outcome-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.w-market-detail-body__outcome {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.w-market-detail-body__outcome-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.w-market-detail-body__pct {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
  font-variant-numeric: tabular-nums;
}
</style>
