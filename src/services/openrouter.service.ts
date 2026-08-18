/**
 * OpenRouter AI service (design.md §2.7, spec.md AC7.*, AC9.*, NFR-SEC-1/2).
 *
 * CONFIG BY ENV (deploy-time): the API key and model id come from
 * `VITE_OPENROUTER_API_KEY` and `VITE_OPENROUTER_MODEL`. The end user never
 * supplies them — they only flip an "Enable AI" toggle. `isAiConfigured()`
 * reports whether BOTH are present; only then is a real network call made.
 *
 * SECURITY NOTE: `VITE_*` vars are inlined into the client bundle at build
 * time, so in a public deploy the key is exposed. The production-correct path
 * is a backend proxy that holds the key server-side. See docs/security-review.md.
 *
 * REAL calls to https://openrouter.ai/api/v1 through `http.ts` (the sole fetch
 * caller, NFR-SVC-1). The key is attached ONLY in the `Authorization` header,
 * built at call time — never interpolated into a URL, never logged.
 *
 * Robust output handling: the parse ladder json_schema → json_object →
 * fence-strip + retry@temp0 (AC7.5), and strict validation (outcome ∈ outcomes /
 * marketId ∈ presented, confidence clamped, rationale capped — AC7.6/7.10/9.3).
 * A failed/rate-limited/invalid response yields a clean error, never a partial
 * prediction (AC7.9/9.6). When AI is NOT configured, callers must not invoke the
 * network path — use the `sample*` helpers to render a labelled demo suggestion.
 */
import type { Market } from '../models/market'
import type { AiMarketPick, AiPrediction } from '../models/prediction'
import { fetchJson, isHttpError } from './http'
import { clamp } from '../lib/format'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

/** Last-resort default model, used only when VITE_OPENROUTER_MODEL is empty. */
const DEFAULT_MODEL = 'z-ai/glm-5.2:free'

const RATIONALE_MAX = 600
const CHAT_TIMEOUT_MS = 30_000

/* ------------------------------- config --------------------------------- */

export interface AiConfig {
  apiKey: string
  model: string
}

const trimEnv = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '')

/**
 * Deploy-time env (dotted access so Vite can statically replace it and tests can
 * override it with `vi.stubEnv`). Read fresh each call — never cached.
 */
function readKey(): string {
  return trimEnv(import.meta.env.VITE_OPENROUTER_API_KEY)
}
function readModel(): string {
  return trimEnv(import.meta.env.VITE_OPENROUTER_MODEL)
}

/** True when a key AND a model are provided via env (deploy-time config). */
export function isAiConfigured(): boolean {
  return readKey() !== '' && readModel() !== ''
}

/**
 * Resolve the deploy-time AI config from env, or `null` when no key is set.
 * The model falls back to DEFAULT_MODEL if the key is present but the model
 * var is blank — but with a missing key there is NEVER a real call.
 */
export function getAiConfig(): AiConfig | null {
  const apiKey = readKey()
  if (apiKey === '') return null
  const model = readModel() || DEFAULT_MODEL
  return { apiKey, model }
}

/* ------------------------------- errors --------------------------------- */

export class AiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiError'
  }
}

/** Normalize any thrown value into a user-facing AiError (never leaks the key). */
function toAiError(err: unknown, fallback: string): AiError {
  if (err instanceof AiError) return err
  if (isHttpError(err)) {
    if (err.kind === 'http' && err.status === 429) {
      return new AiError('The model was rate-limited (HTTP 429). Please wait a moment and retry.')
    }
    if (err.kind === 'http' && err.status === 401) {
      return new AiError('OpenRouter rejected the configured API key (HTTP 401).')
    }
    if (err.kind === 'http') {
      return new AiError(`The AI request failed (HTTP ${err.status}). Please retry.`)
    }
    if (err.kind === 'timeout') return new AiError('The AI request timed out. Please retry.')
    return new AiError('Could not reach OpenRouter. Check your connection and retry.')
  }
  return new AiError(fallback)
}

/* ------------------------------ headers --------------------------------- */

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`, // key travels ONLY here (NFR-SEC-2)
    'HTTP-Referer': 'https://localhost',
    'X-Title': 'Polymarket Widget',
  }
}

/* ---------------------------- parse + validate --------------------------- */

/**
 * Extract a JSON value from raw model content (AC7.5 step 3): try a direct
 * parse, then strip code fences, then take the first `{…}` block. Never throws.
 */
export function extractJson(content: string): unknown | null {
  const tryParse = (s: string): unknown | undefined => {
    try {
      return JSON.parse(s)
    } catch {
      return undefined
    }
  }

  const direct = tryParse(content.trim())
  if (direct !== undefined) return direct

  const noFence = content.replace(/```(?:json)?/gi, '').trim()
  const fenced = tryParse(noFence)
  if (fenced !== undefined) return fenced

  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const block = tryParse(content.slice(start, end + 1))
    if (block !== undefined) return block
  }
  return null
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null
}

/** Validate an outcome prediction: outcome ∈ outcomes, confidence clamped (AC7.6/7.10). */
export function validatePrediction(raw: unknown, outcomes: string[]): AiPrediction | null {
  const o = asRecord(raw)
  if (!o) return null

  const recommendedOutcome = o.recommendedOutcome
  if (typeof recommendedOutcome !== 'string' || !outcomes.includes(recommendedOutcome)) {
    return null
  }
  const conf = Number(o.confidence)
  if (!Number.isFinite(conf)) return null

  const rationale = typeof o.rationale === 'string' ? o.rationale.slice(0, RATIONALE_MAX) : ''
  return { recommendedOutcome, confidence: clamp(conf, 0, 1), rationale }
}

/** Validate a market pick: marketId ∈ presented ids, confidence clamped (AC9.3). */
export function validateMarketPick(raw: unknown, ids: string[]): AiMarketPick | null {
  const o = asRecord(raw)
  if (!o) return null

  const recommendedMarketId = o.recommendedMarketId
  if (typeof recommendedMarketId !== 'string' || !ids.includes(recommendedMarketId)) {
    return null
  }
  const conf = Number(o.confidence)
  if (!Number.isFinite(conf)) return null

  const rationale = typeof o.rationale === 'string' ? o.rationale.slice(0, RATIONALE_MAX) : ''
  return { recommendedMarketId, confidence: clamp(conf, 0, 1), rationale }
}

/* ----------------------------- chat + ladder ----------------------------- */

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
}

type ResponseFormat = { type: 'json_object' } | { type: 'json_schema'; json_schema: unknown }

async function chatComplete(
  apiKey: string,
  modelId: string,
  system: string,
  user: string,
  responseFormat: ResponseFormat,
  temperature: number,
): Promise<string> {
  const res = await fetchJson<ChatCompletionResponse>(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    timeoutMs: CHAT_TIMEOUT_MS,
    body: {
      model: modelId,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: 500,
      response_format: responseFormat,
      stream: false,
    },
  })
  return res.choices?.[0]?.message?.content ?? ''
}

/**
 * Run the degradation ladder for a validated structured completion (AC7.5):
 *   1) json_schema strict, temp 0.2
 *   2) on parse/validation failure: retry once, json_object + strict "JSON only"
 *      instruction (fence-strip via extractJson), temperature 0
 * HTTP failures on either attempt propagate as a clean AiError (AC7.9). Returns
 * a validated `T` or throws — never a partial result.
 */
async function runLadder<T>(
  config: AiConfig,
  system: string,
  user: string,
  jsonSchema: unknown,
  validate: (raw: unknown) => T | null,
): Promise<T> {
  // Attempt 1 — json_schema strict. HTTP failures propagate as a clean error.
  const first = await chatComplete(
    config.apiKey,
    config.model,
    system,
    user,
    { type: 'json_schema', json_schema: jsonSchema },
    0.2,
  )
  const firstResult = validate(extractJson(first))
  if (firstResult) return firstResult

  // Attempt 2 — json_object retry at temperature 0 with a JSON-only instruction.
  const retrySystem = `${system}\n\nReply with ONLY a single JSON object. No prose, no code fences.`
  const second = await chatComplete(
    config.apiKey,
    config.model,
    retrySystem,
    user,
    { type: 'json_object' },
    0,
  )
  const secondResult = validate(extractJson(second))
  if (secondResult) return secondResult

  throw new AiError('The AI response could not be validated. Please retry.')
}

/* ------------------------------- prompts -------------------------------- */

const OUTCOME_SYSTEM = `You are a disciplined prediction-market analyst embedded in a Polymarket widget.
You will receive a single market: its question, its outcomes, each outcome's current market price, and volume/liquidity.
HARD RULES:
- Reason ONLY from the data provided. You have no real-time knowledge. Do NOT invent facts.
- Treat each outcome's price as the market's IMPLIED PROBABILITY (prices roughly sum to 1).
- Volume/liquidity indicate how much to TRUST the prices: thin markets => lower confidence.
- "recommendedOutcome" MUST be copied verbatim from the provided outcome labels.
- "confidence" (0.0-1.0) reflects how DECISIVE the data is, not private insight.
- "rationale" is 2-3 plain sentences referencing the actual numbers.
Reply with ONLY a JSON object: { "recommendedOutcome": string, "confidence": number, "rationale": string }.`

const MARKET_SYSTEM = `You are a disciplined prediction-market analyst embedded in a Polymarket widget.
You will receive a list of markets, each with an id, question, outcomes+prices, and volume/liquidity.
HARD RULES:
- Reason ONLY from the data provided. You have no real-time knowledge. Do NOT invent facts.
- Treat prices as implied probabilities; use volume/liquidity as a trust signal.
- Recommend the single most attractive market to explore.
- "recommendedMarketId" MUST be copied verbatim from one of the provided market ids.
- "confidence" (0.0-1.0) reflects how decisive the data is.
- "rationale" is 2-3 plain sentences referencing the actual numbers.
Reply with ONLY a JSON object: { "recommendedMarketId": string, "confidence": number, "rationale": string }.`

function outcomeUserPrompt(market: Market): string {
  const lines = market.outcomes.map((label, i) => `- ${label}: ${market.prices[i] ?? 0}`).join('\n')
  return `MARKET
Question: ${market.question}
Outcomes and current prices (price = implied probability):
${lines}
Volume: ${market.volume}
Liquidity: ${market.liquidity}

Recommend exactly one outcome (verbatim label) and justify it from the numbers. Return only the JSON object.`
}

function marketUserPrompt(markets: Market[]): string {
  const blocks = markets
    .map((m) => {
      const prices = m.outcomes.map((label, i) => `${label}=${m.prices[i] ?? 0}`).join(', ')
      return `- id: ${m.id}
  question: ${m.question}
  prices: ${prices}
  volume: ${m.volume}, liquidity: ${m.liquidity}`
    })
    .join('\n')
  return `MARKETS
${blocks}

Recommend exactly one market by its id and justify it from the numbers. Return only the JSON object.`
}

const OUTCOME_SCHEMA = {
  name: 'market_prediction',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      recommendedOutcome: { type: 'string' },
      confidence: { type: 'number' },
      rationale: { type: 'string' },
    },
    required: ['recommendedOutcome', 'confidence', 'rationale'],
    additionalProperties: false,
  },
}

const MARKET_SCHEMA = {
  name: 'market_pick',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      recommendedMarketId: { type: 'string' },
      confidence: { type: 'number' },
      rationale: { type: 'string' },
    },
    required: ['recommendedMarketId', 'confidence', 'rationale'],
    additionalProperties: false,
  },
}

/* ------------------------------ sample mode ------------------------------ */

/**
 * Deterministic, network-free sample outcome suggestion, shown (with a
 * "sample — AI not configured" label) when the toggle is ON but no env config
 * is present. Same spirit as the market-data fixtures fallback: the demo always
 * shows the feature without ever hitting the network unconfigured.
 */
export function sampleOutcome(market: Market): AiPrediction {
  let best = 0
  for (let i = 1; i < market.outcomes.length; i++) {
    if ((market.prices[i] ?? 0) > (market.prices[best] ?? 0)) best = i
  }
  const outcome = market.outcomes[best] ?? market.outcomes[0] ?? ''
  const price = clamp(market.prices[best] ?? 0.5, 0, 1)
  const pct = Math.round(price * 100)
  return {
    recommendedOutcome: outcome,
    confidence: price,
    rationale: `Sample suggestion: the market prices "${outcome}" at about ${pct}%, the highest implied probability among the outcomes. This is illustrative demo output, not a live model call.`,
  }
}

/** Deterministic, network-free sample market pick (highest volume). */
export function sampleMarketPick(markets: Market[]): AiMarketPick {
  let best = 0
  for (let i = 1; i < markets.length; i++) {
    if ((markets[i]?.volume ?? 0) > (markets[best]?.volume ?? 0)) best = i
  }
  const pick = markets[best]
  return {
    recommendedMarketId: pick?.id ?? '',
    confidence: 0.6,
    rationale: `Sample pick: "${pick?.question ?? ''}" leads the visible list on volume, a proxy for liquidity and interest. This is illustrative demo output, not a live model call.`,
  }
}

/* ------------------------------- public API ------------------------------ */

/** On-demand outcome suggestion for one market (AC7.3–AC7.10). Env-configured. */
export async function predictOutcome(market: Market): Promise<AiPrediction> {
  const config = getAiConfig()
  if (!config) throw new AiError('AI is not configured.')
  try {
    return await runLadder<AiPrediction>(
      config,
      OUTCOME_SYSTEM,
      outcomeUserPrompt(market),
      OUTCOME_SCHEMA,
      (raw) => validatePrediction(raw, market.outcomes),
    )
  } catch (err) {
    throw toAiError(err, 'The AI suggestion failed. Please retry.')
  }
}

/** On-demand market recommendation over the visible list (AC9.2–AC9.6). Env-configured. */
export async function recommendMarket(markets: Market[]): Promise<AiMarketPick> {
  const config = getAiConfig()
  if (!config) throw new AiError('AI is not configured.')
  try {
    const ids = markets.map((m) => m.id)
    return await runLadder<AiMarketPick>(
      config,
      MARKET_SYSTEM,
      marketUserPrompt(markets),
      MARKET_SCHEMA,
      (raw) => validateMarketPick(raw, ids),
    )
  } catch (err) {
    throw toAiError(err, 'The AI market pick failed. Please retry.')
  }
}
