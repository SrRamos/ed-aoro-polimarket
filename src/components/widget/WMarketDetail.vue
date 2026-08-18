<script setup lang="ts">
import { computed } from 'vue'
import type { Market } from '../../models/market'
import type { BetOrder, BuilderConfig } from '../../models/bet'
import type { AiPrediction } from '../../models/prediction'
import type { ViewStatus } from '../../lib/status'
import { formatCompactCurrency, formatPercent } from '../../lib/format'
import { outcomeTone } from '../../lib/outcome'
import SJModal from '../ui/SJModal.vue'
import SJBadge from '../ui/SJBadge.vue'
import WBetForm from './WBetForm.vue'
import WAiPrediction from './WAiPrediction.vue'

/**
 * Market detail modal (design.md §3.2, AC4.1–AC4.5). Outcomes are selectable
 * radio-style controls whose meaning is carried by text + shape, not color
 * alone. Hosts WBetForm and WAiPrediction. Props-driven; re-emits to the parent.
 */
type WMarketDetailProps = {
  open: boolean
  market: Market | null
  selectedIndex: number | null
  submitting?: boolean
  betError?: string | null
  builderConfig: BuilderConfig
  resetKey?: number
  aiEnabled: boolean
  aiConfigured: boolean
  aiStatus: ViewStatus
  aiPrediction?: AiPrediction | null
  aiSample?: boolean
  aiError?: string | null
}
const props = withDefaults(defineProps<WMarketDetailProps>(), {
  submitting: false,
  betError: null,
  resetKey: 0,
  aiPrediction: null,
  aiSample: false,
  aiError: null,
})

type WMarketDetailEmits = {
  close: []
  'select-outcome': [index: number]
  place: [order: BetOrder]
  'ai-request': []
  'ai-retry': []
}
const emit = defineEmits<WMarketDetailEmits>()

const selectedOutcome = computed(() =>
  props.market != null && props.selectedIndex != null
    ? (props.market.outcomes[props.selectedIndex] ?? null)
    : null,
)
const selectedPrice = computed(() =>
  props.market != null && props.selectedIndex != null
    ? (props.market.prices[props.selectedIndex] ?? null)
    : null,
)
const selectedTokenId = computed(() =>
  props.market != null && props.selectedIndex != null
    ? (props.market.tokenIds[props.selectedIndex] ?? null)
    : null,
)
</script>

<template>
  <SJModal :open="open" :title="market?.question ?? 'Market'" size="lg" @close="emit('close')">
    <div v-if="market" class="md">
      <!-- Meta -->
      <div class="md__meta">
        <SJBadge tone="neutral">{{ market.category }}</SJBadge>
        <SJBadge v-if="market.closed" tone="warning" icon="●">Closed</SJBadge>
        <SJBadge v-else tone="success" icon="●">Open for betting</SJBadge>
        <SJBadge v-if="market.pricingUnreliable" tone="error" icon="⚠">Pricing unreliable</SJBadge>
      </div>

      <dl class="md__stats">
        <div class="md__stat">
          <dt>Volume</dt>
          <dd>{{ formatCompactCurrency(market.volume) }}</dd>
        </div>
        <div class="md__stat">
          <dt>Liquidity</dt>
          <dd>{{ formatCompactCurrency(market.liquidity) }}</dd>
        </div>
      </dl>

      <!-- Outcomes (AC4.1–AC4.3) -->
      <div class="md__outcomes" role="radiogroup" aria-label="Choose an outcome">
        <button
          v-for="(o, i) in market.outcomes"
          :key="o"
          type="button"
          role="radio"
          class="oc-btn"
          :class="[`oc-btn--${outcomeTone(o)}`, { 'oc-btn--selected': selectedIndex === i }]"
          :aria-checked="selectedIndex === i"
          @click="emit('select-outcome', i)"
        >
          <span class="oc-btn__dot" aria-hidden="true" />
          <span class="oc-btn__name">{{ o }}</span>
          <span class="oc-btn__pct">{{ formatPercent(market.prices[i] ?? 0) }}</span>
          <span v-if="selectedIndex === i" class="oc-btn__check" aria-hidden="true">✓</span>
          <span v-if="selectedIndex === i" class="sr-only">Selected</span>
        </button>
      </div>

      <!-- Bet error (AC5.7) -->
      <p v-if="betError" class="md__bet-error" role="alert">
        <span aria-hidden="true">⚠️</span> {{ betError }}
      </p>

      <!-- Bet form (US5) -->
      <WBetForm
        :key="resetKey"
        :market-id="market.id"
        :token-id="selectedTokenId"
        :outcome="selectedOutcome"
        :price="selectedPrice"
        :disabled="market.closed || !market.active"
        :submitting="submitting"
        :builder-config="builderConfig"
        @place="emit('place', $event)"
      />

      <!-- AI outcome suggestion (US7) -->
      <WAiPrediction
        :enabled="aiEnabled"
        :configured="aiConfigured"
        :status="aiStatus"
        :prediction="aiPrediction"
        :sample="aiSample"
        :error-message="aiError ?? undefined"
        @request="emit('ai-request')"
        @retry="emit('ai-retry')"
      />
    </div>
  </SJModal>
</template>

<style scoped>
.md {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.md__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.md__stats {
  display: flex;
  gap: var(--space-8);
  margin: 0;
  padding: var(--space-4);
  background: var(--color-surface-secondary);
  border-radius: var(--radius-md);
}

.md__stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.md__stat dt {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--color-text-secondary);
}

.md__stat dd {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-heading);
}

/* Side-by-side outcomes (Polymarket "Buy" panel). Two columns by default;
   auto-fit lets them wrap to one column only when the panel is very narrow. */
.md__outcomes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--space-3);
}

.oc-btn {
  /* Per-tone SOLID fill — Yes→success-strong, No→error-strong (see outcomeTone).
     The -strong tones are the AA-safe fills for white text (≥3:1); the base
     emerald/red are too light. No borders — the color IS the fill. */
  --oc-fill: var(--color-primary);
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--space-12);
  padding: var(--space-3) var(--space-4);
  font: inherit;
  text-align: left;
  color: var(--color-white);
  background: var(--oc-fill);
  border: 0;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.oc-btn--success {
  --oc-fill: var(--color-success-strong);
}

.oc-btn--error {
  --oc-fill: var(--color-error-strong);
}

/* Dot, label, %, and ✓ all ride the solid fill in white. */
.oc-btn__dot {
  flex: 0 0 auto;
  width: var(--space-3);
  height: var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-white);
}

.oc-btn__name {
  flex: 1 1 auto;
  font-weight: var(--font-weight-semibold);
  color: var(--color-white);
}

.oc-btn__pct {
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--color-white);
}

.oc-btn__check {
  color: var(--color-white);
  font-weight: var(--font-weight-bold);
}

/* Dark scrim mutes the UNSELECTED controls. Darkening the fill only raises the
   white-text contrast, so AA is never at risk; the selected control drops the
   scrim to read as the vivid, active choice. */
.oc-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -2;
  border-radius: inherit;
  background: var(--color-text-heading);
  opacity: var(--state-hover);
  transition: opacity var(--duration-fast) var(--easing-out);
}

.oc-btn--selected::before {
  opacity: 0;
}

/* White state layer: press/focus/hover feedback on the colored fill. */
.oc-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--color-white);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--easing-out);
}

.oc-btn:active::after {
  opacity: var(--state-pressed);
}

.oc-btn:focus-visible::after {
  opacity: var(--state-focus);
}

@media (hover: hover) and (pointer: fine) {
  .oc-btn:hover::after {
    opacity: var(--state-hover);
  }
}

.oc-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

/* Selected: vivid full-strength fill + inset white ring + extra lift, paired
   with the ✓ icon and an sr-only "Selected" — distinguished by shape and
   elevation, never color alone (AC4.2). */
.oc-btn--selected {
  box-shadow:
    var(--shadow-md),
    inset 0 0 0 2px var(--color-white);
}

.oc-btn--selected:focus-visible {
  box-shadow:
    var(--shadow-focus),
    inset 0 0 0 2px var(--color-white);
}

.md__bet-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--color-error-text);
  background: var(--color-error-surface);
  border: 1px solid var(--color-error-border);
  border-radius: var(--radius-md);
}
</style>
