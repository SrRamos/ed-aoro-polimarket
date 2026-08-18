/**
 * OpenRouter AI service (design.md §2.7, spec.md AC7.*, AC9.*, NFR-SEC-1/2).
 *
 * REAL calls to https://openrouter.ai/api/v1 through `http.ts` (the sole fetch
 * caller, NFR-SVC-1). The user-supplied key is attached ONLY in the
 * `Authorization` header, built at call time — never interpolated into a URL,
 * never logged (http.ts logs no headers/bodies). No key is ever bundled.
 *
 * Robust output handling: model discovered at runtime (AC7.4), a degradation
 * ladder json_schema → json_object → fence-strip + retry@temp0 (AC7.5), and
 * strict validation (outcome ∈ outcomes / marketId ∈ presented, confidence
 * clamped, rationale capped — AC7.6/7.10/9.3). A failed/rate-limited/invalid
 * response yields a clean error, never a partial prediction (AC7.9/9.6).
 */
import type { Market } from '../models/market'
import type { AiMarketPick, AiPrediction, OpenRouterModel } from '../models/prediction'
import { fetchJson, isHttpError } from './http'
import { clamp } from '../lib/format'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

const MODEL_PREFERENCE = [
  'z-ai/glm-5.2:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'openai/gpt-oss-20b:free',
] as const

const RATIONALE_MAX = 600
const MODELS_RETRY = { attempts: 2, backoffMs: 300 }
const CHAT_TIMEOUT_MS = 30_000

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
      return new AiError('OpenRouter rejected the API key (HTTP 401). Check it in Settings.')
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

/* --------------------------- model discovery ---------------------------- */

interface ResolvedModel {
  id: string
  supportsStructured: boolean
}

function supportsStructured(m: OpenRouterModel): boolean {
  return m.supported_parameters?.includes('structured_outputs') ?? false
}

/** Resolve a live free model + whether it advertises structured outputs (AC7.4). */
async function resolveModel(apiKey: string): Promise<ResolvedModel> {
  const res = await fetchJson<{ data?: OpenRouterModel[] }>(`${OPENROUTER_BASE}/models`, {
    headers: authHeaders(apiKey),
    retry: MODELS_RETRY,
  })
  const free = (res.data ?? []).filter((m) => typeof m.id === 'string' && m.id.endsWith(':free'))

  for (const id of MODEL_PREFERENCE) {
    const match = free.find((m) => m.id === id)
    if (match) return { id, supportsStructured: supportsStructured(match) }
  }
  const structured = free.find(supportsStructured)
  if (structured) return { id: structured.id, supportsStructured: true }
  return { id: 'openrouter/free', supportsStructured: false }
}

/** Public per the AC7.4 contract — resolves just the model id. */
export async function pickFreeModel(apiKey: string): Promise<string> {
  return (await resolveModel(apiKey)).id
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

type ResponseFormat =
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: unknown }

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
 *   1) json_schema strict (if advertised) else json_object, temp 0.2
 *   2) on parse/validation failure: retry once, json_object + strict "JSON only"
 *      instruction, temperature 0
 * Returns a validated `T` or throws an AiError (never a partial result).
 */
async function runLadder<T>(
  apiKey: string,
  model: ResolvedModel,
  system: string,
  user: string,
  jsonSchema: unknown,
  validate: (raw: unknown) => T | null,
): Promise<T> {
  const primaryFormat: ResponseFormat = model.supportsStructured
    ? { type: 'json_schema', json_schema: jsonSchema }
    : { type: 'json_object' }

  // Attempt 1 — HTTP failures propagate as a clean error (AC7.9).
  const first = await chatComplete(apiKey, model.id, system, user, primaryFormat, 0.2)
  const firstResult = validate(extractJson(first))
  if (firstResult) return firstResult

  // Attempt 2 — one retry at temperature 0 with an explicit JSON-only instruction.
  const retrySystem = `${system}\n\nReply with ONLY a single JSON object. No prose, no code fences.`
  const second = await chatComplete(
    apiKey,
    model.id,
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
  const lines = market.outcomes
    .map((label, i) => `- ${label}: ${market.prices[i] ?? 0}`)
    .join('\n')
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
      const prices = m.outcomes
        .map((label, i) => `${label}=${m.prices[i] ?? 0}`)
        .join(', ')
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

/* ------------------------------- public API ------------------------------ */

/** On-demand outcome suggestion for one market (AC7.3–AC7.10). */
export async function predictOutcome(market: Market, apiKey: string): Promise<AiPrediction> {
  try {
    const model = await resolveModel(apiKey)
    return await runLadder<AiPrediction>(
      apiKey,
      model,
      OUTCOME_SYSTEM,
      outcomeUserPrompt(market),
      OUTCOME_SCHEMA,
      (raw) => validatePrediction(raw, market.outcomes),
    )
  } catch (err) {
    throw toAiError(err, 'The AI suggestion failed. Please retry.')
  }
}

/** On-demand market recommendation over the visible list (AC9.2–AC9.6). */
export async function recommendMarket(markets: Market[], apiKey: string): Promise<AiMarketPick> {
  try {
    const ids = markets.map((m) => m.id)
    const model = await resolveModel(apiKey)
    return await runLadder<AiMarketPick>(
      apiKey,
      model,
      MARKET_SYSTEM,
      marketUserPrompt(markets),
      MARKET_SCHEMA,
      (raw) => validateMarketPick(raw, ids),
    )
  } catch (err) {
    throw toAiError(err, 'The AI market pick failed. Please retry.')
  }
}
