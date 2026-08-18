<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BetOrder, BuilderConfig } from '../../models/bet'
import { computeFees } from '../../lib/fees'
import { formatCurrency, formatPercent } from '../../lib/format'
import SJInput from '../ui/SJInput.vue'
import SJButton from '../ui/SJButton.vue'

/**
 * Bet form (design.md §3.2, AC5.1–AC5.9). cost = size × price,
 * payout = (size/price) × $1, plus the additive builder + platform fee
 * breakdown (fee = notional × bps / 10000) shown BEFORE confirmation.
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

const size = computed(() => Number.parseFloat(amount.value))
const sizeValid = computed(
  () => Number.isFinite(size.value) && size.value > 0 && size.value <= props.maxAmount,
)
const hasOutcome = computed(() => !!props.outcome && props.price != null)

const cost = computed(() =>
  hasOutcome.value && sizeValid.value ? size.value * (props.price ?? 0) : 0,
)
const shares = computed(() =>
  hasOutcome.value && sizeValid.value && props.price ? size.value / props.price : 0,
)
const payout = computed(() => shares.value * 1)

const fees = computed(() => computeFees(cost.value, props.builderConfig, 'taker'))

const amountError = computed(() => {
  if (!attempted.value && amount.value === '') return ''
  if (amount.value.trim() === '') return 'Enter an amount to bet.'
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
        type="number"
        inputmode="decimal"
        prefix="$"
        placeholder="0.00"
        :min="1"
        :max="maxAmount"
        step="1"
        required
        :error="amountError"
        help="How much you want to stake on this outcome."
      />

      <!-- Live cost / payout (AC5.2, AC5.3). -->
      <dl class="bf__summary">
        <div class="bf__row">
          <dt>Cost <span class="bf__formula">(size × price)</span></dt>
          <dd>{{ formatCurrency(cost) }}</dd>
        </div>
        <div class="bf__row">
          <dt>Shares <span class="bf__formula">(size ÷ price)</span></dt>
          <dd>{{ shares.toFixed(2) }}</dd>
        </div>
        <div class="bf__row bf__row--accent">
          <dt>Potential payout <span class="bf__formula">(shares × $1)</span></dt>
          <dd>{{ formatCurrency(payout) }}</dd>
        </div>
      </dl>

      <!-- Fee breakdown before confirmation (AC5.8). -->
      <section class="bf__fees" aria-label="Fee breakdown">
        <h4 class="bf__fees-title">Fee breakdown</h4>
        <dl class="bf__summary">
          <div class="bf__row">
            <dt>Notional</dt>
            <dd>{{ formatCurrency(fees.notional) }}</dd>
          </div>
          <div class="bf__row">
            <dt>
              Builder fee <span class="bf__formula">({{ fees.builderBps }} bps)</span>
            </dt>
            <dd>{{ formatCurrency(fees.builderFee) }}</dd>
          </div>
          <div class="bf__row">
            <dt>
              Platform fee <span class="bf__formula">({{ fees.platformBps }} bps)</span>
            </dt>
            <dd>{{ formatCurrency(fees.platformFee) }}</dd>
          </div>
          <div class="bf__row bf__row--total">
            <dt>Total cost</dt>
            <dd>{{ formatCurrency(fees.total) }}</dd>
          </div>
        </dl>
        <p class="bf__fee-note">
          fee = notional × bps ÷ 10000. Builder and platform fees are additive.
        </p>
      </section>
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

.bf__summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
}

.bf__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
}

.bf__row dt {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.bf__formula {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.bf__row dd {
  margin: 0;
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-strong);
}

.bf__row--accent dd {
  color: var(--color-primary-dark);
  font-size: var(--font-size-lg);
}

.bf__fees {
  padding: var(--space-4);
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
}

.bf__fees-title {
  margin-bottom: var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--color-text-secondary);
}

.bf__row--total {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border-light);
}

.bf__row--total dt,
.bf__row--total dd {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.bf__fee-note {
  margin-top: var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
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
