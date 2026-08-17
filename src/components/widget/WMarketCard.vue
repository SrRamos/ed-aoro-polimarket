<script setup lang="ts">
/**
 * WMarketCard (T602 · AC3.1–AC3.5, NFR-INTL-1, NFR-MF-5, T7, C3, C14) — one
 * market rendered as a whole interactive card.
 *
 * - Composes `SJCard interactive`, which renders a real `<button>`, so Enter/Space
 *   activation and focus come from the platform (no synthetic key handling). A
 *   click/keyboard activation emits `select` → the parent opens the detail.
 * - Outcomes show label + implied-probability % via `SJProgressBar` (fill by
 *   `transform: scaleX`, bar `aria-hidden`, the numeric label carries the meaning
 *   — C14) plus an `SJBadge`. Meaning is never carried by color alone: every row
 *   has its label text and formatted %.
 * - Volume / liquidity / close date go through `utils/format.ts` (NFR-INTL-1).
 * - The market image reserves its box via `aspect-ratio` (zero CLS — T7), loads
 *   `lazy` + decodes `async` (cards live below the fold), and falls back to a
 *   sized placeholder on a broken URL so the layout never shifts.
 */
import { computed, ref } from 'vue'
import type { Market } from '../../models/market'
import { formatEndDate, formatPercent, formatUsdCompact } from '../../utils/format'
import SJCard from '../ui/SJCard.vue'
import SJBadge from '../ui/SJBadge.vue'
import SJProgressBar from '../ui/SJProgressBar.vue'

const props = defineProps<{ market: Market }>()

const emit = defineEmits<{ (e: 'select', market: Market): void }>()

/** Cap the outcome rows so a many-legged market stays a tidy card. */
const MAX_ROWS = 3

const rows = computed(() =>
  props.market.outcomes.slice(0, MAX_ROWS).map((label, i) => ({
    label,
    // `prices[i]` is positionally aligned with `outcomes[i]` (AC1.2); guard the
    // short-array case (noUncheckedIndexedAccess) so we never render NaN.
    price: props.market.prices[i] ?? 0,
  })),
)

const extraOutcomes = computed(() => Math.max(0, props.market.outcomes.length - MAX_ROWS))

const imageFailed = ref(false)
const showImage = computed(() => Boolean(props.market.image) && !imageFailed.value)

function onImageError(): void {
  imageFailed.value = true
}
</script>

<template>
  <SJCard interactive class="w-market-card" @click="emit('select', market)">
    <span class="w-market-card__media" aria-hidden="true">
      <img
        v-if="showImage"
        :src="market.image"
        alt=""
        class="w-market-card__image"
        loading="lazy"
        decoding="async"
        @error="onImageError"
      />
      <span v-else class="w-market-card__image w-market-card__image--fallback">
        <span class="w-market-card__fallback-glyph">◆</span>
      </span>
    </span>

    <span class="w-market-card__body">
      <span class="w-market-card__question">{{ market.question }}</span>

      <span v-if="!market.pricingReliable" class="w-market-card__flag">
        <SJBadge variant="warning">Pricing unreliable</SJBadge>
      </span>

      <span class="w-market-card__outcomes">
        <span v-for="row in rows" :key="row.label" class="w-market-card__outcome">
          <span class="w-market-card__outcome-head">
            <SJBadge variant="neutral">{{ row.label }}</SJBadge>
            <span class="w-market-card__pct">{{ formatPercent(row.price) }}</span>
          </span>
          <SJProgressBar :value="row.price" tone="neutral" />
        </span>
        <span v-if="extraOutcomes > 0" class="w-market-card__more-outcomes">
          +{{ extraOutcomes }} more outcome{{ extraOutcomes === 1 ? '' : 's' }}
        </span>
      </span>

      <span class="w-market-card__meta">
        <span class="w-market-card__meta-item">Vol {{ formatUsdCompact(market.volume) }}</span>
        <span class="w-market-card__meta-item">Liq {{ formatUsdCompact(market.liquidity) }}</span>
        <span class="w-market-card__meta-item">Ends {{ formatEndDate(market.endDate) }}</span>
      </span>
    </span>
  </SJCard>
</template>

<style scoped>
.w-market-card {
  /* Layout the interactive card (a <button>) as a vertical stack. */
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  height: 100%;
}

.w-market-card__media {
  display: block;
}

.w-market-card__image {
  display: block;
  width: 100%;
  /* Reserve the box before load → zero CLS (T7). */
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--radius-md);
  background: var(--color-surface-hover);
}

.w-market-card__image--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: var(--color-surface-secondary);
}

.w-market-card__fallback-glyph {
  font-size: var(--font-size-xl);
}

.w-market-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.w-market-card__question {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-snug);
  color: var(--color-text-heading);
}

.w-market-card__flag {
  display: flex;
}

.w-market-card__outcomes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.w-market-card__outcome {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.w-market-card__outcome-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.w-market-card__pct {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
  font-variant-numeric: tabular-nums;
}

.w-market-card__more-outcomes {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.w-market-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.w-market-card__meta-item {
  font-variant-numeric: tabular-nums;
}
</style>
