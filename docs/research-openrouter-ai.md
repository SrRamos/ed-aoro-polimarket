# Research: OpenRouter AI-Assisted Prediction

> Feature bonus del challenge: dado un mercado (pregunta + outcomes + precios + volumen/liquidez),
> devolver un outcome recomendado con `{recommendedOutcome, confidence, rationale}`.
> Fuente: investigación sobre `openrouter.ai/docs` y `openrouter.ai/models` (Ago 2026).

> **Aviso clave:** el roster `:free` de OpenRouter es **volátil** — cambia semana a semana.
> A Ago 2026 los IDs clásicos (`deepseek/*:free`, `qwen/*:free`, `meta-llama/llama-*:free`,
> `mistralai/*:free`) están **delistados**. El widget debe **descubrir modelos free en runtime**
> en lugar de hardcodear uno solo.

---

## 1. Chat Completions API

**Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions` — OpenAI-compatible.

### Headers

| Header | ¿Requerido? | Propósito |
|---|---|---|
| `Authorization: Bearer <OPENROUTER_API_KEY>` | **Sí** | Auth |
| `Content-Type: application/json` | **Sí** | JSON body |
| `HTTP-Referer: <your-site-url>` | Recomendado | Atribución en dashboard |
| `X-Title: <your-app-name>` | Recomendado | Nombre legible en dashboard |

### Request body

```jsonc
{
  "model": "z-ai/glm-5.2:free",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user",   "content": "..." }
  ],
  "temperature": 0.2,        // 0–2; BAJO para salida disciplinada
  "max_tokens": 400,
  "response_format": { /* ver §1.3 */ },
  "stream": false
}
```

El texto del modelo siempre está en `response.choices[0].message.content` (string; se hace `JSON.parse()` con structured output).

### 1.3 Salida JSON estructurada

**A. JSON Schema estricto (preferido):**

```jsonc
"response_format": {
  "type": "json_schema",
  "json_schema": {
    "name": "market_prediction",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "recommendedOutcome": { "type": "string" },
        "confidence":         { "type": "number" },
        "rationale":          { "type": "string" }
      },
      "required": ["recommendedOutcome", "confidence", "rationale"],
      "additionalProperties": false
    }
  }
}
```

**B. JSON mode laxo (más soporte):** `"response_format": { "type": "json_object" }` — solo garantiza JSON válido, no la forma; hay que describir la forma en el prompt.

**Caveat:** el soporte de structured output es **por-modelo y por-provider**. Filtrar:
`https://openrouter.ai/models?supported_parameters=structured_outputs`

**Estrategia de parseo robusta (ladder de degradación):**
1. `json_schema` si el modelo anuncia `structured_outputs`.
2. Si no, `json_object` + instrucción "responde SOLO este JSON".
3. En fallo de parseo: quitar code-fences ```` ```json ````, extraer primer bloque `{…}`, `JSON.parse()`, validar keys, clamp `confidence` a `[0,1]`. Reintentar 1× con `temperature: 0`.

---

## 2. Modelos free (Ago 2026)

Los `:free` de DeepSeek/Qwen/Llama/Mistral están **delistados**. Roster actual dominado por NVIDIA Nemotron, Google Gemma, Z.ai GLM.

| Model ID (`:free`) | Context | Notas |
|---|---|---|
| **`z-ai/glm-5.2:free`** | 128K | **Mejor calidad general del free tier.** Pick primario. |
| **`nvidia/nemotron-3-ultra-550b-a55b:free`** | 1M | MoE grande, buen reasoning. Fallback 1. |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K | Reasoning mid-large. |
| `google/gemma-4-31b-it:free` | 262K | Instruction-following fiable, techo de reasoning menor. |
| `openai/gpt-oss-20b:free` | 131K | Open-weight; **bueno formateando JSON.** Fallback 2. |
| `openrouter/free` | 200K | Meta-router que auto-elige un free vivo. Last-resort. |

**Recomendación:** primario `z-ai/glm-5.2:free`; fallbacks `nvidia/nemotron-3-ultra-550b-a55b:free` y `openai/gpt-oss-20b:free`. Wire de fallback chain que salte IDs que devuelvan 404 / "no endpoints".

### Rate limits (la restricción real, no el contexto)

- **20 req/min** para todos los `:free`.
- **Cap diario según crédito histórico:** `< $10 gastado → 50 req/día`; `≥ $10 comprado → 1,000 req/día`.
- Modelos free pueden delistarse sin aviso → discovery en runtime.

### Discovery en runtime (self-healing)

```js
async function pickFreeModel(apiKey) {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const { data } = await res.json();
  const free = data.filter(m => m.id.endsWith(":free"));
  const preferred = [
    "z-ai/glm-5.2:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openai/gpt-oss-20b:free",
  ];
  return preferred.find(id => free.some(m => m.id === id))
      ?? free.find(m => m.supported_parameters?.includes("structured_outputs"))?.id
      ?? "openrouter/free";
}
```

---

## 3. Seguridad — llamar a OpenRouter desde el browser

Cualquier request lleva la API key en el header `Authorization`, visible en DevTools y en el bundle. Una key en `VITE_*` queda **efectivamente pública**.

| Enfoque | Exposición | Esfuerzo | Uso |
|---|---|---|---|
| A. Env var build-time (`VITE_OPENROUTER_KEY`) | **Expuesta** en bundle | Cero | ❌ Nunca para demo desplegado |
| B. Key provista por el usuario (campo Settings) | Solo al usuario dueño de la key | Bajo | ✅ Demos de challenge |
| C. Proxy servidor (key server-side) | **Oculta** | Medio | ✅ Producción |

**Decisión para el challenge:** **Enfoque B.** Campo de Settings donde el revisor pega *su propia* key OpenRouter, guardada en `localStorage`, enviada directo al browser. La feature IA queda **opt-in** (coincide con "optional AI-assisted prediction").

Mitigaciones a mostrar: keys con spend cap, key fuera de URL/logs, disclaimer en UI ("Tu key se guarda localmente y se envía directo a OpenRouter"). Mencionar el proxy (Enfoque C) como el camino de producción.

---

## 4. Diseño del prompt

Principios: el modelo **no** finge conocimiento real-time; razona **solo** con los números provistos; trata precios como **probabilidad implícita** (~suman 1); `temperature` 0–0.2; `confidence` refleja cuán decisiva es la data (0.92/0.08 → alta; 0.51/0.49 → baja), no insight privado.

### System prompt

```text
You are a disciplined prediction-market analyst embedded in a Polymarket widget.

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
- "confidence" (0.0–1.0) reflects how DECISIVE the provided data is, NOT private insight.
- "rationale" is 2–3 sentences, plain, referencing the actual numbers. No disclaimers.
- This is analysis of provided data, not financial advice.

Reply with ONLY a JSON object matching the required schema. No prose, no code fences.
```

### User message template

```text
MARKET
Question: {{question}}
Outcomes and current prices (price = implied probability):
{{#each outcomes}}- {{label}}: {{price}}
{{/each}}
24h volume: {{volume}}
Liquidity: {{liquidity}}

TASK
1. Read the prices as an implied-probability distribution.
2. Weight your confidence by volume/liquidity (thin market => lower confidence).
3. Recommend exactly one outcome (verbatim label) and justify it from the numbers.

Return only the JSON object.
```

### Output esperado (content parseado)

```json
{
  "recommendedOutcome": "Yes",
  "confidence": 0.68,
  "rationale": "The market implies a 71% chance of 'Yes' versus 29% for 'No'. With $412k in 24h volume and $85k liquidity, the pricing is reasonably well-supported though not overwhelming, so confidence is moderate."
}
```

**Validación cliente tras parsear:** confirmar `recommendedOutcome` ∈ labels enviados; clamp `confidence` a `[0,1]`; cap de longitud del `rationale`; reintentar 1× a `temperature: 0` en fallo.

---

## Implicaciones para la arquitectura del widget

- `services/openrouter.js`: `pickFreeModel()`, `predict(market, apiKey)` con ladder de parseo y fallback chain.
- Feature **opt-in**: si no hay key en `localStorage`, ocultar/deshabilitar el botón de IA con CTA a Settings.
- Estados UI: idle / loading / result (outcome + barra de confidence + rationale) / error con retry.
- Rate-limit friendly: no auto-llamar; solo on-demand por botón.

## Fuentes

- OpenRouter — Chat Completions API reference
- OpenRouter — Structured Outputs docs
- OpenRouter — Rate limits / free-tier caps
- OpenRouter — live models API (`/api/v1/models`)
- CostGoat / Buldrr — snapshots de free models (Ago 2026)
