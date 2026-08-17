/**
 * Demo/mock fixtures for the opt-in `VITE_USE_MOCK_DATA` mode (see `config.useMockData`).
 *
 * These are ALREADY-NORMALIZED {@link Market} objects (post-`normalizeMarket`) — the
 * mock adapter hands them straight to the same `Result<Market[]>` seams the real
 * service uses, so no Gamma "gotcha #1" string-encoding is involved here. This module
 * is imported ONLY when the flag is on; the real path never touches it.
 *
 * Coverage (exercises the real UI paths without reaching the geo-blocked API):
 *   - binary Yes/No markets with varied prices (0.71/0.29, 0.52/0.48, 0.05/0.95, …),
 *   - a couple carrying `image` URLs so cards render art,
 *   - realistic volume/liquidity numbers and ISO `endDate`s,
 *   - at least one >2-outcome market (a 4-candidate election) to drive the
 *     neutral-chip path in the UI.
 */
import type { Market } from '../../models/market'
import type { AiPrediction } from '../../models/prediction'

/** The canned model id all mock predictions are attributed to. */
export const MOCK_MODEL_ID = 'mock/demo-analyst:free'

/**
 * 10 realistic normalized markets. All `pricingReliable: true` (clean in-range
 * prices) so the demo never shows the "unreliable pricing" flag by accident.
 */
export const MOCK_MARKETS: readonly Market[] = [
  {
    id: '507081',
    question: 'Will Bitcoin exceed $100,000 by end of 2025?',
    slug: 'bitcoin-above-100k-2025',
    outcomes: ['Yes', 'No'],
    prices: [0.71, 0.29],
    tokenIds: ['71900000000000000001', '28360000000000000002'],
    volume: 12_450_000,
    liquidity: 830_000,
    endDate: '2025-12-31T23:59:59Z',
    image: 'https://placehold.co/96x96/f7931a/ffffff/png?text=BTC',
    active: true,
    closed: false,
    pricingReliable: true,
  },
  {
    id: '512340',
    question: 'Will the Federal Reserve cut rates at the next FOMC meeting?',
    slug: 'fed-rate-cut-next-fomc',
    outcomes: ['Yes', 'No'],
    prices: [0.52, 0.48],
    tokenIds: ['51234000000000000001', '51234000000000000002'],
    volume: 8_900_000,
    liquidity: 610_000,
    endDate: '2026-01-28T19:00:00Z',
    active: true,
    closed: false,
    pricingReliable: true,
  },
  {
    id: '498712',
    question: 'Will SpaceX reach orbit with Starship before July 2026?',
    slug: 'spacex-starship-orbit-jul-2026',
    outcomes: ['Yes', 'No'],
    prices: [0.83, 0.17],
    tokenIds: ['49871000000000000001', '49871000000000000002'],
    volume: 3_120_000,
    liquidity: 245_000,
    endDate: '2026-06-30T23:59:59Z',
    image: 'https://placehold.co/96x96/005288/ffffff/png?text=SPX',
    active: true,
    closed: false,
    pricingReliable: true,
  },
  {
    id: '463201',
    question: 'Will a magnitude 7.0+ earthquake hit California in 2026?',
    slug: 'ca-major-earthquake-2026',
    outcomes: ['Yes', 'No'],
    prices: [0.05, 0.95],
    tokenIds: ['46320000000000000001', '46320000000000000002'],
    volume: 540_000,
    liquidity: 61_000,
    endDate: '2026-12-31T23:59:59Z',
    active: true,
    closed: false,
    pricingReliable: true,
  },
  {
    id: '551009',
    question: 'Will Ethereum flip Bitcoin by market cap in 2026?',
    slug: 'ethereum-flippening-2026',
    outcomes: ['Yes', 'No'],
    prices: [0.11, 0.89],
    tokenIds: ['55100000000000000001', '55100000000000000002'],
    volume: 2_760_000,
    liquidity: 198_000,
    endDate: '2026-12-31T23:59:59Z',
    image: 'https://placehold.co/96x96/627eea/ffffff/png?text=ETH',
    active: true,
    closed: false,
    pricingReliable: true,
  },
  {
    id: '533418',
    question: 'Will the S&P 500 close above 7,000 by end of 2026?',
    slug: 'sp500-above-7000-2026',
    outcomes: ['Yes', 'No'],
    prices: [0.44, 0.56],
    tokenIds: ['53341000000000000001', '53341000000000000002'],
    volume: 6_180_000,
    liquidity: 402_000,
    endDate: '2026-12-31T23:59:59Z',
    active: true,
    closed: false,
    pricingReliable: true,
  },
  {
    id: '571250',
    question: 'Who will win the 2028 U.S. Presidential Election?',
    slug: 'us-president-2028-winner',
    // >2 outcomes — drives the neutral-chip (non-binary) path in the UI.
    outcomes: ['Democratic', 'Republican', 'Independent', 'Other'],
    prices: [0.46, 0.44, 0.07, 0.03],
    tokenIds: [
      '57125000000000000001',
      '57125000000000000002',
      '57125000000000000003',
      '57125000000000000004',
    ],
    volume: 21_300_000,
    liquidity: 1_540_000,
    endDate: '2028-11-07T23:59:59Z',
    image: 'https://placehold.co/96x96/6c5ce7/ffffff/png?text=USA',
    active: true,
    closed: false,
    pricingReliable: true,
  },
  {
    id: '564872',
    question: 'Will OpenAI release GPT-6 before 2027?',
    slug: 'openai-gpt6-before-2027',
    outcomes: ['Yes', 'No'],
    prices: [0.38, 0.62],
    tokenIds: ['56487000000000000001', '56487000000000000002'],
    volume: 4_050_000,
    liquidity: 288_000,
    endDate: '2026-12-31T23:59:59Z',
    active: true,
    closed: false,
    pricingReliable: true,
  },
  {
    id: '509931',
    question: 'Will Manchester City win the 2026-27 Premier League?',
    slug: 'man-city-premier-league-2026-27',
    outcomes: ['Yes', 'No'],
    prices: [0.34, 0.66],
    tokenIds: ['50993000000000000001', '50993000000000000002'],
    volume: 1_890_000,
    liquidity: 152_000,
    endDate: '2027-05-23T23:59:59Z',
    active: true,
    closed: false,
    pricingReliable: true,
  },
  {
    id: '588014',
    question: 'Will global average temperature set a new record in 2026?',
    slug: 'global-temp-record-2026',
    outcomes: ['Yes', 'No'],
    prices: [0.68, 0.32],
    tokenIds: ['58801000000000000001', '58801000000000000002'],
    volume: 970_000,
    liquidity: 88_000,
    endDate: '2026-12-31T23:59:59Z',
    active: true,
    closed: false,
    pricingReliable: true,
  },
]

/**
 * Build a canned {@link AiPrediction} for a market, derived deterministically from
 * its own prices/liquidity. Honors the same validation contract the real service
 * enforces (`recommendedOutcome` ∈ `outcomes`, `confidence` ∈ [0,1]) so the mock
 * output is indistinguishable in shape from a validated model response.
 */
export function mockPrediction(market: Market): AiPrediction {
  // Recommend the highest-priced (market-implied most-likely) outcome.
  let bestIndex = 0
  for (let i = 1; i < market.prices.length; i++) {
    if ((market.prices[i] ?? 0) > (market.prices[bestIndex] ?? 0)) bestIndex = i
  }
  const recommendedOutcome = market.outcomes[bestIndex] ?? market.outcomes[0] ?? 'Yes'
  const topPrice = market.prices[bestIndex] ?? 0

  // Confidence: how decisive the leading price is, nudged up by deep liquidity.
  const decisiveness = Math.abs(topPrice - 0.5) * 2 // 0 (coin-flip) → 1 (certain)
  const liquidityBoost = Math.min(0.15, market.liquidity / 5_000_000)
  const confidence = Math.min(1, Math.max(0, 0.4 + decisiveness * 0.5 + liquidityBoost))

  const pct = Math.round(topPrice * 100)
  const rationale =
    `Demo analysis: the market implies "${recommendedOutcome}" at ${pct}%, the leading outcome. ` +
    `With ${Math.round(market.volume).toLocaleString('en-US')} in volume and ` +
    `${Math.round(market.liquidity).toLocaleString('en-US')} in liquidity, the pricing is ` +
    `${liquidityBoost > 0.1 ? 'well-supported' : 'moderately thin'}, so confidence is scaled accordingly. ` +
    `This is illustrative mock output, not financial advice.`

  return {
    recommendedOutcome,
    confidence: Math.round(confidence * 100) / 100,
    rationale,
    modelId: MOCK_MODEL_ID,
  }
}
