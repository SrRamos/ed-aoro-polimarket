# Análisis y Arquitectura — Polymarket Widget

> Documento de decisiones que consolida el research y define el plan técnico.
> Coding challenge (48h). Ver detalles en:
> [`research-polymarket-api.md`](./research-polymarket-api.md) ·
> [`research-openrouter-ai.md`](./research-openrouter-ai.md) ·
> [`research-ramoslabs-ds.md`](./research-ramoslabs-ds.md)

## 1. Objetivo

Widget de Polymarket en una sola página (Vue 3) que permite: **buscar mercados**, **ver un mercado** con sus outcomes/precios, **colocar una apuesta**, y (bonus) **predicción asistida por IA**. UI/UX 100% con RamosLabs DS. Todo el I/O del browser (`fetch`) encapsulado en una capa de **servicios**.

## 2. Decisiones clave (fundamentadas en el research)

| # | Decisión | Justificación |
|---|---|---|
| D1 | **Datos de mercado y búsqueda: REALES** vía Gamma API (público, sin auth, CORS `*`) | No requiere key, browser-friendly, sin geoblock en reads |
| D2 | **Apuesta: SIMULADA (mock)** tras interfaz `BettingService` | Órdenes reales exigen wallet + EIP-712 + HMAC secret + USDC + backend, y trading está geobloqueado. Inviable/inseguro solo-browser en 48h. Interfaz swappable deja el path real como extensión futura |
| D3 | **Precio en vivo: CLOB `/price` opcional**; snapshot de Gamma basta para MVP | Menos llamadas, más simple; se puede enriquecer |
| D4 | **IA: OpenRouter, modelo free, opt-in** con key provista por el usuario en Settings (`localStorage`) | La feature es bonus/opcional; evita exponer key propia; disclaimer + mención de proxy como camino de producción |
| D5 | **Modelo IA con discovery en runtime** + fallback chain (`z-ai/glm-5.2:free` → nemotron → gpt-oss) | El roster `:free` cambia semanalmente; hardcodear un ID se rompe |
| D6 | **Tema claro únicamente** | El DS v0.1.0 no shippea dark mode; no inventar paleta dark |
| D7 | **Componentes propios token-only**, naming `SJ`/`W` | El DS no shippea componentes; regla token-only estricta |
| D8 | **Los custom components DEBEN seguir TODOS los lineamientos del DS** (no solo tokens): estados press-first, foco visible `--shadow-focus`, native-first, `<label>` persistente, radius/shadow/motion por rol, accesibilidad AA, patrones documentados (Interactive/Form Elements/Modals) | Instrucción explícita del usuario: "ramoslabs-ds me refiero a todo, incluso los custom components deben seguir sus lineamientos" |
| D9 | **Mobile-first bajo los lineamientos del DS**: base = 0 (móvil), 5 breakpoints `min-width` del DS, thumb-zone, touch ≥24×24 (aim 44), inputs ≥16px, patrón "Mobile First" del DS como fuente primaria | Instrucción explícita del usuario: "debe ser mobile first con las mismas condiciones" (= condiciones del DS) |
| D10 | **Deployment: Cloudflare Workers with Static Assets** (un solo Worker sirve la SPA y puede alojar rutas `/api/*` con env vars/secrets), **no Pages**. Config por env vars (`VITE_*` público vs Worker secrets server-side), switch simulación→real por env (`VITE_BET_MODE=mock\|real`, `VITE_AI_MODE=user-key\|proxy`), **auto-deploy en merge a `main`** vía GitHub Actions + `wrangler deploy`. Ver [`deployment-cloudflare.md`](./deployment-cloudflare.md) | Confirmado contra docs oficiales de Cloudflare (Ago 2026): Workers Static Assets soporta SPA (`not_found_handling: single-page-application`) + `/api/*` en el mismo deploy (`run_worker_first`) con secrets server-side; permite empezar estático hoy y añadir el proxy de OpenRouter (oculta la key) y un adaptador CLOB real mañana **sin cambiar de plataforma**. Assets estáticos gratis; Workers es la plataforma full-stack recomendada por Cloudflare |

## 3. Stack

- **Vue 3** (`<script setup>`, Composition API) + **Vite**.
- **TypeScript** (recomendado — contratos claros para services y modelos; el reviewer lo valora). *Confirmar con el usuario si prefiere JS.*
- **Pinia** para estado (mercados, selección, posiciones/apuestas, settings IA).
- **@ramoslabs/tokens** para todo el styling (CSS vars).
- **Vitest** + **@vue/test-utils** para unit; **Playwright** opcional para 1 flujo E2E.
- Sin librería de UI ni de charts — todo custom.

## 4. Arquitectura de carpetas

```
src/
  main.ts                      # importa @ramoslabs/tokens/css, monta app
  App.vue                      # layout de la página única
  services/
    http.ts                    # wrapper fetch: base URL, timeout, errores, retry
    polymarket.service.ts      # searchMarkets, getMarket, getMarkets, getLivePrice
    betting.service.ts         # interface BettingService + MockBettingService
    openrouter.service.ts      # pickFreeModel, predict(market, apiKey) + parseo robusto
  models/
    market.ts                  # Market normalizado (arrays ya parseados)
    bet.ts                     # BetOrder, BetReceipt, Position
    prediction.ts              # AiPrediction { recommendedOutcome, confidence, rationale }
  stores/
    markets.store.ts
    bets.store.ts
    settings.store.ts          # apiKey IA, prefs
  composables/
    useMarketSearch.ts         # debounce + estados loading/error/empty
    useAiPrediction.ts
  components/
    ui/                        # SJButton, SJInput, SJCard, SJBadge, SJModal, SJSpinner, SJSkeleton
    widget/                    # WMarketSearch, WMarketList, WMarketCard, WMarketDetail,
                               # WBetForm, WBetReceipt, WPositions, WAiPrediction, WSettings
  styles/
    base.css                   # reset mínimo, fuentes, utilidades (.sr-only, .focus-ring)
```

## 5. Capa de servicios (contratos)

**`polymarket.service.ts`** — normaliza el gotcha de arrays string:
```ts
function normalizeMarket(raw): Market {
  return {
    id: raw.id, question: raw.question, slug: raw.slug,
    outcomes: JSON.parse(raw.outcomes),
    prices: JSON.parse(raw.outcomePrices).map(Number),
    tokenIds: JSON.parse(raw.clobTokenIds),
    volume: raw.volumeNum, liquidity: raw.liquidityNum,
    endDate: raw.endDate, image: raw.image,
    active: raw.active, closed: raw.closed,
  };
}
// searchMarkets(q) -> GET /public-search  |  getMarkets(filters) -> GET /markets
```

**`betting.service.ts`** — mock con misma firma que el real:
```ts
interface BettingService { placeBet(o: BetOrder): Promise<BetReceipt> }
class MockBettingService implements BettingService {
  // valida size>0 y precio, cost = size*price, shares = size/price (o size @ payout $1),
  // delay simulado, retorna { status:'filled', avgPrice, shares, cost, txHash:'mock-0x…' },
  // persiste Position en bets.store (localStorage)
}
```

**`openrouter.service.ts`** — ver [research IA §1–4](./research-openrouter-ai.md): `pickFreeModel()`, `predict()` con ladder json_schema → json_object → fence-strip, validación (`recommendedOutcome` ∈ outcomes, clamp confidence, retry temp 0).

## 6. UX de la página (single page)

Layout vertical, mobile-first, mono-indigo:
1. **Header** — título + botón Settings (icono) para la key de IA.
2. **Search bar** (`WMarketSearch`) — input con `<label>`, debounce, estados loading/empty/error (live region).
3. **Lista de resultados** (`WMarketList` → `WMarketCard`) — pregunta, outcomes con % (barra), volumen/liquidez, imagen.
4. **Detalle de mercado** (`WMarketDetail`, modal o panel) — outcomes seleccionables (success/error + texto), precio, `WBetForm`.
5. **Bet form** (`WBetForm`) — outcome elegido, monto (input numérico ≥16px), cost/payout calculados en vivo, botón "Place bet" → `WBetReceipt` (toast + posición añadida).
6. **Posiciones** (`WPositions`) — apuestas simuladas persistidas.
7. **Predicción IA** (`WAiPrediction`) — botón "AI suggestion" en el detalle; muestra outcome recomendado + barra de confidence + rationale; opt-in (si no hay key → CTA a Settings).

Todos los estados (loading/empty/error) explícitos y con tokens del DS. Accesibilidad AA (foco visible, live regions, touch ≥24px, color nunca única señal).

## 7. Flujo SDD (spec driven development)

1. **`docs/`** (este set) — research + análisis ✅
2. **Spec** — generar `specs/polymarket-widget/spec.md` (intent → EARS/user stories → criterios de aceptación).
3. **`spec-harden`** — madurar spec: dependencias, threat-model, plan de tareas con QA/observabilidad, rollback.
4. **`spec-audit`** — auditoría adversarial (gate antes de tareas).
5. **`promote-tasks`** → `TASKS.md`.
6. **Implementación autónoma** (autopilot / delegación a agentes por tarea) en branch `feature/*`, commits por unidad lógica.
7. **QA** — lint + format gate completo, unit tests, 1 E2E, run del app.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Roster `:free` de OpenRouter cambia | Discovery runtime + fallback chain + degradación de structured output |
| CORS puntual en Gamma | Vite dev proxy listo (cero cambio en services) |
| Geoblock/VPN | No dependemos de trading real; solo reads (globales) + mock bet |
| Key IA expuesta | User-supplied + localStorage + disclaimer; proxy documentado como prod |
| Fuentes no bundleadas | Cargar Rubik/Red Hat Display; fallback `system-ui` |
| Dark mode no soportado | Solo tema claro; documentado |

## 9. Decisiones confirmadas por el usuario

- **Lenguaje: TypeScript.** Contratos tipados para services/modelos.
- **Precios: snapshot de Gamma (`outcomePrices`) en el MVP.** CLOB `/price` en vivo queda como enhancement posterior.
- **Testing: unit (Vitest) + 1 E2E (Playwright)** del flujo buscar → apostar.

## 10. Deployment (Cloudflare) — D10

Plataforma confirmada: **Cloudflare Workers with Static Assets** (no Pages). Un solo Worker + un `wrangler.jsonc` sirve la SPA de Vite hoy (`assets.directory` + `not_found_handling: "single-page-application"`) y puede alojar rutas `/api/*` mañana (`assets.run_worker_first: ["/api/*"]`) — sin cambiar de plataforma. Detalle completo en [`deployment-cloudflare.md`](./deployment-cloudflare.md).

- **Env vars / secrets:** split estricto — `VITE_*` es **config pública** (se inlinea en el bundle) vs **Worker secrets** server-side (`wrangler secret put`, nunca en el bundle). Ninguna API key va en `VITE_*`.
- **Switch simulación → real (env-driven):** `VITE_BET_MODE=mock|real` elige `MockBettingService` vs un futuro `ClobBettingService` (rutea a `/api/bet`); `VITE_AI_MODE=user-key|proxy` reconcilia el demo (key del usuario en Settings, browser→OpenRouter) con prod (proxy `/api/ai/predict`, key server-side oculta).
- **Deploy on merge to `main`:** GitHub Actions corre el gate completo (lint+format, Vitest, 1 E2E Playwright) → build Vite → `wrangler deploy`. Rollback vía `wrangler rollback`/versions o git revert. Secrets requeridos: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (GitHub); `OPENROUTER_API_KEY` y creds CLOB (Worker, sólo en Fase 2).
- **Scope:** bonus/infra — no bloquea el widget core, que corre en local con `mock` + key de usuario.
