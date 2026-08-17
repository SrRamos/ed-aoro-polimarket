/**
 * Mock service adapter for the opt-in demo mode (`config.useMockData === true`).
 *
 * The real services (`polymarket.service`, `openrouter.service`) DELEGATE to these
 * functions at the top of each public entry point when the flag is on, so the demo
 * exercises the identical `Result<…>` seams, loading states, and validation contract
 * as production — just fed from {@link MOCK_MARKETS} instead of the geo-blocked API.
 *
 * Each read simulates a small network delay (150–400ms) so loading skeletons show.
 * When the flag is OFF this module is never imported and the real code path is
 * byte-for-byte unchanged.
 */
import { ok, type AppError, type Result } from '../../models/errors'
import type { Market } from '../../models/market'
import type { AiPrediction } from '../../models/prediction'
import { MOCK_MARKETS, mockPrediction } from './fixtures'

const MIN_DELAY_MS = 150
const MAX_DELAY_MS = 400

/** Resolve after a random 150–400ms so the real loading states render in the demo. */
function simulateLatency(): Promise<void> {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Mock of `searchMarkets`: case-insensitive filter over the question, capped at `limit`. */
export async function mockSearchMarkets(
  query: string,
  limit: number,
): Promise<Result<Market[], AppError>> {
  await simulateLatency()
  const needle = query.trim().toLowerCase()
  const matches =
    needle === ''
      ? [...MOCK_MARKETS]
      : MOCK_MARKETS.filter(
          (m) =>
            m.question.toLowerCase().includes(needle) ||
            m.slug.toLowerCase().includes(needle) ||
            m.outcomes.some((o) => o.toLowerCase().includes(needle)),
        )
  return ok(matches.slice(0, limit))
}

/** Mock of `getMarkets`: top fixtures by volume desc, capped at `limit`. */
export async function mockGetMarkets(limit: number): Promise<Result<Market[], AppError>> {
  await simulateLatency()
  const byVolume = [...MOCK_MARKETS].sort((a, b) => b.volume - a.volume)
  return ok(byVolume.slice(0, limit))
}

/** Mock of `getMarket`: find one fixture by slug OR id; `null` in the success channel on miss. */
export async function mockGetMarket(idOrSlug: string): Promise<Result<Market | null, AppError>> {
  await simulateLatency()
  const found = MOCK_MARKETS.find((m) => m.slug === idOrSlug || m.id === idOrSlug) ?? null
  return ok(found)
}

/** Mock of `predict`: a canned, contract-valid prediction derived from the market's prices. */
export async function mockPredict(market: Market): Promise<Result<AiPrediction, AppError>> {
  await simulateLatency()
  return ok(mockPrediction(market))
}
