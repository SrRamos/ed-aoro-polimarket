<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Market } from './models/market'
import type { BetOrder, Position } from './models/bet'
import type { AiPrediction, AiMarketPick } from './models/prediction'
import type { ViewStatus } from './lib/status'
import {
  MARKETS,
  DEFAULT_MARKETS,
  AI_PREDICTIONS,
  AI_MARKET_PICK,
} from './fixtures/markets'
import { computeFees, DEMO_BUILDER_CONFIG } from './lib/fees'
import WMarketSearch from './components/widget/WMarketSearch.vue'
import WMarketList from './components/widget/WMarketList.vue'
import WMarketDetail from './components/widget/WMarketDetail.vue'
import WPositions from './components/widget/WPositions.vue'
import WAiMarketPick from './components/widget/WAiMarketPick.vue'
import WBetReceipt from './components/widget/WBetReceipt.vue'
import WSettings from './components/widget/WSettings.vue'
import SJButton from './components/ui/SJButton.vue'

/* ---------------------------------------------------------------- *
 * All state below is driven from fixtures — no network, no SDK.
 * Components are props-driven so a real store/service layer can be
 * injected later without rewriting them.
 * ---------------------------------------------------------------- */

const builderConfig = DEMO_BUILDER_CONFIG

/* --- Dev demo controls (audit aid; kept out of the main look) --- */
type DemoState = 'auto' | 'loading' | 'empty' | 'error'
const demoState = ref<DemoState>('auto')
const forceAiError = ref(false)

/* --- Search / browse --- */
const query = ref('')
const activeQuery = ref('')
const listStatus = ref<ViewStatus>('loading')
let loadTimer: ReturnType<typeof setTimeout> | undefined

const filteredMarkets = computed<Market[]>(() => {
  const q = activeQuery.value.trim().toLowerCase()
  if (!q) return DEFAULT_MARKETS
  return MARKETS.filter(
    (m) =>
      m.question.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.outcomes.some((o) => o.toLowerCase().includes(q)),
  )
})

const displayedMarkets = computed<Market[]>(() =>
  listStatus.value === 'success' ? filteredMarkets.value : [],
)

const listHeading = computed(() =>
  activeQuery.value.trim() ? 'Search results' : 'Top markets by volume',
)
const listEmptyMessage = computed(() =>
  activeQuery.value.trim()
    ? `No markets matched “${activeQuery.value.trim()}”. Try another term or clear the search.`
    : 'No active markets right now. Check back soon.',
)

function runLoad() {
  if (loadTimer) clearTimeout(loadTimer)
  // Dev override wins so the auditor can inspect each state.
  const override = demoState.value
  if (override !== 'auto') {
    listStatus.value = 'loading'
    loadTimer = setTimeout(() => {
      listStatus.value = override
    }, 450)
    return
  }
  listStatus.value = 'loading'
  loadTimer = setTimeout(() => {
    listStatus.value = filteredMarkets.value.length ? 'success' : 'empty'
  }, 450)
}

function onSearch(q: string) {
  activeQuery.value = q
  runLoad()
}

/* --- Detail / outcome selection --- */
const detailOpen = ref(false)
const selectedMarket = ref<Market | null>(null)
const selectedIndex = ref<number | null>(null)
const betFormResetKey = ref(0)

function selectMarket(market: Market) {
  selectedMarket.value = market
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

/* --- Bet placement (simulated) --- */
const submitting = ref(false)
const betError = ref<string | null>(null)
const positions = ref<Position[]>([])
let betTimer: ReturnType<typeof setTimeout> | undefined

/* --- Receipt toast --- */
const receiptVisible = ref(false)
const receiptOutcome = ref('')
const receiptSize = ref(0)
const receiptTotal = ref(0)
const receiptTx = ref('')
let receiptTimer: ReturnType<typeof setTimeout> | undefined

function placeBet(order: BetOrder) {
  submitting.value = true
  betError.value = null
  if (betTimer) clearTimeout(betTimer)
  betTimer = setTimeout(() => {
    submitting.value = false
    const market = selectedMarket.value
    if (!market) return
    const cost = order.size * order.price
    const fees = computeFees(cost, builderConfig, 'taker')
    const shares = order.price > 0 ? order.size / order.price : 0
    const txHash = `mock-0x${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`
    const position: Position = {
      id: `${market.id}-${Date.now()}`,
      marketId: market.id,
      marketQuestion: market.question,
      outcome: order.outcome,
      order,
      receipt: {
        status: 'filled',
        avgPrice: order.price,
        shares,
        cost,
        fees,
        builderCode: builderConfig.builderCode,
        txHash,
        filledAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    }
    positions.value = [position, ...positions.value]

    // Surface the receipt toast + reset the form, then close the detail.
    receiptOutcome.value = order.outcome
    receiptSize.value = order.size
    receiptTotal.value = fees.total
    receiptTx.value = txHash
    receiptVisible.value = true
    if (receiptTimer) clearTimeout(receiptTimer)
    receiptTimer = setTimeout(() => (receiptVisible.value = false), 6000)

    betFormResetKey.value += 1
    detailOpen.value = false
  }, 650)
}

function dismissReceipt() {
  receiptVisible.value = false
  if (receiptTimer) clearTimeout(receiptTimer)
}

/* --- AI outcome suggestion (US7) --- */
const aiStatus = ref<ViewStatus>('idle')
const aiPrediction = ref<AiPrediction | null>(null)
const aiError = ref<string | null>(null)
let aiTimer: ReturnType<typeof setTimeout> | undefined

function requestAiPrediction() {
  const market = selectedMarket.value
  if (!market || !hasKey.value) return
  aiStatus.value = 'loading'
  aiError.value = null
  if (aiTimer) clearTimeout(aiTimer)
  aiTimer = setTimeout(() => {
    if (forceAiError.value) {
      aiError.value = 'The model was rate-limited (HTTP 429). Please retry.'
      aiStatus.value = 'error'
      return
    }
    aiPrediction.value =
      AI_PREDICTIONS[market.id] ?? {
        recommendedOutcome: market.outcomes[0] ?? '',
        confidence: 0.5,
        rationale: 'Insufficient signal; treat as a coin flip.',
      }
    aiStatus.value = 'success'
  }, 750)
}

/* --- AI market pick (US9) --- */
const ampStatus = ref<ViewStatus>('idle')
const ampPick = ref<AiMarketPick | null>(null)
const ampError = ref<string | null>(null)
let ampTimer: ReturnType<typeof setTimeout> | undefined

const recommendedMarketId = computed(() =>
  ampStatus.value === 'success' && ampPick.value
    ? ampPick.value.recommendedMarketId
    : null,
)
const recommendedQuestion = computed(() => {
  const id = recommendedMarketId.value
  return id ? (MARKETS.find((m) => m.id === id)?.question ?? null) : null
})

function requestAiMarketPick() {
  if (!hasKey.value) return
  ampStatus.value = 'loading'
  ampError.value = null
  if (ampTimer) clearTimeout(ampTimer)
  ampTimer = setTimeout(() => {
    if (forceAiError.value) {
      ampError.value = 'The model was rate-limited (HTTP 429). Please retry.'
      ampStatus.value = 'error'
      return
    }
    const ids = displayedMarkets.value.map((m) => m.id)
    const chosenId = ids.includes(AI_MARKET_PICK.recommendedMarketId)
      ? AI_MARKET_PICK.recommendedMarketId
      : (ids[0] ?? AI_MARKET_PICK.recommendedMarketId)
    ampPick.value = { ...AI_MARKET_PICK, recommendedMarketId: chosenId }
    ampStatus.value = 'success'
  }, 750)
}

function dismissAmp() {
  ampStatus.value = 'idle'
  ampPick.value = null
  ampError.value = null
}

/* --- Settings / AI key (in-memory; store persistence is out of UI scope) --- */
const settingsOpen = ref(false)
const apiKey = ref<string | null>(null)
const hasKey = computed(() => !!apiKey.value)

function openSettings() {
  settingsOpen.value = true
}
function openSettingsFromDetail() {
  detailOpen.value = false
  settingsOpen.value = true
}
function saveKey(key: string) {
  apiKey.value = key || null
  settingsOpen.value = false
}
function clearKey() {
  apiKey.value = null
  // Reset AI states that depended on the key.
  aiStatus.value = 'idle'
  aiPrediction.value = null
  dismissAmp()
}

/* --- Lifecycle --- */
onMounted(runLoad)
onBeforeUnmount(() => {
  ;[loadTimer, betTimer, receiptTimer, aiTimer, ampTimer].forEach(
    (t) => t && clearTimeout(t),
  )
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
            Search prediction markets, place a builder-aware simulated bet, and
            track positions.
          </p>
        </div>
      </div>

      <div class="app__actions">
        <span
          class="app__ai-flag"
          :class="hasKey ? 'app__ai-flag--on' : 'app__ai-flag--off'"
        >
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
          <select
            id="demo-state"
            v-model="demoState"
            class="demo__select"
            @change="runLoad"
          >
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

      <WMarketList
        :markets="displayedMarkets"
        :status="listStatus"
        :heading="listHeading"
        :empty-message="listEmptyMessage"
        error-message="Couldn’t reach the markets service. Check your connection and retry."
        :recommended-market-id="recommendedMarketId"
        @select="selectMarket"
        @retry="runLoad"
      />

      <WPositions :positions="positions" />
    </main>

    <footer class="app__footer">
      <p>
        Demo build · market data is fixture data · bets are simulated (mock
        <code>BettingService</code>). Not financial advice.
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
    :api-key="apiKey"
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
