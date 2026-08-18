# Análisis y Arquitectura — Polymarket Widget

> Documento de decisiones que consolida el research y define el plan técnico.
> Coding challenge (48h). Ver detalles en:
> [`research-polymarket-api.md`](./research-polymarket-api.md) ·
> [`research-polymarket-product.md`](./research-polymarket-product.md) ·
> [`research-polymarket-sdks-builder.md`](./research-polymarket-sdks-builder.md) ·
> [`research-openrouter-ai.md`](./research-openrouter-ai.md) ·
> [`research-ramoslabs-ds.md`](./research-ramoslabs-ds.md)

## 1. Objetivo

**"Widget" = SPA custom estilo Polymarket** (Vue 3), NO el embed oficial de solo-lectura (ver D10). En una sola página permite: **buscar mercados**, **ver un mercado** con sus outcomes/precios, **colocar una apuesta builder-aware** (mock por defecto, con desglose de fees reales), y (bonus) **predicción asistida por IA**. UI/UX 100% con RamosLabs DS. Todo el I/O del browser (`fetch`) encapsulado en una capa de **servicios**.

## 2. Decisiones clave (fundamentadas en el research)

| # | Decisión | Justificación |
|---|---|---|
| D1 | **Datos de mercado y búsqueda: REALES** vía Gamma API (público, sin auth, CORS `*`) | No requiere key, browser-friendly, sin geoblock en reads |
| D2 | **Apuesta: MOCK por defecto** tras interfaz `BettingService` | **Corrección vs. veredicto previo:** la razón de mockear **YA NO es** "browser-only imposible" (desactualizado — cobrar builder fee/atribuir volumen NO requiere backend ni el secret del builder: basta el campo `builder` bytes32 en la orden que firma el usuario). La razón es **OPERATIVA**: (1) **geoblock por IP** en cada `POST /order` (33 países, incl. US/UK), (2) **VPN prohibida por ToS** → no diseñar alrededor de bypass, (3) **wallet fondeada** con USDC/pUSD + approvals ERC-20/1155. El brief del challenge lo **confirma explícitamente** ("to access Polymarket you'll need to use a VPN, since it may be restricted in your region") — el geoblock es real y esperado **incluso para reads**, lo que refuerza (no contradice) el mock-by-default. El entregable es un **repo de GitHub**, no un demo con apuesta real fondeada; por eso el demo mockea y el path real existe detrás del mismo interface (D12) |
| D3 | **Precio en vivo: CLOB `/price` opcional**; snapshot de Gamma basta para MVP | Menos llamadas, más simple; se puede enriquecer |
| D4 | **IA: OpenRouter, modelo free, opt-in** con key provista por el usuario en Settings (`localStorage`) | La feature es bonus/opcional; evita exponer key propia; disclaimer + mención de proxy como camino de producción |
| D5 | **Modelo IA con discovery en runtime** + fallback chain (`z-ai/glm-5.2:free` → nemotron → gpt-oss) | El roster `:free` cambia semanalmente; hardcodear un ID se rompe |
| D6 | **Tema claro únicamente** | El DS v0.1.0 no shippea dark mode; no inventar paleta dark |
| D7 | **Componentes propios token-only**, naming `SJ`/`W` | El DS no shippea componentes; regla token-only estricta |
| D8 | **Los custom components DEBEN seguir TODOS los lineamientos del DS** (no solo tokens): estados press-first, foco visible `--shadow-focus`, native-first, `<label>` persistente, radius/shadow/motion por rol, accesibilidad AA, patrones documentados (Interactive/Form Elements/Modals) | Instrucción explícita del usuario: "ramoslabs-ds me refiero a todo, incluso los custom components deben seguir sus lineamientos" |
| D9 | **Mobile-first bajo los lineamientos del DS**: base = 0 (móvil), 5 breakpoints `min-width` del DS, thumb-zone, touch ≥24×24 (aim 44), inputs ≥16px, patrón "Mobile First" del DS como fuente primaria | Instrucción explícita del usuario: "debe ser mobile first con las mismas condiciones" (= condiciones del DS) |
| D10 | **"Widget" = SPA custom estilo Polymarket** (Vue 3, este build); **embed oficial de solo-lectura DESCARTADO**, y **NO** reconstrucción ciega | El embed oficial (`embed.polymarket.com`, iframe) es **display-only**: no permite apostar in-frame (los botones "Buy" redirigen a polymarket.com con `?via=`), soporta **un solo mercado a la vez**, y **no atribuye volumen a una builder account**. El cliente tiene builder account ⇒ "widget" significa un frontend propio que consume las APIs públicas (Gamma reads reales) y modela el flujo de orden con `builderCode`, no un iframe afiliado |
| D11 | **Apuesta MOCK pero "builder-aware" de verdad**: el `BettingService` incorpora el **builderCode (bytes32)** configurable y **muestra el desglose REAL de fees** — notional, platform fee, builder fee **aditivo** (taker ≤100 bps / maker ≤50 bps), fórmula `fee = notional × bps / 10000` | El mock NO es un stub tonto: calcula y muestra fees reales y refleja el builder code en el receipt, tal como la doc de builders exige **divulgar el costo total antes de la firma**. Demuestra comprensión del ecosistema builder **sin** requerir fondos, backend ni geo-riesgo |
| D12 | **Path de orden REAL implementado detrás del MISMO interface `BettingService`, como stretch OPT-IN, NO ejecutado por defecto** | Usa `@polymarket/client` (SDK V2 TS) con **signer viem del browser** (`window.ethereum`/WalletConnect), firma L1 (`ClobAuth`) + Order struct V2 con el campo `builder`, deriva L2 del usuario, y `POST /order` al CLOB **sin backend** (la atribución de fee NO requiere el secret del builder; CLOB acepta submit por CORS). Existe en el código y es swappable, pero **gateado por flag/config**: el submit real está bloqueado por **geoblock (33 países)**, **wallet fondeada con USDC + approvals**, y **posible tier Verified** — por eso NO corre en el demo. Backend solo haría falta para relayer gasless / proteger el builder secret, fuera de alcance |

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

**`betting.service.ts`** — mock builder-aware con **la misma firma que compartiría la impl real** (D11, D12):
```ts
interface BettingService { placeBet(o: BetOrder): Promise<BetReceipt> }

// Desglose de fees compartido por mock y real (D11) — la doc de builders exige
// divulgar el costo total ANTES de la firma. fee = notional × bps / 10000, additivo.
function computeFees(notional: number, cfg: BuilderConfig): FeeBreakdown {
  const builderBps  = cfg.side === 'maker' ? cfg.builderMakerBps : cfg.builderTakerBps; // ≤50 / ≤100
  const builderFee  = (notional * builderBps)      / 10_000;
  const platformFee = (notional * cfg.platformBps) / 10_000; // 0 por defecto; additivo
  return { notional, builderBps, builderFee, platformBps: cfg.platformBps, platformFee,
           total: notional + builderFee + platformFee };
}

class MockBettingService implements BettingService {
  // valida size>0 y precio; cost/notional = size*price, shares = size/price (payout $1/share);
  // adjunta builderCode (bytes32, configurable, NUNCA hardcodeado real) + computeFees(...),
  // delay simulado, retorna BetReceipt { status:'filled', avgPrice, shares, cost,
  //   fees: FeeBreakdown, builderCode, txHash:'mock-0x…' }; persiste Position en bets.store.
}

// Stretch OPT-IN, detrás del MISMO interface, gateado por config (NO corre en el demo) — D12:
class ClobBettingService implements BettingService {
  // @polymarket/client createSecureClient({ signer: viem(window.ethereum) });
  // firma L1 ClobAuth + Order struct V2 con el campo `builder` = builderCode del usuario,
  // deriva L2 del usuario, POST /order al CLOB (sin backend para la atribución).
  // Bloqueado por geoblock (33 países) + wallet fondeada USDC/approvals + posible tier Verified.
}
```
El **builderCode es user-supplied/configurable** (env/settings; placeholder por defecto), **nunca hardcodeado a un valor real** en el repo. No es un secreto de seguridad (va público en la orden firmada), pero **debe ser reemplazable**.

**`openrouter.service.ts`** — ver [research IA §1–4](./research-openrouter-ai.md): `pickFreeModel()`, y **dos** predicciones (el brief pide asistir en elegir mercado **y** outcome): `predictOutcome(market, apiKey)` (recomienda outcome dentro de un mercado) y `recommendMarket(markets, apiKey)` (recomienda **cuál mercado** de la lista/resultados es más atractivo). Ambas usan el mismo ladder json_schema → json_object → fence-strip y validación (`recommendedOutcome` ∈ outcomes / `recommendedMarketId` ∈ ids visibles, clamp confidence, retry temp 0). Cada una: **una sola llamada por activación explícita**, nunca automática.

## 6. UX de la página (single page)

Layout vertical, mobile-first, mono-indigo:
1. **Header** — título + botón Settings (icono) para la key de IA.
2. **Search bar** (`WMarketSearch`) — input con `<label>`, debounce, estados loading/empty/error (live region).
3. **Lista de resultados** (`WMarketList` → `WMarketCard`) — pregunta, outcomes con % (barra), volumen/liquidez, imagen.
4. **Detalle de mercado** (`WMarketDetail`, modal o panel) — outcomes seleccionables (success/error + texto), precio, `WBetForm`.
5. **Bet form** (`WBetForm`) — outcome elegido, monto (input numérico ≥16px), cost/payout calculados en vivo, **desglose de fees builder-aware** (notional, platform fee, builder fee aditivo con la fórmula `notional×bps/10000`, total) mostrado **antes de confirmar** (obligación de builder: divulgar el costo total antes de la firma), botón "Place bet" → `WBetReceipt`.
6. **Bet receipt** (`WBetReceipt`) — toast + posición añadida; incluye el **builderCode (bytes32)** y el desglose de fees de la orden (mock builder-aware, D11).
7. **Posiciones** (`WPositions`) — apuestas simuladas persistidas.
8. **Predicción IA** (`WAiPrediction`) — **doble alcance opt-in** (el brief pide "use AI to assist in choosing a market and outcome"):
   - **Elegir mercado**: botón "AI: pick a market" sobre la lista/resultados de búsqueda; recomienda cuál mercado es más atractivo entre los visibles + rationale.
   - **Elegir outcome**: botón "AI suggestion" en el detalle; muestra outcome recomendado + barra de confidence + rationale.
   Ambos opt-in, **una sola llamada por activación explícita** (nunca automático), respetando el rate limit del free tier; si no hay key → CTA a Settings.

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
| **Geoblock por IP en `POST /order`** (33 países, incl. US/UK; check en cada submit + `polymarket.com/api/geoblock`) | El demo NO depende de trading real: mock builder-aware por defecto. El path real (D12) queda gateado por flag; el brief confirma que puede requerirse VPN incluso para reads |
| **VPN prohibida por ToS** | No diseñar alrededor de bypass; el mock es la lectura correcta del alcance de 48h. Disclaimer explícito en UI/docs |
| **Wallet fondeada requerida** para orden real (USDC/pUSD en Polygon + approvals ERC-20/1155) | Fuera de alcance del demo; solo aplica al stretch opt-in (D12), nunca en el flujo por defecto |
| **Cobrar fees "de verdad" puede exigir tier Verified** (aprobación manual del builder) | INFERENCIA: unverified da volumen/leaderboard; el mock muestra el desglose de fees sin depender del tier. Documentado como condicionante del path real |
| builderCode hardcodeado a un valor real | Tratarlo como **config** (env/settings), placeholder por defecto, reemplazable; no es secreto pero nunca un valor real en el repo |
| Key IA expuesta | User-supplied + localStorage + disclaimer; proxy documentado como prod |
| Fuentes no bundleadas | Cargar Rubik/Red Hat Display; fallback `system-ui` |
| Dark mode no soportado | Solo tema claro; documentado |

## 9. Decisiones confirmadas por el usuario

- **Lenguaje: TypeScript.** Contratos tipados para services/modelos.
- **Precios: snapshot de Gamma (`outcomePrices`) en el MVP.** CLOB `/price` en vivo queda como enhancement posterior.
- **Testing: unit (Vitest) + 1 E2E (Playwright)** del flujo buscar → apostar.
- **Widget = SPA custom estilo Polymarket** (D10), NO el embed oficial de solo-lectura ni reconstrucción ciega. Reads reales vía Gamma.
- **Apuesta MOCK por defecto pero builder-aware** (D11): el `BettingService` incorpora el builderCode (bytes32) y muestra el desglose real de fees (builder taker ≤100 / maker ≤50 bps, additivo al platform fee, `fee = notional × bps / 10000`).
- **Path de orden REAL detrás del mismo interface como stretch OPT-IN y gateado** (D12): `@polymarket/client` + signer viem del browser + campo `builder`, sin backend para la atribución; NO corre en el demo (geoblock + fondos + posible Verified).
- **Razón de mockear = OPERATIVA, no técnica** (D2 corregido): geoblock por IP + VPN prohibida por ToS + wallet fondeada; NO "browser-only imposible".
- **builderCode user-supplied/configurable** (placeholder), nunca hardcodeado a un valor real; config, no secreto pero sí reemplazable.
- **IA asiste en elegir mercado Y outcome** (brief: "assist in choosing a market and outcome"), ambos opt-in y una sola llamada explícita.
