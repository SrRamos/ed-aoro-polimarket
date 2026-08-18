<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BetOrder, BuilderConfig } from '../../models/bet'
import { formatCurrency, formatPercent } from '../../lib/format'
import SJInput from '../ui/SJInput.vue'
import SJButton from '../ui/SJButton.vue'

/**
 * Bet form (design.md §3.2, AC5.1–AC5.9). The "Amount (USD)" the user enters
 * IS what they pay: cost = amount, shares = amount / price, and
 * "To win" = shares × $1 = amount / price (Polymarket's real Buy panel).
 * The summary mirrors Polymarket — a prominent "To win" plus "Avg. Price XX¢";
 * the builder/platform fee is still computed and recorded on the receipt
 * (builder-aware data), it is just no longer surfaced in this UI.
 * Sticky CTA on mobile (NFR-MF-4); amount validated via :user-invalid.
 */
type WBetFormProps = {
  marketId: string
  tokenId: string | null
  outcome: string | null
  price: number | null
  disabled?: boolean
  submitting?: boolean
  builderConfig: BuilderConfig
  maxAmount?: number
}
const props = withDefaults(defineProps<WBetFormProps>(), {
  disabled: false,
  submitting: false,
  maxAmount: 100000,
})

type WBetFormEmits = { place: [order: BetOrder] }
const emit = defineEmits<WBetFormEmits>()

const amount = ref('')
const attempted = ref(false)

/**
 * Polymarket-style quick-add chips. Each button *increments* (never replaces)
 * the current stake, then flows through the same reactive pipeline as typing,
 * so shares and "To win" recompute live.
 */
const QUICK_ADD = [1, 5, 10, 100] as const

function addAmount(delta: number) {
  const current = Number.parseFloat(amountText.value)
  const base = Number.isFinite(current) ? current : 0
  // toFixed(2) trims binary float artifacts (e.g. 0.1 + 0.2); Number drops the
  // trailing zeros so "5.00" reads back as "5".
  amount.value = String(Number((base + delta).toFixed(2)))
}

// Amount is a text input (inputmode="decimal") so the v-model stays a string
// and is parsed explicitly. Normalize defensively so `.trim()` never throws.
const amountText = computed(() => (amount.value == null ? '' : String(amount.value)))

const size = computed(() => Number.parseFloat(amountText.value))
const sizeValid = computed(
  () => Number.isFinite(size.value) && size.value > 0 && size.value <= props.maxAmount,
)
const hasOutcome = computed(() => !!props.outcome && props.price != null)

// cost = the stake amount the user enters (NOT amount × price) — the dollars
// they pay. shares = amount / price; "To win" = shares × $1 = amount / price.
const shares = computed(() =>
  hasOutcome.value && sizeValid.value && props.price ? size.value / props.price : 0,
)
const payout = computed(() => shares.value * 1)

// Avg. Price in cents, Polymarket-style: 0.60 → "60", 0.335 → "33.5".
const avgPriceCents = computed(() => {
  const cents = (props.price ?? 0) * 100
  return Number.isInteger(cents) ? String(cents) : cents.toFixed(1)
})

const amountError = computed(() => {
  if (!attempted.value && amountText.value === '') return ''
  if (amountText.value.trim() === '') return 'Enter an amount to bet.'
  if (!Number.isFinite(size.value)) return 'Amount must be a number.'
  if (size.value <= 0) return 'Amount must be greater than $0.'
  if (size.value > props.maxAmount) return `Amount can’t exceed ${formatCurrency(props.maxAmount)}.`
  return ''
})

const canSubmit = computed(
  () => !props.disabled && !props.submitting && hasOutcome.value && sizeValid.value,
)

function submit() {
  attempted.value = true
  if (!canSubmit.value || !props.tokenId || !props.outcome || props.price == null) return
  emit('place', {
    marketId: props.marketId,
    tokenId: props.tokenId,
    outcome: props.outcome,
    side: 'BUY',
    size: size.value,
    price: props.price,
  })
}

/** Expose a reset so the parent can clear the field after a fill. */
defineExpose({
  reset() {
    amount.value = ''
    attempted.value = false
  },
})
</script>

<template>
  <form class="bf" novalidate @submit.prevent="submit">
    <!-- Closed market notice — reason conveyed by text (AC4.5). -->
    <p v-if="disabled" class="bf__closed" role="note">
      <span aria-hidden="true">🔒</span> This market is closed. Betting is disabled.
    </p>

    <!-- No outcome selected (AC5.5). -->
    <p v-else-if="!hasOutcome" class="bf__hint">Select an outcome above to build your bet.</p>

    <template v-if="!disabled && hasOutcome">
      <div class="bf__selected">
        Betting on
        <strong>{{ outcome }}</strong>
        at
        <strong>{{ formatPercent(price ?? 0) }}</strong>
        <span class="bf__selected-note">(snapshot price)</span>
      </div>

      <SJInput
        v-model="amount"
        label="Amount (USD)"
        type="text"
        inputmode="decimal"
        prefix="$"
        placeholder="0.00"
        required
        :error="amountError"
        help="How much you want to stake on this outcome."
      />

      <!-- Quick-add chips — increment the stake (Polymarket "Buy" panel). -->
      <div class="bf__chips" role="group" aria-label="Add to amount">
        <button
          v-for="q in QUICK_ADD"
          :key="q"
          type="button"
          class="bf__chip"
          :aria-label="`Add $${q}`"
          @click="addAmount(q)"
        >
          +${{ q }}
        </button>
      </div>

      <!-- Polymarket-style payout summary: prominent "To win" + "Avg. Price XX¢"
           (AC5.3). The stake the user enters is what they pay; the fee is still
           recorded on the receipt but not shown here (AC5.8). -->
      <div class="bf__payout">
        <dl class="bf__payout-line">
          <dt class="bf__payout-label">To win</dt>
          <dd class="bf__payout-value">{{ formatCurrency(payout) }}</dd>
        </dl>
        <p class="bf__payout-avg">Avg. Price {{ avgPriceCents }}¢</p>
      </div>
    </template>

    <div class="bf__cta">
      <SJButton type="submit" variant="primary" block :disabled="!canSubmit" :loading="submitting">
        {{ submitting ? 'Placing bet…' : 'Place bet' }}
      </SJButton>
    </div>
  </form>
</template>

<style scoped>
.bf {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.bf__closed {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  font-weight: var(--font-weight-medium);
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
}

.bf__hint {
  padding: var(--space-4);
  color: var(--color-text-secondary);
  background: var(--color-surface-secondary);
  border: 1px dashed var(--color-border-light);
  border-radius: var(--radius-md);
}

.bf__selected {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.bf__selected strong {
  color: var(--color-text-heading);
}

.bf__selected-note {
  color: var(--color-text-muted);
}

/* Quick-add chips — DS pill affordance with the SJButton state machinery
   (press-first ::after state-layer, --shadow-focus ring). */
.bf__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.bf__chip {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--space-10);
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--color-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: color var(--duration-fast) var(--easing-out);
}

.bf__chip::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--color-primary);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--easing-out);
}

.bf__chip:active::after {
  opacity: var(--state-pressed);
}

.bf__chip:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.bf__chip:focus-visible::after {
  opacity: var(--state-focus);
}

@media (hover: hover) and (pointer: fine) {
  .bf__chip:hover::after {
    opacity: var(--state-hover);
  }
}

/* Polymarket-style payout block: prominent "To win", small "Avg. Price" below. */
.bf__payout {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
}

.bf__payout-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
  margin: 0;
}

.bf__payout-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.bf__payout-value {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--color-primary-dark);
}

.bf__payout-avg {
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}

/* Sticky CTA within the thumb zone on mobile (NFR-MF-4). */
.bf__cta {
  position: sticky;
  bottom: 0;
  padding-top: var(--space-3);
  padding-bottom: var(--space-1);
  background: linear-gradient(to top, var(--color-surface), var(--color-surface) 70%, transparent);
}

@media (min-width: 769px) {
  .bf__cta {
    position: static;
    background: none;
  }
}
</style>
