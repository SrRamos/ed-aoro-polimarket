/**
 * Test fixtures — realistic Polymarket-style markets and canned AI responses.
 * NO network, NO SDK. Everything here is static data the UI is driven from,
 * so real services can later replace these props without a rewrite.
 *
 * `image` uses emoji (CSP-safe, no remote host) per the brief.
 */
import type { Market } from '../models/market'
import type { AiMarketPick, AiPrediction } from '../models/prediction'

/** Deterministic mock token id so aligned arrays stay honest (AC1.2). */
function tokenIds(marketId: string, outcomes: string[]): string[] {
  return outcomes.map((_, i) => `${marketId}-tok-${i}`)
}

interface Seed {
  id: string
  question: string
  slug: string
  category: string
  outcomes: string[]
  prices: number[]
  volume: number
  liquidity: number
  endDate: string | null
  image: string
  active: boolean
  closed: boolean
  pricingUnreliable?: boolean
}

const SEEDS: Seed[] = [
  {
    id: '1',
    question: 'US Presidential Election 2028 — who wins?',
    slug: 'us-presidential-election-2028',
    category: 'Politics',
    outcomes: ['Democratic', 'Republican', 'Independent'],
    prices: [0.47, 0.49, 0.04],
    volume: 184_200_000,
    liquidity: 4_820_000,
    endDate: '2028-11-07T00:00:00Z',
    image: '🇺🇸',
    active: true,
    closed: false,
  },
  {
    id: '2',
    question: 'Will Bitcoin close above $150,000 by Dec 31, 2026?',
    slug: 'bitcoin-above-150k-2026',
    category: 'Crypto',
    outcomes: ['Yes', 'No'],
    prices: [0.38, 0.62],
    volume: 62_400_000,
    liquidity: 1_930_000,
    endDate: '2026-12-31T00:00:00Z',
    image: '₿',
    active: true,
    closed: false,
  },
  {
    id: '3',
    question: 'Will the Fed cut rates at the March 2026 meeting?',
    slug: 'fed-rate-cut-march-2026',
    category: 'Economics',
    outcomes: ['Yes', 'No'],
    prices: [0.71, 0.29],
    volume: 28_900_000,
    liquidity: 980_000,
    endDate: '2026-03-18T00:00:00Z',
    image: '🏦',
    active: true,
    closed: false,
  },
  {
    id: '4',
    question: 'Super Bowl LX — which team lifts the Lombardi?',
    slug: 'super-bowl-lx-winner',
    category: 'Sports',
    outcomes: ['49ers', 'Chiefs', 'Ravens', 'Lions', 'Bills'],
    prices: [0.24, 0.22, 0.19, 0.2, 0.15],
    volume: 41_700_000,
    liquidity: 1_250_000,
    endDate: '2026-02-08T00:00:00Z',
    image: '🏈',
    active: true,
    closed: false,
  },
  {
    id: '5',
    question: 'Will Ethereum flip Bitcoin by market cap in 2026?',
    slug: 'ethereum-flips-bitcoin-2026',
    category: 'Crypto',
    outcomes: ['Yes', 'No'],
    prices: [0.09, 0.91],
    volume: 12_300_000,
    liquidity: 540_000,
    endDate: '2026-12-31T00:00:00Z',
    image: '⟠',
    active: true,
    closed: false,
  },
  {
    id: '6',
    question: 'UEFA Champions League 2025/26 — who is crowned?',
    slug: 'ucl-2025-26-winner',
    category: 'Sports',
    outcomes: ['Real Madrid', 'Man City', 'Arsenal', 'Bayern', 'PSG'],
    prices: [0.27, 0.25, 0.18, 0.17, 0.13],
    volume: 33_500_000,
    liquidity: 1_010_000,
    endDate: '2026-05-30T00:00:00Z',
    image: '⚽',
    active: true,
    closed: false,
  },
  {
    id: '7',
    question: 'Will OpenAI release GPT-6 before July 1, 2026?',
    slug: 'openai-gpt6-before-july-2026',
    category: 'Tech',
    outcomes: ['Yes', 'No'],
    prices: [0.33, 0.67],
    volume: 8_650_000,
    liquidity: 410_000,
    endDate: '2026-07-01T00:00:00Z',
    image: '🤖',
    active: true,
    closed: false,
  },
  {
    id: '8',
    question: 'Did the US enter a recession (2 negative GDP quarters) in 2025?',
    slug: 'us-recession-2025',
    category: 'Economics',
    outcomes: ['Yes', 'No'],
    prices: [0.12, 0.88],
    volume: 19_800_000,
    liquidity: 0,
    endDate: '2025-12-31T00:00:00Z',
    image: '📉',
    active: false,
    closed: true,
  },
]

export const MARKETS: Market[] = SEEDS.map((s) => ({
  id: s.id,
  question: s.question,
  slug: s.slug,
  category: s.category,
  outcomes: s.outcomes,
  prices: s.prices,
  tokenIds: tokenIds(s.id, s.outcomes),
  volume: s.volume,
  liquidity: s.liquidity,
  endDate: s.endDate,
  image: s.image,
  active: s.active,
  closed: s.closed,
  pricingUnreliable: s.pricingUnreliable ?? false,
}))

/** Default browse list = active, non-closed, top-by-volume descending (AC3.1). */
export const DEFAULT_MARKETS: Market[] = MARKETS.filter((m) => m.active && !m.closed).sort(
  (a, b) => b.volume - a.volume,
)

/**
 * Canned AI outcome prediction per market id (US7). `recommendedOutcome` is a
 * verbatim member of that market's outcomes so validation would pass (AC7.10).
 */
export const AI_PREDICTIONS: Record<string, AiPrediction> = {
  '1': {
    recommendedOutcome: 'Republican',
    confidence: 0.54,
    rationale:
      'Incumbent-party approval and current generic-ballot polling narrowly favor the Republican line, though the race sits inside the margin of error and remains highly volatile this far out.',
  },
  '2': {
    recommendedOutcome: 'No',
    confidence: 0.63,
    rationale:
      'A close above $150k implies a ~2.4x move with sustained macro tailwinds. Implied volatility and prior halving-cycle drawdowns make "No" the higher-probability side on the snapshot price.',
  },
  '3': {
    recommendedOutcome: 'Yes',
    confidence: 0.68,
    rationale:
      'Softening labor prints and cooling core inflation are consistent with a March cut; futures markets are pricing a cut with high conviction.',
  },
  '4': {
    recommendedOutcome: '49ers',
    confidence: 0.31,
    rationale:
      'The 49ers hold the strongest point-differential and DVOA profile in the field, but a five-way market keeps any single-team confidence low.',
  },
  '5': {
    recommendedOutcome: 'No',
    confidence: 0.86,
    rationale:
      'A flippening requires ETH to roughly triple relative to BTC within the window. No prior cycle has closed that gap, making "No" strongly favored.',
  },
  '6': {
    recommendedOutcome: 'Real Madrid',
    confidence: 0.29,
    rationale:
      'Real Madrid leads on squad depth and knockout pedigree, but the top of this bracket is tightly bunched, capping confidence.',
  },
  '7': {
    recommendedOutcome: 'No',
    confidence: 0.6,
    rationale:
      'Historical release cadence and the absence of a confirmed announcement push the balance toward "No" before the July cutoff.',
  },
  '8': {
    recommendedOutcome: 'No',
    confidence: 0.9,
    rationale: 'Market is resolved: two consecutive negative GDP quarters did not occur in 2025.',
  },
}

/** Canned "AI: pick a market" recommendation over the visible list (US9). */
export const AI_MARKET_PICK: AiMarketPick = {
  recommendedMarketId: '3',
  confidence: 0.66,
  rationale:
    'The Fed March-cut market pairs the highest liquidity-to-time-remaining ratio with a directional macro signal, offering a cleaner edge than the longer-dated, multi-outcome markets in the list.',
}
