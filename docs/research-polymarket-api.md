# Research: Polymarket API (para el widget Vue 3)

> Scope: (1) buscar mercados, (2) mostrar mercado + outcomes + precios, (3) colocar apuesta.
> **Veredicto:** las lecturas (búsqueda + precios) son **reales, públicas y browser-friendly**;
> la colocación de apuestas **no es viable solo-browser** y se **mockea tras una abstracción**.

---

## 1. GAMMA API — datos y búsqueda de mercados

**Base:** `https://gamma-api.polymarket.com` · **Auth:** **Ninguna** (REST público read-only) · **Método:** todo `GET`.

### Endpoints

| Propósito               | Endpoint                   |
| ----------------------- | -------------------------- |
| Listar/filtrar mercados | `GET /markets`             |
| Mercado por id          | `GET /markets/{id}`        |
| Mercado por slug        | `GET /markets/slug/{slug}` |
| Listar/filtrar eventos  | `GET /events`              |
| **Full-text search**    | `GET /public-search`       |

### Query params clave (`/markets`, `/events`)

| Param                                           | Significado                                                 |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `limit`, `offset`                               | Paginación                                                  |
| `order`                                         | `volume`, `volume24hr`, `liquidity`, `startDate`, `endDate` |
| `ascending`                                     | Dirección (default `false`)                                 |
| `active`                                        | Solo tradables/no resueltos                                 |
| `closed`                                        | Resueltos                                                   |
| `tag_id` / `tag_slug`                           | Categoría                                                   |
| `liquidity_num_min/_max`, `volume_num_min/_max` | Bandas                                                      |
| `clob_token_ids`, `condition_ids`               | Lookup                                                      |
| `enableOrderBook`                               | Solo CLOB-tradables                                         |

> **Version note:** existe variante keyset (`/markets/keyset` con `after_cursor`) donde `offset` puede dar **422**. El clásico `limit`+`offset` es el default seguro; si aparece 422, cambiar a cursor.

### `/public-search`

`GET /public-search?q=<text>&limit_per_type=<n>&events_status=active` → agrupa `{ events, tags, profiles }`, cada event con sus `markets`. **Camino simple para el search box:** `public-search` → render `events[].markets[]`.

### Objeto Market — campos relevantes

```jsonc
{
  "id": "507081",
  "question": "Will Bitcoin exceed $100,000 by end of 2025?",
  "slug": "bitcoin-above-100k-2025",
  "conditionId": "0x1234abc...",
  "outcomes": "[\"Yes\", \"No\"]", // STRING JSON-encoded
  "outcomePrices": "[\"0.62\", \"0.38\"]", // STRING JSON-encoded, 0..1 = prob implícita
  "clobTokenIds": "[\"7190...\", \"2836...\"]", // STRING JSON-encoded; [YES tokenId, NO tokenId]
  "volume": "5250000",
  "volumeNum": 5250000,
  "liquidity": "125000",
  "liquidityNum": 125000,
  "endDate": "2025-12-31T23:59:59Z",
  "image": "https://...",
  "icon": "https://...",
  "active": true,
  "closed": false,
  "enableOrderBook": true,
  "negRisk": false,
}
```

**⚠️ Gotcha crítico (#1 bug de integración):** `outcomes`, `outcomePrices`, `clobTokenIds` vienen como **strings JSON-encoded**, no arrays. Hay que `JSON.parse()`. Están alineados posicionalmente 1:1:

```js
const outcomes = JSON.parse(m.outcomes) // ["Yes","No"]
const prices = JSON.parse(m.outcomePrices) // ["0.62","0.38"] -> 62%/38%
const tokenIds = JSON.parse(m.clobTokenIds) // [yesTokenId, noTokenId]
// outcomes[i] <-> prices[i] <-> tokenIds[i]
```

### URLs de ejemplo

```
# Top por volumen, tradables
https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume&ascending=false&limit=20
# Filtrado por liquidez
https://gamma-api.polymarket.com/markets?closed=false&liquidity_num_min=10000&order=liquidity&ascending=false&limit=20
# Búsqueda por texto
https://gamma-api.polymarket.com/public-search?q=bitcoin&limit_per_type=10&events_status=active
# Mercado único
https://gamma-api.polymarket.com/markets/slug/bitcoin-above-100k-2025
```

### CORS — Gamma

**Fetch-able desde `http://localhost`.** Gamma sirve `Access-Control-Allow-Origin: *`; `fetch()` directo desde Vite dev (`localhost:5173`) funciona sin proxy. **Contingencia:** si alguna red devuelve fallo CORS/opaque, agregar un Vite dev proxy (`server.proxy` en `vite.config.ts`) — cero cambio en la capa de fetch.

---

## 2. CLOB API — order book y trading

**Base:** `https://clob.polymarket.com`

### Read endpoints públicos (SIN auth) — precios en vivo

| Endpoint              | Params                                   | Devuelve                               |
| --------------------- | ---------------------------------------- | -------------------------------------- |
| `GET /book`           | `token_id`                               | `bids`+`asks`, `tick_size`, `neg_risk` |
| `GET /price`          | `token_id`, `side=BUY\|SELL`             | Mejor precio de un lado                |
| `GET /midpoint`       | `token_id`                               | Midpoint                               |
| `GET /prices-history` | `market`, `startTs`, `endTs`, `interval` | Serie histórica (chart)                |
| `GET /tick-size`      | `token_id`                               | Incremento mínimo                      |

El `token_id` es un valor del `clobTokenIds` parseado. **Flujo:** Gamma da `clobTokenIds` → CLOB `/book` o `/price` da el precio tradable en vivo. También sin auth y CORS-accesibles. El `outcomePrices` de Gamma ya es snapshot suficiente para el MVP; CLOB `/price` es el quote live opcional.

### Colocar apuesta — requisitos reales

`POST /order` necesita **todo**: (1) wallet fondeada en Polygon con USDC + allowances ERC-20/1155 al Exchange; (2) **L1 auth** (firma EIP-712 `ClobAuthDomain` v1 chainId 137) → `POST /auth/api-key` → `{apiKey, secret, passphrase}`; (3) **L2 auth** por request (HMAC-SHA256 con headers `POLY_ADDRESS/API_KEY/PASSPHRASE/TIMESTAMP/SIGNATURE`); (4) **segunda firma EIP-712** del Order struct. SDKs oficiales (`@polymarket/clob-client`, `py-clob-client`) existen porque el signing/HMAC es error-prone y corren en **Node/backend**.

### ¿Solo-browser? **No, realistamente no.**

- L2 requiere guardar el **secret** HMAC; ponerlo en JS/localStorage lo expone — viola el modelo de seguridad.
- Requiere wallet provider (MetaMask/WalletConnect), USDC real, allowances pre-aprobadas.
- **Geoblocking** bloquea endpoints de trading por IP/región aunque la cripto sea correcta.

**Mock bet realista para el challenge:** `placeBet({ marketId, tokenId, outcome, side, size, priceLimit })` que (a) valida contra el book/price en vivo, (b) computa cost = `size × price`, payout potencial = `size × 1.00` (shares resuelven a $1), retorno implícito, (c) registra la posición en estado local (Pinia + localStorage), (d) retorna fill simulado `{ status:'filled', avgPrice, shares, cost, txHash:'mock-0x…' }` tras un delay. **Misma firma** que una llamada CLOB real.

---

## 3. Constraints — geo-restricción y CORS

- Polymarket **geobloquea ~33 países** (US, UK, varios EU) del **trading** (tiers "block"/"close-only", aplican a frontend/API/ambos).
- **Distinción clave:** el geoblock apunta a **colocación de órdenes**, no a datos. **Los read endpoints (Gamma, CLOB `/book`/`/price`/`/prices-history`) son globales y sin auth** — se puede buscar y mostrar precios en vivo desde región restringida **sin VPN**. Solo `POST /order` (y cancels) están gated.
- **VPNs prohibidas** por ToS §2.1.4 y detectadas → cuentas a close-only/cerradas. **No** diseñar el entregable alrededor de bypass de geoblock.
- **CORS ≠ geoblock.** Gamma retorna `*` → reads en localhost funcionan. Para un widget read-only, nada bloquea.

---

## Arquitectura recomendada (48h) — DECISIÓN

| Capacidad             | Implementación                                                                | Real/Mock                                     |
| --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| Buscar mercados       | Gamma `GET /public-search?q=`                                                 | **REAL**                                      |
| Listar/browse         | Gamma `GET /markets?closed=false&active=true&order=volume&limit=20`           | **REAL**                                      |
| Detalle + outcomes    | Gamma `GET /markets/slug/{slug}` + parse                                      | **REAL**                                      |
| Precio en vivo / book | CLOB `GET /price` o `/book`                                                   | **REAL** (opcional; snapshot Gamma basta MVP) |
| **Colocar apuesta**   | `BettingService.placeBet()` → fill simulado; posiciones en Pinia+localStorage | **MOCK** con interfaz swappable               |

```ts
interface BettingService {
  placeBet(o: BetOrder): Promise<BetReceipt> // { tokenId, outcome, side, size, priceLimit }
}
// MockBettingService -> valida vs precio live, simula fill, guarda posición
// ClobBettingService -> (futuro) wallet signing + L1/L2 + POST /order, server-side
```

**Notas de build:**

- Cero API keys / `.env` secrets para todo el path real — todo es GET público.
- Manejar los **arrays string JSON-encoded** (`JSON.parse`) — el bug #1.
- Vite dev proxy listo como fallback CORS, pero fetch directo debería funcionar.
- Precios 0–1 = prob implícita → render `%`. Shares pagan $1 en resolución → math del mock payout.

## Fuentes

- Polymarket Docs (Gamma, Search, CLOB Orders, Geoblock) — docs.polymarket.com
- Geographic Restrictions — help.polymarket.com
- Polymarket GitHub (`gamma.py`, py-clob-client)
- Chainstack, Parlay.run (CLOB V2), AgentBets — guías de desarrollador
