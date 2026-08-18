# Research: Polymarket SDKs + Builder ecosystem (para el widget Vue 3)

> Scope: mapear APIs/SDKs oficiales y, sobre todo, el **Builder Program** (el cliente tiene builder account).
> Actualiza y **corrige** `docs/research-polymarket-api.md`.
> **Titular:** desde CLOB **V2** existe un **Builder Program oficial** con **builder code (bytes32)** y **builder fees**.
> Esto cambia el marco anterior: colocar una apuesta **real con atribución a la builder account es técnicamente posible desde el browser** (wallet del usuario), aunque con condicionantes duros (wallet fondeada + approvals + **geoblock por IP**). El SDK oficial y los ejemplos de referencia **usan backend**, pero por proteger el _secret del builder_, no por imposibilidad del browser.
> Convención: **HECHO** = confirmado en docs.polymarket.com o repos oficiales · **INFERENCIA** = deducción/fuente terciaria.

Fecha: 2026-08-18. Punto de partida: https://docs.polymarket.com/getting-started/sdks-apis

---

## 1. Catálogo de APIs oficiales (CONFIRMADO / CORREGIDO)

Fuente: https://docs.polymarket.com/getting-started/api

| API          | Base URL                                        | Auth                                                                                                                 | CORS browser                            | Qué expone                                                                                                   |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Gamma**    | `https://gamma-api.polymarket.com`              | **Ninguna** (público)                                                                                                | **Sí** (`ACAO: *`)                      | Descubrir events/markets + metadata; `/public-search`. **HECHO**                                             |
| **CLOB**     | `https://clob.polymarket.com`                   | **Lectura: ninguna**; **Escritura: L1 (EIP-712) + L2 (HMAC-SHA256)**                                                 | Lectura: sí. Escritura: **sí** (ver §4) | Precios, order book, y **place/manage orders**. **HECHO**                                                    |
| **Data API** | `https://data-api.polymarket.com`               | Docs la marcan **L2 (HMAC)**; en la práctica varios endpoints (positions/value/holders por address) son **públicos** | Parcial                                 | Posiciones, actividad, participación. **HECHO base URL; auth = matiz (INFERENCIA sobre endpoints públicos)** |
| **Relayer**  | `https://relayer-v2.polymarket.com` (`/submit`) | **L1 (EIP-712)** + Relayer/Builder API key                                                                           | Orientado a backend                     | Transacciones **gasless** (deploy wallet, approvals, split/merge/redeem CTF). **HECHO**                      |

### WebSockets (CONFIRMADO — nuevo detalle vs research anterior)

| Stream               | URL                                                    | Auth    | Uso                                             |
| -------------------- | ------------------------------------------------------ | ------- | ----------------------------------------------- |
| CLOB market          | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | Ninguna | Order book / precio / lifecycle público         |
| CLOB user            | `wss://ws-subscriptions-clob.polymarket.com/ws/user`   | L1 + L2 | Órdenes/trades del propio account               |
| **RTDS** (live data) | `wss://ws-live-data.polymarket.com`                    | Ninguna | Precios de referencia, comments, trade activity |
| Sports               | `wss://sports-api.polymarket.com/ws`                   | Ninguna | Estado/scores de juegos en vivo                 |

> **Contraste con research previo:** el catálogo Gamma/CLOB lectura sigue **correcto**. Lo nuevo/actualizado: (a) existe **Data API** y **Relayer** como APIs de primera clase; (b) hay **4 canales WS** (antes no documentados); (c) el modelo de auth L1+L2 se confirma tal cual; (d) aparece **CLOB V2** con builder code.
> Endpoints de lectura CLOB (`/book`, `/price`, `/midpoint`, `/prices-history`, `/tick-size`) y todo el mapeo de Gamma del research anterior **siguen vigentes** (incluido el gotcha de `outcomes`/`outcomePrices`/`clobTokenIds` como **strings JSON-encoded** — sin cambios).

---

## 2. SDKs oficiales (ACTUALIZADO — nombres nuevos)

Fuente: https://docs.polymarket.com/getting-started/sdks-apis · /typescript · /python

**Los SDKs se renombraron en V2.** El research anterior citaba `@polymarket/clob-client`; sigue existiendo (v4.x) pero el **nuevo oficial** es:

| SDK                     | Paquete                                   | Lenguaje        | Estado                                                                                             |
| ----------------------- | ----------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| **TS (nuevo)**          | `@polymarket/client`                      | TypeScript/Node | Oficial V2. `createPublicClient()` (lectura) / `createSecureClient({signer})` (trading). **HECHO** |
| Python (nuevo)          | `polymarket-client` (`AsyncSecureClient`) | Python          | Oficial V2. **HECHO**                                                                              |
| Rust                    | —                                         | Rust            | En desarrollo. **HECHO**                                                                           |
| CLOB TS (legacy)        | `@polymarket/clob-client` (^4.22)         | TS/Node         | Aún usado por ejemplos oficiales. **HECHO**                                                        |
| py-clob-client (legacy) | `py-clob-client`                          | Python          | Legacy. **HECHO**                                                                                  |
| Builder relayer         | `@polymarket/builder-relayer-client`      | TS              | Deploy Safe + approvals gasless. **HECHO**                                                         |
| Builder signing         | `@polymarket/builder-signing-sdk`         | TS              | Genera HMAC del builder. **HECHO**                                                                 |

**Browser vs Node:** El SDK acepta **adapters de wallet** (`viem`, `@privy-io/node`, `ethers-v5`). Los ejemplos de docs usan `privateKey(process.env.POLYMARKET_PRIVATE_KEY)` → orientados a **Node/backend**. **No hay un modo browser documentado explícitamente**, PERO el signer es pluggable: un signer de wallet del navegador (viem con `window.ethereum` / WalletConnect) encaja en la misma interfaz. **INFERENCIA (alta confianza):** el core es JS puro; corre en browser si el signer es un provider del navegador, no una private key en env.

---

## 3. BUILDER / Order Builder (crítico — CONFIRMADO)

Fuentes: https://docs.polymarket.com/builders/overview · https://docs.polymarket.com/builders/fees · https://docs.polymarket.com/trading/wallets-auth

### 3.1 Qué es un builder (HECHO)

"A builder is a person, group, or organization that **routes orders from users to Polymarket**." Si operas una app donde usuarios tradean en Polymarket a través de tu sistema, calificas.

### 3.2 Builder code (HECHO)

- Es un **`bytes32`** único asignado a tu perfil de builder.
- Se obtiene en **polymarket.com → Settings → Builders tab** (`https://polymarket.com/settings?tab=builder`).
- Se **serializa on-chain como parte de la orden firmada** (campo `builder` en el Order struct V2). Aparece en el evento `OrderFilled` como `builder`.

### 3.3 Cómo cobra fees un builder (HECHO)

- **Builder fees = porcentaje flat del notional**, additivas: **se suman** al platform fee, no lo reemplazan (un market con platform fee 0 igual puede cobrar builder fee).
- Fórmula: `builder_fee = notional × builder_fee_rate_bps / 10000`. Ej: orden 1.000 pUSD @ 100 bps → **10 pUSD**.
- **Límites:** taker ≤ **100 bps (1%)**, maker ≤ **50 bps (0.5%)**, granularidad 1 bp. Cambios de tasa: **1 cada 7 días**, con **3 días** de aviso.
- Flujo de indexación: CLOB valida orden + builder code → **Builders Service** indexa `OrderFilled` → acredita volumen/fees al builder (hasta ~24 h para reflejar en leaderboard `https://builders.polymarket.com`).
- **El end-user paga** ambos fees; docs exigen **mostrar el costo total** (builder rate + platform fee) antes de enviar.

### 3.4 ¿Attach del builder code requiere el secret del builder? — **NO (HECHO, clave)**

De `wallets-auth`: _"attaching a builder code does NOT require the builder's secret — only the `bytes32` builder field value. The builder's secret remains server-side and never touches the client or order submission."_

- **Dos credenciales distintas — no confundir:**
  - **Order submission auth = credenciales L2 del USUARIO** (API key/secret/passphrase derivadas de la wallet del usuario). Firmar/HMAC con **el secret del propio usuario en su propio browser es aceptable** (es su sesión).
  - **Builder API key/secret = del BUILDER**; sólo se necesita para **crear Deposit Wallets a usuarios** y para el **Relayer/tiers gasless**. **Ese** secret es el que exige backend.
- **Consecuencia:** para **cobrar builder fee/atribuir volumen basta con poner tu `bytes32` en el campo `builder`** de la orden que el usuario firma. No requiere tu secret → **no requiere backend** para la atribución.

### 3.5 Flujo end-to-end de una orden de builder (HECHO + INFERENCIA marcada)

1. Usuario conecta su wallet (Deposit/Safe/Proxy/EOA) y decide comprar shares de un outcome.
2. App deriva/crea las **credenciales L2 del usuario**: L1 firma EIP-712 `ClobAuth` → `POST /auth/derive-api-key` (o `/auth/api-key`) con headers `POLY_ADDRESS`, `POLY_SIGNATURE`, `POLY_TIMESTAMP`, `POLY_NONCE`. **HECHO** (docs afirman "no en browser solo", pero es **INFERENCIA del summarizer**: la firma L1 se produce con la wallet del browser y el POST es un fetch normal → **factible en browser** salvo bloqueo CORS/geo).
3. App construye el **Order struct V2** (`salt, maker, signer, tokenId, makerAmount, takerAmount, side, signatureType, timestamp(ms), metadata, builder`) — **el `builder` = tu bytes32**. Nota: en V2 **desaparecen `nonce`, `feeRateBps`, `taker`** del struct; el fee lo maneja el cliente/servicio. **HECHO**
4. Usuario **firma el Order struct** (EIP-712) con su wallet.
5. App envía `POST /order` a CLOB con **L2 HMAC del usuario** (headers `POLY_ADDRESS/API_KEY/PASSPHRASE/TIMESTAMP/SIGNATURE`).
6. CLOB matchea; **Polymarket cubre el gas** (relayer); volumen/fee se acreditan al builder.
7. (Opcional) gasless deploy de Safe/approvals vía `@polymarket/builder-relayer-client` → `relayer-v2.polymarket.com/submit` — **esto sí usa builder/relayer key (backend).** **HECHO**

### 3.6 El ejemplo oficial de referencia (HECHO — muy revelador)

`github.com/Polymarket/magic-safe-builder-example` = **Next.js** (Magic Link + Gnosis Safe). **Coloca órdenes REALES en producción.**

- **Frontend (browser):** auth Magic, UI, **y el POST de la orden a CLOB** (⇒ **CLOB acepta CORS de browser para submit** — HECHO por implicación).
- **Backend (`/api/polymarket/sign`):** sólo para **generar el HMAC con las credenciales del builder** sin exponer el secret.
- README advierte que exponer el builder key al cliente es inseguro → por eso el backend. Confirma §3.4: **el backend existe por el secret del builder, no porque el browser no pueda firmar/enviar órdenes.**
- Otros ejemplos oficiales: `magic-proxy-builder-example`, `turnkey-safe-builder-example`, `privy-safe-builder-example`, `safe-wallet-integration`, `builder-relayer-client`.

---

## 4. Viabilidad browser-only (sin backend)

| Capacidad                                      | ¿Browser-only sin backend?                                                                                      | Qué exige                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Leer mercados/precios/book**             | **SÍ, real**                                                                                                    | Gamma + CLOB reads + WS. Público, CORS `*`, global. **HECHO**                                                                                                                                                                                                     |
| **(b) Colocar una orden REAL**                 | **SÍ es técnicamente posible**                                                                                  | Wallet del usuario (viem/WalletConnect) firma L1+Order; derivar **L2 del usuario** en browser; `POST /order` con HMAC del usuario. CLOB **acepta CORS** (ej. oficial lo hace desde el frontend). **NO necesita el secret del builder.** **HECHO/INFERENCIA alta** |
| **(c) Cobrar builder fees / atribuir volumen** | **SÍ para la atribución** (poner tu `bytes32` en `builder`); **NO** para relayer gasless/deploy con builder key | Atribución = sólo el campo `builder`. Gasless/relayer y crear wallets = **builder secret → backend**. **HECHO**                                                                                                                                                   |

**Lo que un backend SÍ exige (HECHO):** proteger el **builder API secret** (relayer gasless, deploy de Safe/Deposit wallets, crear wallets a usuarios). **Lo que NO exige backend:** lectura, firma de orden del usuario, y **la atribución de fee vía builder code**.

**Bloqueos duros no técnicos (HECHO):**

- **Geoblock por IP:** exchange internacional bloquea **33 países (incl. EE.UU., UK, varios EU)** en la **submission de órdenes** (check en cada `POST /order`, y `polymarket.com/api/geoblock`). Aplica **da igual browser o backend**. Existe **Polymarket US** (regulado CFTC, dic-2025) pero **invite-only** hasta ~Q3–Q4 2026.
- **VPN prohibida** por ToS → no diseñar alrededor de bypass.
- **Wallet fondeada:** el usuario necesita **USDC/pUSD real en Polygon + approvals ERC-20/1155** antes de tradear.
- **Cobrar fees "de verdad"** probablemente requiere tier **Verified** (aprobación manual: builder key + use-case + volumen esperado). Unverified: volumen/leaderboard sí; cobro de fee = **INFERENCIA** (docs permiten configurar fee sin decir que exige verificación).

---

## 5. Recomendación para el coding challenge (SPA Vue single-page)

**¿La builder account permite hacer la apuesta REAL, o sigue siendo mock?**

- **Respuesta matizada (actualiza el veredicto anterior):** **Sí existe un camino REAL browser-only** — usuario conecta su propia wallet (viem + WalletConnect/injected), la SPA firma L1+Order y hace `POST /order` con el `bytes32` del builder → **apuesta real + atribución a la builder account, sin backend.** El research previo ("no viable browser-only, mock siempre") queda **parcialmente desactualizado**: el bloqueo real ya **no es el browser**, sino **(1) geoblock por IP, (2) wallet fondeada con USDC+approvals, (3) UX/seguridad del signing**.
- **Para el challenge en concreto, sigue siendo mucho más sensato MOCKEAR la colocación**, por: geoblock (probable región restringida), necesidad de fondos reales, approvals, y superficie de firma/seguridad que no aporta al challenge. Mantener **la misma abstracción `BettingService`** del research anterior.
- **Diferenciador realista y de bajo riesgo:** hacer el mock **builder-aware de verdad** — incluir en el `BetOrder`/receipt el **builder code (bytes32)**, `builderFeeBps`, y **mostrar el desglose de costo** (notional, platform fee, builder fee additive con la fórmula `notional×bps/10000`) tal como exige la doc de builders. Esto demuestra comprensión del ecosistema builder **sin** requerir fondos ni backend.
- **Camino "real opcional" (si el evaluador lo pide y la IP no está geobloqueada):** integrar `@polymarket/client` con signer `viem` de la wallet del browser, `createSecureClient`, y enviar la orden con el `builder` field. Implementable **sin backend** para la atribución; sólo se añadiría backend si se quiere relayer gasless (proteger builder secret). Documentar como _stretch goal_ detrás del mismo interface.

---

## 6. Resumen ejecutivo (accionable)

1. **Builder Program es real y oficial (CLOB V2):** builder code = `bytes32`, se obtiene en polymarket.com/settings?tab=builder, se serializa en la orden firmada.
2. **Cobrar builder fee = sólo poner tu `bytes32` en el campo `builder` de la orden** — **NO requiere el secret del builder ni backend** (HECHO, `wallets-auth`).
3. **El backend en los ejemplos oficiales existe sólo para proteger el builder secret** (relayer gasless / crear wallets), **no** porque el browser no pueda firmar/enviar órdenes.
4. **CLOB acepta submit de órdenes por CORS desde el browser** (el ejemplo oficial `magic-safe-builder-example` postea la orden desde el frontend Next.js) → **HECHO por implicación**.
5. **Apuesta real browser-only es técnicamente posible:** wallet del usuario (viem/WalletConnect) firma L1+Order, deriva L2 del usuario, `POST /order` con builder code. Actualiza el veredicto previo de "imposible browser-only".
6. **Pero los blockers reales son no-técnicos:** **geoblock por IP (33 países, incl. US/UK)** en cada `POST /order`, **wallet fondeada USDC+approvals**, y VPN prohibida por ToS.
7. **Fees:** taker ≤100 bps, maker ≤50 bps, additivas al platform fee; `fee = notional×bps/10000`; cambio 1/7días con 3 días de aviso; el end-user paga y hay que **mostrar el costo total**.
8. **SDKs renombrados en V2:** nuevo `@polymarket/client` (TS) y `polymarket-client` (Py); legacy `@polymarket/clob-client`/`py-clob-client` siguen. Más `@polymarket/builder-relayer-client` y `@polymarket/builder-signing-sdk`.
9. **Catálogo API actualizado:** + **Data API** (`data-api.polymarket.com`), + **Relayer** (`relayer-v2.polymarket.com`), + **4 WebSockets** (market/user/RTDS/sports). Gamma/CLOB-read del research previo siguen correctos, incluido el gotcha de arrays JSON-encoded.
10. **Cobrar fee "de verdad" probablemente exige tier Verified** (aprobación manual) — INFERENCIA; unverified da volumen/leaderboard seguro.
11. **Recomendación para el challenge:** **MOCK builder-aware** — misma abstracción `BettingService`, pero el receipt incluye builder code + desglose builder/platform fee. Alto valor demostrativo, cero fondos/backend/geo-riesgo.
12. **Stretch goal real (opcional):** `@polymarket/client` + signer viem del browser + `builder` field, sin backend para atribución; backend sólo si se busca relayer gasless.

---

## Fuentes

- https://docs.polymarket.com/getting-started/sdks-apis · /getting-started/api · /getting-started/typescript · /getting-started/python
- https://docs.polymarket.com/builders/overview · https://docs.polymarket.com/builders/fees
- https://docs.polymarket.com/trading/wallets-auth · https://docs.polymarket.com/developers/builders/relayer-client
- https://docs.polymarket.com/api-reference/geoblock
- github.com/Polymarket: magic-safe-builder-example, magic-proxy-builder-example, turnkey-safe-builder-example, privy-safe-builder-example, builder-relayer-client, safe-wallet-integration
- botforkalshi.com/blog/polymarket-builder-program-guide · parlay.run/polymarket-api (terciarias)
