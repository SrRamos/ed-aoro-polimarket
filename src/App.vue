<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { Market } from './models/market'
import type { BetOrder } from './models/bet'
import type { AiPrediction, AiMarketPick } from './models/prediction'
import type { ViewStatus } from './lib/status'
import { useMarketsStore } from './stores/markets.store'
import { useBetsStore } from './stores/bets.store'
import { useSettingsStore } from './stores/settings.store'
import { getBuilderConfig } from './config/builder.config'
import { predictOutcome, recommendMarket } from './services/openrouter.service'
import WMarketSearch from './components/widget/WMarketSearch.vue'
import WMarketList from './components/widget/WMarketList.vue'
import WMarketDetail from './components/widget/WMarketDetail.vue'
import WPositions from './components/widget/WPositions.vue'
import WAiMarketPick from './components/widget/WAiMarketPick.vue'
import WBetReceipt from './components/widget/WBetReceipt.vue'
import WSettings from './components/widget/WSettings.vue'
import SJButton from './components/ui/SJButton.vue'
import SJBadge from './components/ui/SJBadge.vue'

/* ---------------------------------------------------------------- *
 * Wave 2: betting and AI are now REAL services behind Pinia stores.
 *  - Market data → markets store (real Gamma read, fixture fallback).
 *  - Betting → bets store → MockBettingService (builder-aware), positions
 *    persisted to localStorage.
 *  - AI → openrouter.service (REAL OpenRouter call, gated by the user key).
 *  - Settings/key → settings store, persisted to localStorage.
 * Widgets keep the same props/events — only the wiring changed.
 * ---------------------------------------------------------------- */

const marketsStore = useMarketsStore()
const betsStore = useBetsStore()
const settingsStore = useSettingsStore()
const { usingFallback } = storeToRefs(marketsStore)
const { positions } = storeToRefs(betsStore)
const { openRouterKey } = storeToRefs(settingsStore)

/** Builder/fee config resolved from env/settings (placeholder default). */
const builderConfig = computed(() =>
  getBuilderConfig(
    settingsStore.builderCodeOverride
      ? { builderCode: settingsStore.builderCodeOverride }
      : undefined,
  ),
)

/* --- Dev demo controls (audit aid; kept out of the main look) --- */
type DemoState = 'auto' | 'loading' | 'empty' | 'error'
const demoState = ref<DemoState>('auto')
const forceAiError = ref(false)

/* --- Search / browse (driven by the store) --- */
const query = ref('')

// Dev override still wins so the auditor can inspect each state.
const listStatus = computed<ViewStatus>(() =>
  demoState.value !== 'auto' ? demoState.value : marketsStore.listStatus,
)

const displayedMarkets = computed<Market[]>(() =>
  listStatus.value === 'success' ? marketsStore.displayedMarkets : [],
)

const activeQuery = computed(() => marketsStore.query)

const listHeading = computed(() =>
  activeQuery.value.trim() ? 'Search results' : 'Top markets by volume',
)
const listEmptyMessage = computed(() =>
  activeQuery.value.trim()
    ? `No markets matched “${activeQuery.value.trim()}”. Try another term or clear the search.`
    : 'No active markets right now. Check back soon.',
)

function onSearch(q: string) {
  marketsStore.search(q)
}

function onRetry() {
  marketsStore.retry()
}

/* --- Detail / outcome selection --- */
const detailOpen = ref(false)
const selectedMarket = ref<Market | null>(null)
const selectedIndex = ref<number | null>(null)
const betFormResetKey = ref(0)

function selectMarket(market: Market) {
  selectedMarket.value = market
  marketsStore.selectMarket(market)
  selectedIndex.value = null
  betError.value = null
  aiStatus.value = 'idle'
  aiPrediction.value = null
  detailOpen.value = true
}

function selectOutcome(index: number) {
  selectedIndex.value = index
  betError.value = null
}

function closeDetail() {
  detailOpen.value = false
}

/* --- Bet placement (real MockBettingService via the bets store) --- */
const submitting = ref(false)
const betError = ref<string | null>(null)

/* --- Receipt toast --- */
const receiptVisible = ref(false)
const receiptOutcome = ref('')
const receiptSize = ref(0)
const receiptTotal = ref(0)
const receiptTx = ref('')
let receiptTimer: ReturnType<typeof setTimeout> | undefined

async function placeBet(order: BetOrder) {
  const market = selectedMarket.value
  if (!market) return
  submitting.value = true
  betError.value = null
  try {
    const position = await betsStore.placeBet(order, {
      marketQuestion: market.question,
    })
    const receipt = position.receipt

    // Surface the receipt toast + reset the form, then close the detail.
    receiptOutcome.value = order.outcome
    receiptSize.value = order.size
    receiptTotal.value = receipt.fees.total
    receiptTx.value = receipt.txHash
    receiptVisible.value = true
    if (receiptTimer) clearTimeout(receiptTimer)
    receiptTimer = setTimeout(() => (receiptVisible.value = false), 6000)

    betFormResetKey.value += 1
    detailOpen.value = false
  } catch (err) {
    // Positions store is left unchanged on failure (AC5.7).
    betError.value =
      err instanceof Error ? err.message : 'The bet could not be placed. Please retry.'
  } finally {
    submitting.value = false
  }
}

function dismissReceipt() {
  receiptVisible.value = false
  if (receiptTimer) clearTimeout(receiptTimer)
}

/* --- AI outcome suggestion (US7) — REAL OpenRouter call, gated by the key --- */
const aiStatus = ref<ViewStatus>('idle')
const aiPrediction = ref<AiPrediction | null>(null)
const aiError = ref<string | null>(null)

async function requestAiPrediction() {
  const market = selectedMarket.value
  const key = openRouterKey.value
  if (!market || !key) return
  aiStatus.value = 'loading'
  aiError.value = null
  aiPrediction.value = null

  // Dev aid: preview the error state without a live model call.
  if (forceAiError.value) {
    aiError.value = 'Forced AI error (dev control). Please retry.'
    aiStatus.value = 'error'
    return
  }

  try {
    aiPrediction.value = await predictOutcome(market, key)
    aiStatus.value = 'success'
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : 'The AI request failed. Please retry.'
    aiStatus.value = 'error'
  }
}

/* --- AI market pick (US9) — REAL OpenRouter call over the visible list --- */
const ampStatus = ref<ViewStatus>('idle')
const ampPick = ref<AiMarketPick | null>(null)
const ampError = ref<string | null>(null)

const recommendedMarketId = computed(() =>
  ampStatus.value === 'success' && ampPick.value ? ampPick.value.recommendedMarketId : null,
)
const recommendedQuestion = computed(() => {
  const id = recommendedMarketId.value
  return id ? (marketsStore.displayedMarkets.find((m) => m.id === id)?.question ?? null) : null
})

async function requestAiMarketPick() {
  const key = openRouterKey.value
  const markets = displayedMarkets.value
  if (!key || markets.length === 0) return
  ampStatus.value = 'loading'
  ampError.value = null
  ampPick.value = null

  if (forceAiError.value) {
    ampError.value = 'Forced AI error (dev control). Please retry.'
    ampStatus.value = 'error'
    return
  }

  try {
    ampPick.value = await recommendMarket(markets, key)
    ampStatus.value = 'success'
  } catch (err) {
    ampError.value = err instanceof Error ? err.message : 'The AI request failed. Please retry.'
    ampStatus.value = 'error'
  }
}

function dismissAmp() {
  ampStatus.value = 'idle'
  ampPick.value = null
  ampError.value = null
}

/* --- Settings / AI key (persisted in the settings store) --- */
const settingsOpen = ref(false)
const hasKey = computed(() => !!openRouterKey.value)

function openSettings() {
  settingsOpen.value = true
}
function openSettingsFromDetail() {
  detailOpen.value = false
  settingsOpen.value = true
}
function saveKey(key: string) {
  settingsStore.saveKey(key)
  settingsOpen.value = false
}
function clearKey() {
  settingsStore.clearKey()
  // Reset AI states that depended on the key.
  aiStatus.value = 'idle'
  aiPrediction.value = null
  aiError.value = null
  dismissAmp()
}

/* --- Lifecycle --- */
onMounted(() => marketsStore.loadDefaultList())
onBeforeUnmount(() => {
  if (receiptTimer) clearTimeout(receiptTimer)
})
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>

  <div class="app">
    <header class="app__header">
      <div class="app__brand">
        <span class="app__logo" aria-hidden="true">◆</span>
        <div>
          <h1 class="app__title">Polymarket Widget</h1>
          <p class="app__tagline">
            Search prediction markets, place a builder-aware simulated bet, and track positions.
          </p>
        </div>
      </div>

      <div class="app__actions">
        <span class="app__ai-flag" :class="hasKey ? 'app__ai-flag--on' : 'app__ai-flag--off'">
          <span aria-hidden="true">{{ hasKey ? '●' : '○' }}</span>
          AI {{ hasKey ? 'on' : 'off' }}
        </span>
        <SJButton variant="secondary" size="sm" @click="openSettings">
          <span aria-hidden="true">⚙</span>&nbsp;Settings
        </SJButton>
      </div>
    </header>

    <!-- Dev demo controls (audit aid) -->
    <details class="demo">
      <summary class="demo__summary">Demo controls (dev)</summary>
      <div class="demo__body">
        <div class="demo__field">
          <label class="demo__label" for="demo-state">List state</label>
          <select id="demo-state" v-model="demoState" class="demo__select">
            <option value="auto">Auto (populated / empty)</option>
            <option value="loading">Loading (skeletons)</option>
            <option value="empty">Empty</option>
            <option value="error">Error + retry</option>
          </select>
        </div>
        <label class="demo__check">
          <input v-model="forceAiError" type="checkbox" />
          Force AI error state
        </label>
      </div>
    </details>

    <main id="main" class="app__main">
      <WMarketSearch v-model:query="query" @search="onSearch" />

      <WAiMarketPick
        :has-key="hasKey"
        :status="ampStatus"
        :pick="ampPick"
        :recommended-question="recommendedQuestion"
        :error-message="ampError ?? undefined"
        @request="requestAiMarketPick"
        @retry="requestAiMarketPick"
        @dismiss="dismissAmp"
        @open-settings="openSettings"
      />

      <p v-if="usingFallback" class="app__fallback" role="status">
        <SJBadge tone="warning" icon="⚠">Sample data</SJBadge>
        <span>Showing sample data — live Polymarket is unreachable right now.</span>
      </p>

      <WMarketList
        :markets="displayedMarkets"
        :status="listStatus"
        :heading="listHeading"
        :empty-message="listEmptyMessage"
        error-message="Couldn’t reach the markets service. Check your connection and retry."
        :recommended-market-id="recommendedMarketId"
        @select="selectMarket"
        @retry="onRetry"
      />

      <WPositions :positions="positions" />
    </main>

    <footer class="app__footer">
      <p>
        Demo build · market data is real (Polymarket Gamma, sample fallback if unreachable) · bets
        are simulated (mock <code>BettingService</code>) · AI is opt-in via your OpenRouter key. Not
        financial advice.
      </p>
    </footer>
  </div>

  <!-- Overlays -->
  <WMarketDetail
    :open="detailOpen"
    :market="selectedMarket"
    :selected-index="selectedIndex"
    :submitting="submitting"
    :bet-error="betError"
    :builder-config="builderConfig"
    :reset-key="betFormResetKey"
    :ai-has-key="hasKey"
    :ai-status="aiStatus"
    :ai-prediction="aiPrediction"
    :ai-error="aiError"
    @close="closeDetail"
    @select-outcome="selectOutcome"
    @place="placeBet"
    @ai-request="requestAiPrediction"
    @ai-retry="requestAiPrediction"
    @open-settings="openSettingsFromDetail"
  />

  <WSettings
    :open="settingsOpen"
    :api-key="openRouterKey"
    @close="settingsOpen = false"
    @save="saveKey"
    @clear="clearKey"
  />

  <WBetReceipt
    :visible="receiptVisible"
    :outcome="receiptOutcome"
    :size="receiptSize"
    :total="receiptTotal"
    :tx-hash="receiptTx"
    @dismiss="dismissReceipt"
  />
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: var(--breakpoint-2xl);
  min-height: 100vh;
  margin: 0 auto;
  padding: var(--space-4);
}

.app__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding-block: var(--space-2);
}

.app__brand {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.app__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--space-10);
  height: var(--space-10);
  font-size: var(--font-size-lg);
  color: var(--color-surface);
  background: var(--color-primary);
  border-radius: var(--radius-md);
}

.app__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--leading-tight);
  color: var(--color-text-heading);
}

.app__tagline {
  max-width: 52ch;
  margin-top: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.app__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.app__ai-flag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-pill);
}

.app__ai-flag--on {
  color: var(--color-success-text);
  background: var(--color-success-surface);
  border: 1px solid var(--color-success-border);
}

.app__ai-flag--off {
  color: var(--color-text-secondary);
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-light);
}

.demo {
  font-size: var(--font-size-sm);
  background: var(--color-surface);
  border: 1px dashed var(--color-border-light);
  border-radius: var(--radius-md);
}

.demo__summary {
  padding: var(--space-2) var(--space-4);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.demo__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border-top: 1px dashed var(--color-border-light);
}

.demo__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.demo__label {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.demo__select {
  min-height: var(--space-10);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-strong);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
}

.demo__select:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.demo__check {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-strong);
}

.app__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  flex: 1 1 auto;
}

.app__fallback {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  margin-bottom: calc(var(--space-6) * -1 + var(--space-2));
  font-size: var(--font-size-sm);
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
}

.app__footer {
  padding-top: var(--space-4);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  border-top: 1px solid var(--color-border-subtle);
}

.app__footer code {
  font-family: var(--font-family-alt);
}

@media (min-width: 769px) {
  .app {
    padding: var(--space-8);
  }

  .app__title {
    font-size: var(--font-size-3xl);
  }
}
</style>
