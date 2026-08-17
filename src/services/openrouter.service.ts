/**
 * OpenRouter AI service (T203 · AC7.3–7.6 / AC7.9 / AC7.10 · NFR-SEC-2).
 *
 * Two operations:
 *   - `pickFreeModel(apiKey)` — runtime model discovery (the `:free` roster is
 *     volatile, research §2). Preference chain → any free model advertising
 *     `structured_outputs` → `openrouter/free`. Cached per session/key (P2).
 *   - `predict(market, apiKey)` — builds the disciplined prompt (research §4),
 *     runs the structured-output degradation LADDER (json_schema → json_object →
 *     fence-strip + first `{…}` + one retry at temperature 0), then VALIDATES the
 *     output as untrusted (`recommendedOutcome ∈ outcomes`, clamp `confidence` to
 *     [0,1], cap `rationale`). Invalid after the retry → typed error (AC7.9/7.10).
 *
 * SECURITY: the key travels ONLY in the `Authorization` header (NFR-SEC-2). It is
 * never placed in a URL, never logged (http.ts logs neither headers nor bodies).
 */
import { appError, err, ok, type AppError, type Result } from '../models/errors'
import type { Market } from '../models/market'
import type { AiPrediction } from '../models/prediction'
import { httpRequestJson } from './http'
import { config } from '../config'

/** Preference chain (research §2 / AC7.4). */
const PREFERRED_MODELS = [
  'z-ai/glm-5.2:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'openai/gpt-oss-20b:free',
]
/** Last-resort meta-router (auto-selects a live free model). */
const FALLBACK_MODEL = 'openrouter/free'

const RATIONALE_MAX = 600
const AI_TIMEOUT_MS = 30_000
const MAX_TOKENS = 400

const HTTP_REFERER = 'https://polymarket-widget.local'
const X_TITLE = 'Polymarket Widget'

const SYSTEM_PROMPT = `You are a disciplined prediction-market analyst embedded in a Polymarket widget.

You will receive a single market: its question, its list of outcomes, each
outcome's current market price, and market volume/liquidity figures.

HARD RULES:
- Base your reasoning ONLY on the data provided in the user message. You have
  NO real-time knowledge, no news, no outside facts. Do NOT invent facts.
- Treat each outcome's price as the market's IMPLIED PROBABILITY of that outcome
  (prices are roughly normalized to sum to 1). Interpret this distribution.
- Volume and liquidity indicate how much to TRUST the prices: high => confidence
  can be higher; thin/low-liquidity => be more cautious and lower confidence.
- "recommendedOutcome" MUST be copied verbatim from the provided outcome labels.
- "confidence" (0.0-1.0) reflects how DECISIVE the provided data is, NOT private insight.
- "rationale" is 2-3 sentences, plain, referencing the actual numbers. No disclaimers.
- This is analysis of provided data, not financial advice.

Reply with ONLY a JSON object matching the required schema. No prose, no code fences.`

/** JSON schema advertised to models that support strict structured outputs. */
const PREDICTION_JSON_SCHEMA = {
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
} as const

// --- Model discovery -------------------------------------------------------

export interface PickedModel {
  id: string
  supportsStructured: boolean
}

interface ModelCacheEntry {
  key: string
  model: PickedModel
}
let modelCache: ModelCacheEntry | null = null

/** Clear the per-session model cache (test hook / key change). */
export function resetModelCache(): void {
  modelCache = null
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': HTTP_REFERER,
    'X-Title': X_TITLE,
  }
}

/**
 * Resolve a live free model id at runtime (AC7.4). Cached per session for the
 * given key so repeat predictions don't re-hit `/models` (P2).
 */
export async function pickFreeModel(apiKey: string): Promise<Result<PickedModel, AppError>> {
  if (!apiKey) return err(appError('no-key'))
  if (modelCache && modelCache.key === apiKey) return ok(modelCache.model)

  const res = await httpRequestJson('/models', {
    baseUrl: config.openrouterBaseUrl,
    headers: authHeaders(apiKey),
    timeoutMs: AI_TIMEOUT_MS,
  })
  if (!res.ok) return res

  const body = res.value
  const data = isObject(body) ? body.data : undefined
  if (!Array.isArray(data)) {
    return err(appError('parse-fail', { message: '/models envelope missing data array' }))
  }

  // Index free models and whether each advertises structured_outputs.
  const freeModels = new Map<string, boolean>()
  for (const m of data) {
    if (!isObject(m) || typeof m.id !== 'string' || !m.id.endsWith(':free')) continue
    const params = m.supported_parameters
    const supportsStructured = Array.isArray(params) && params.includes('structured_outputs')
    freeModels.set(m.id, supportsStructured)
  }

  let pickedId = PREFERRED_MODELS.find((id) => freeModels.has(id))
  if (pickedId === undefined) {
    for (const [id, structured] of freeModels) {
      if (structured) {
        pickedId = id
        break
      }
    }
  }
  const id = pickedId ?? FALLBACK_MODEL
  const model: PickedModel = { id, supportsStructured: freeModels.get(id) ?? false }

  modelCache = { key: apiKey, model }
  return ok(model)
}

// --- Prompt + parse ladder -------------------------------------------------

function buildUserMessage(market: Market): string {
  const lines = market.outcomes.map((label, i) => `- ${label}: ${market.prices[i] ?? 0}`)
  return `MARKET
Question: ${market.question}
Outcomes and current prices (price = implied probability):
${lines.join('\n')}
24h volume: ${market.volume}
Liquidity: ${market.liquidity}

TASK
1. Read the prices as an implied-probability distribution.
2. Weight your confidence by volume/liquidity (thin market => lower confidence).
3. Recommend exactly one outcome (verbatim label) and justify it from the numbers.

Return only the JSON object.`
}

/**
 * Robust parse: try `JSON.parse` directly, then strip code fences and extract the
 * first `{…}` block and parse that (AC7.5 rung 3). Returns `null` on failure.
 */
export function parseModelContent(content: string): unknown | null {
  const direct = tryJsonParse(content)
  if (direct !== undefined) return direct

  const defenced = content.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '')
  const start = defenced.indexOf('{')
  const end = defenced.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const block = defenced.slice(start, end + 1)
    const parsed = tryJsonParse(block)
    if (parsed !== undefined) return parsed
  }
  return null
}

function tryJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * Validate a parsed model object as UNTRUSTED output (AC7.6/7.10):
 * `recommendedOutcome` must be a verbatim outcome label, `confidence` is clamped
 * to [0,1], `rationale` is capped. Returns `parse-fail`/`outcome-mismatch` on
 * failure so the caller can retry once then surface a typed error.
 */
export function validatePrediction(
  parsed: unknown,
  outcomes: string[],
  modelId: string,
): Result<AiPrediction, AppError> {
  if (!isObject(parsed)) return err(appError('parse-fail', { message: 'not an object' }))

  const { recommendedOutcome, confidence, rationale } = parsed
  if (typeof recommendedOutcome !== 'string') {
    return err(appError('parse-fail', { message: 'recommendedOutcome missing' }))
  }
  if (typeof rationale !== 'string') {
    return err(appError('parse-fail', { message: 'rationale missing' }))
  }
  const conf = typeof confidence === 'number' ? confidence : Number(confidence)
  if (!Number.isFinite(conf)) {
    return err(appError('parse-fail', { message: 'confidence not numeric' }))
  }
  // Outcome must match a provided label verbatim (AC7.10) — never coerce.
  if (!outcomes.includes(recommendedOutcome)) {
    return err(appError('outcome-mismatch', { message: 'recommendedOutcome not in outcomes' }))
  }

  const clamped = Math.min(1, Math.max(0, conf))
  const cappedRationale =
    rationale.length > RATIONALE_MAX ? `${rationale.slice(0, RATIONALE_MAX - 1)}…` : rationale

  return ok({
    recommendedOutcome,
    confidence: clamped,
    rationale: cappedRationale,
    modelId,
  })
}

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/** POST one chat completion; extract `choices[0].message.content`. */
async function callChat(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  responseFormat: unknown,
  temperature: number,
): Promise<Result<string, AppError>> {
  const res = await httpRequestJson('/chat/completions', {
    method: 'POST',
    baseUrl: config.openrouterBaseUrl,
    headers: authHeaders(apiKey),
    timeoutMs: AI_TIMEOUT_MS,
    // No app-level auto-retry on transport for the AI path beyond the ladder.
    retries: 0,
    body: {
      model,
      messages,
      temperature,
      max_tokens: MAX_TOKENS,
      response_format: responseFormat,
      stream: false,
    },
  })
  if (!res.ok) return res // pass through transport errors incl. 429 (kind:'http',status:429,retryAfter)

  const body = res.value
  const choices = isObject(body) ? body.choices : undefined
  const first = Array.isArray(choices) ? choices[0] : undefined
  const message = isObject(first) ? first.message : undefined
  const content = isObject(message) ? message.content : undefined
  if (typeof content !== 'string') {
    return err(appError('parse-fail', { message: 'chat response missing content' }))
  }
  return ok(content)
}

/**
 * Produce a validated AI prediction for `market` using the user's key (AC7.3).
 * Runs exactly one request, then at most one retry at temperature 0 if the first
 * response fails to parse/validate (AC7.5). Transport failures (including a `429`
 * rate-limit, which is NOT auto-retried) are surfaced unchanged (AC7.9).
 */
export async function predict(
  market: Market,
  apiKey: string,
): Promise<Result<AiPrediction, AppError>> {
  if (config.useMockData) {
    const { mockPredict } = await import('./mock/mock.adapter')
    return mockPredict(market)
  }
  if (!apiKey) return err(appError('no-key'))

  const picked = await pickFreeModel(apiKey)
  if (!picked.ok) return picked
  const { id: modelId, supportsStructured } = picked.value

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage(market) },
  ]
  // Ladder rungs 1/2: json_schema strict when advertised, else laxer json_object.
  const responseFormat = supportsStructured
    ? { type: 'json_schema', json_schema: PREDICTION_JSON_SCHEMA }
    : { type: 'json_object' }

  const temperatures = [0.2, 0] // first attempt, then single retry at temp 0
  let lastError: AppError = appError('parse-fail')

  for (const temperature of temperatures) {
    const contentRes = await callChat(modelId, messages, apiKey, responseFormat, temperature)
    if (!contentRes.ok) return contentRes // transport / 429 → surface, do not retry-loop

    const parsed = parseModelContent(contentRes.value)
    if (parsed === null) {
      lastError = appError('parse-fail', { message: 'unparseable model content' })
      continue
    }
    const validated = validatePrediction(parsed, market.outcomes, modelId)
    if (validated.ok) return validated
    lastError = validated.error // parse-fail / outcome-mismatch → retry once at temp 0
  }

  return err(lastError)
}
