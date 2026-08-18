# Investigación de producto: ¿Qué es un "widget" de Polymarket?

> Investigación de producto/frontend para el proyecto `ed-aoro-polimarket`.
> Objetivo: entender qué es Polymarket como producto real, si ofrece embeds/widgets
> oficiales, qué es el programa "Builder", y qué patrones de UI imitar.
>
> **Convención:** `[HECHO]` = verificado en fuente oficial o directa. `[INFERENCIA]` =
> deducción razonada a partir de la evidencia, no confirmada literalmente.
>
> Fecha: 2026-08-18

---

## TL;DR (respuesta a la pregunta central)

- **"Widget" puede significar 3 cosas distintas.** Polymarket ofrece un **embed oficial
  de solo-lectura** (iframe), tiene un **programa Builder** para construir frontends
  que enrutan órdenes reales, y expone **APIs públicas** (Gamma/CLOB) para SPAs custom.
- El **embed oficial NO permite apostar dentro del iframe**: muestra datos en vivo y
  los botones "Buy"/"View Market" **redirigen a polymarket.com** (con código de afiliado
  `?via=`). Es un componente de *display*, no de *trading*. `[HECHO/INFERENCIA]`
- Si el cliente tiene **cuenta builder**, "widget" casi seguro significa **SPA/frontend
  custom que enruta órdenes al CLOB con su `builderCode`** para atribuir volumen y cobrar
  builder fees — NO el embed oficial (que no atribuye volumen ni permite trading propio).

---

## 1. El sitio polymarket.com — estructura y UI

### Home / listado de mercados `[HECHO]`
Fuente: `https://polymarket.com/`, `https://polymarket.com/predictions/cards`

- Polymarket se autodescribe como **"the world's largest prediction market"**.
- **Patrón central = feed de cards**, no un terminal de trading. El diseño se acerca más
  a un sitio de noticias (comparado con Reuters) que a un exchange de cripto. Esta
  decisión reframea "trading financiero complejo" → "interactuar con las noticias".
- **Carrusel superior** de eventos destacados (aprox. 7 slots) con mercados de alto volumen.
- **Grid de cards** debajo, con filtros/orden: **24hr Volume**, estado **All / Active**,
  y toggles de categoría (**Hide sports, Hide crypto, Hide earnings**).
- Categorías típicas: política/elecciones, deportes, cripto, decisiones de la Fed, IPOs,
  asuntos internacionales.

### Anatomía de una card de mercado `[HECHO]`
Cada card muestra:
- **Título = la pregunta** del mercado (ej. "USA to Win Most Gold Medals").
- **Imagen/thumbnail** del evento (logos de equipos, fotos, iconos de categoría).
- **Outcomes con % de probabilidad en tiempo real** (probabilidad como display primario,
  no centavos).
- **Volumen** (ej. "$1B Vol", "$5m Vol").
- **Tag de categoría** clicable.
- **Fecha de expiración / tiempo restante** cuando aplica.
- Flechas indicando si el precio subió/bajó. `[HECHO]`
- En la card expandida en home: sección de **comentarios** de comunidad y **noticias
  relacionadas** (Reuters, Bloomberg, WSJ). `[HECHO]`

### Cómo se muestran probabilidades y precios `[HECHO]`
- Modelo binario: cada mercado tiene tokens **YES** y **NO**. Cada share paga **$1 si
  acierta, $0 si falla**. **YES + NO = $1 siempre** (si YES=$0.65, NO=$0.35).
- `precio en ¢ = probabilidad implícita en %` (YES a 30¢ ⇒ 30% de probabilidad).
- Timelines de probabilidad con **gráficas de línea limpias, color-coded por outcome**
  (NO candlesticks). Prioriza claridad sobre densidad de datos.

### Detalle del mercado y UI de apuesta `[HECHO]`
Fuentes: `docs.polymarket.com/concepts/prices-orderbook`,
`help.polymarket.com/.../limit-orders`, `docs.polymarket.com/.../no-limits`

- Motor = **CLOB (Central Limit Order Book)**. Los precios NO los fija Polymarket;
  emergen de oferta/demanda entre usuarios (se trade contra otros usuarios, no contra
  la casa).
- **Order book** con dos lados (bids/asks); el **spread** es la brecha entre mejor bid y
  mejor ask.
- **Tipos de orden:** *Market order* (limit priced para ejecutar inmediatamente contra
  órdenes en reposo) y *Limit order* (precio exacto; puede quedar en el libro y hacer
  **partial fill**).
- **Sin límites de tamaño** de orden por diseño (aunque grandes órdenes mueven el precio).
- La UI de trading está optimizada para **thumb-zone móvil**: botones Yes/No, input de
  precio y confirmación alcanzables con un pulgar. `[HECHO]`
- **Cripto invisible:** wallets embebidas + account abstraction ocultan la complejidad
  blockchain al usuario. `[HECHO]`
- Limitaciones observadas del sitio: **order book poco visible en browsing**, sin datos de
  volumen por contrato en la vista de exploración, herramientas de portfolio delgadas.
  `[HECHO]` (según análisis de terceros)

### Jerarquía visual (resumen) `[INFERENCIA]` a partir de lo anterior
1. Imagen + pregunta (gancho tipo noticia).
2. Outcomes con % grande y prominente (comprensible para no-traders).
3. Botones de acción Yes/No color-coded.
4. Volumen + tiempo restante como metadatos secundarios.
5. Order book / gráfica / comentarios en el detalle, no en la card.

---

## 2. ¿Existe un embed/widget oficial? — SÍ (solo-lectura)

### Fuentes oficiales
- **Builder de embeds:** `https://embed.polymarket.com/` `[HECHO]`
- **Doc oficial:** `https://help.polymarket.com/en/articles/13364174-how-to-use-embeds`
  (redirige desde `docs.polymarket.com/polymarket-learn/FAQ/embeds`) `[HECHO]`
- **Ejemplo en vivo:**
  `https://embed.polymarket.com/market.html?market=<slug>&features=volume&theme=dark` `[HECHO]`

### Mecanismo exacto `[HECHO]`
Es un **`<iframe>`** que apunta a `embed.polymarket.com`. Snippet literal generado por
el builder oficial (`embed.polymarket.com`):

```html
<figure class="polymarket-embed" style="position:relative;display:inline-block;margin:0">
  <iframe
    title="polymarket-market-iframe"
    src="https://embed.polymarket.com/market?"
    width="400"
    height="400"
    frameborder="0"
    allowtransparency="true">
  </iframe>
</figure>
```

- Base URL: `https://embed.polymarket.com/market?` con parámetros anexados.
- El ejemplo en vivo usa la ruta `.../market.html?market=<slug>&features=volume&theme=dark`,
  es decir el **mercado se identifica por su `slug`** y las opciones van como query params.

### Flujo de uso (doc oficial) `[HECHO]`
**Web:** navegar al mercado → clic en el link de embed (`< >`) → elegir **light/dark** →
copiar el código autogenerado → pegar en el CMS/editor → publicar.
**X/Twitter:** pegar la URL del mercado directamente (auto-embed).
**Substack:** pegar el link del mercado; el editor lo reconoce y lo convierte en un widget
que **auto-refresca las odds**.

### Opciones de configuración `[HECHO]`
Del builder `embed.polymarket.com`, los toggles disponibles:
- **Dimensiones:** fit-to-container o width/height custom en px.
- **Tema:** dark mode on/off.
- **Layout:** Standard o **Banner**.
- **Elementos visuales:** toggle de **Chart**, **Buy buttons**, **Volume**, **live
  activity feed**, configuración de eje Y, filas de grid, estilo de borde.
- **Monetización:** parámetro de **affiliate code** que se anexa como `?via=` a los links
  salientes.

### Qué muestra el widget renderizado `[HECHO]`
Del ejemplo en vivo (mercado "Favorite to win... day after debate"):
- Header con branding Polymarket + link **"View Market"**.
- Imagen banner del evento.
- Escala horizontal de porcentaje (0%–50%–100%).
- Outcomes con precio en ¢ (ej. Kamala 100¢ / Trump 0¢).
- Indicador de volumen ("$5m Vol." / "All time").
- Múltiples links "View Market" que llevan al mercado completo.

### ¿Se puede APOSTAR dentro del iframe? — NO `[HECHO/INFERENCIA]`
- El embed es un **componente de display de solo-lectura**. Aunque existe un toggle
  "Buy buttons", **los links salientes llevan a polymarket.com** (con el afiliado `?via=`).
  `[HECHO]` que los links salen a polymarket.com; `[INFERENCIA]` de que el toggle "Buy"
  también redirige y no ejecuta trades in-frame (coherente con: requiere wallet, auth y
  firma de orden que el iframe cross-origin no maneja).

### Limitaciones oficiales `[HECHO]`
- **Solo mercados individuales.** El feature "currently supports single markets only" — NO
  se pueden incrustar grupos de mercados, eventos multi-outcome como colección, ni
  categorías. Solo un mercado a la vez.
- No atribuye volumen a una cuenta builder (es un embed de marketing/afiliado, no de
  routing de órdenes). `[INFERENCIA]`

### Terceros (contexto) `[HECHO]`
Existen widgets no-oficiales (PredScope, PredictWidget, PolyMart) que también exponen
odds de Polymarket vía iframe para WordPress/Webflow/Squarespace. Irrelevantes si se usa
el oficial, pero confirman el patrón iframe.

---

## 3. Programa "Builder" de Polymarket

### Fuentes oficiales
- `https://builders.polymarket.com/` `[HECHO]`
- `https://docs.polymarket.com/builders/overview` `[HECHO]`
- `https://docs.polymarket.com/builders/fees` `[HECHO]`
- Registro: `https://polymarket.com/settings?tab=builder` `[HECHO]`
- Ejemplo oficial: `https://github.com/Polymarket/turnkey-safe-builder-example` `[HECHO]`

### Qué es `[HECHO]`
Un **builder** = "persona, grupo u organización **cuya aplicación enruta órdenes de
usuarios hacia Polymarket**". El programa es **gratis y permissionless**: se puede empezar
a construir directamente.

### Qué habilita una cuenta builder `[HECHO]`
- **Builder code:** identificador único `bytes32` asignado a tu perfil. Se **adjunta a las
  órdenes firmadas** para atribuir el volumen a tu app.
- **Atribución on-chain:** el `builder` es **parte del struct de la orden V2 firmada** (no
  una etiqueta off-chain) y aparece en cada evento `OrderFilled` del contrato CTF
  Exchange V2. Atribución permanente y transparente.
- **Operaciones gasless:** todas las operaciones on-chain (deploy de wallet, approvals,
  ejecución de orden) son gas-free vía el **Relayer** de Polymarket.
- **Leaderboard público** en builders.polymarket.com + reconocimiento.
- **Soporte de ingeniería:** canales de Telegram y asistencia técnica.
- Acceso a la **Relayer API** (mencionado por terceros; la doc de fees no lo detalla).
  `[HECHO que se menciona]` / `[INFERENCIA del alcance exacto]`

### Builder fees `[HECHO]`
- Son **flat % del notional**, configurables por cada builder dentro de límites:
  - **Taker: 0–100 bps (0–1%)** máx.
  - **Maker: 0–50 bps (0–0.5%)** máx.
  - Granularidad de **1 bps (0.01%)**.
- **Aditivas:** los builder fees **nunca reemplazan** los platform fees; se suman encima.

  | Escenario | Fee aplicado |
  |---|---|
  | Sin platform fee + sin builder code | $0 |
  | Sin platform fee + con builder code | Solo builder fee |
  | Con platform fee + sin builder code | Solo platform fee |
  | Con platform fee + con builder code | Ambos |

- Fórmula: `notional × builder_fee_rate_bps / 10000`. (Ej.: 1,000 pUSD @ 100 bps taker ⇒
  10 pUSD de builder fee.)
- Los fees cobrados se distribuyen al **wallet asociado al perfil builder**.
- **Cooldown de cambios:** 1 cambio por 7 días, con **3 días de aviso previo** antes de
  aplicar.
- Fee rates son **públicamente consultables** (queryable). El balance-checker del CLOB
  valida que el usuario tenga pUSD suficiente para cubrir trade + fees máximos posibles.

### Tiers del Relayer (transacciones/día) `[HECHO]` (fuente tercero, botforkalshi)
- **Unverified:** 100/día (default).
- **Verified:** 10,000/día (aprobación manual).
- **Partner:** ilimitado (estratégico).
- Verified también da acceso a leaderboards públicos y posible acceso a rewards/grants/
  ingeniería/marketing (sujeto a aprobación).

### Rewards `[HECHO]`
Polymarket lanzó un **programa de rewards semanal en USDC** basado en el volumen de
trading integrado, para incentivar la adopción de Builder Codes.

### Relación con crear un widget/frontend `[HECHO/INFERENCIA]`
Sí, directísima: **el propósito del programa Builder es exactamente construir un frontend
(app/widget) que enruta órdenes de sus usuarios al CLOB de Polymarket, adjuntando el
builderCode para atribuir volumen y cobrar builder fees.** El ejemplo oficial
`turnkey-safe-builder-example` muestra el flujo con wallets Turnkey + Safe. `[HECHO]`

### Obligaciones del builder `[HECHO]`
Debe **divulgar los fees actuales antes de la firma** de la orden, e implementar
idempotencia, reconciliación y manejo de partial-fills.

---

## 4. APIs de desarrollador (para construir la SPA/widget custom)

Fuente: `chainstack.com/polymarket-api-for-developers/` `[HECHO]`

| API | Base URL | Uso |
|---|---|---|
| **Gamma** | `https://gamma-api.polymarket.com` | Descubrimiento de mercados y metadata. **Sin API key / sin auth / sin wallet.** |
| **CLOB** | `https://clob.polymarket.com` | Motor de trading, order book, ejecución. |
| **Data** | `https://data-api.polymarket.com` | Analytics/posiciones de usuario (requiere contexto de wallet). |
| **WebSocket** | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | Streaming en tiempo real (ticks, last-trade). |

**Para un widget de solo-lectura → usar Gamma:**
- `/events` — listados con filtros (active/closed/archived, orden por volumen).
- `/markets` — arrays **`outcomes` y `outcomePrices`** (mapean 1:1), token IDs YES/NO,
  probabilidad implícita como precio decimal, volumen 24h, liquidez, flag
  **`enableOrderBook`** (si es tradeable).
- CLOB `/book` para profundidad/spread en vivo; WebSocket para precios live sin polling.

**Para un widget que apuesta (builder) →** además de Gamma para display, se necesita el
**CLOB client** (ej. `Polymarket/py-clob-client`) + firma de órdenes V2 con `builderCode`
+ Relayer. `[HECHO]` (existencia de clientes) / `[INFERENCIA]` del stack exacto para JS/SPA.

---

## 5. Referencias visuales/UX a imitar

Para que el widget "se sienta Polymarket": `[HECHO]` salvo lo marcado.

- **Card feed estilo noticias**, no terminal de trading: imagen + pregunta como gancho.
- **Probabilidad en % grande y prominente** como dato primario (no centavos, no candlesticks).
- **Outcomes binarios YES/NO color-coded.** Convención de mercado: **verde = YES/subida,
  rojo = NO/bajada**. `[INFERENCIA]` (no confirmado literal el hex exacto de marca en esta
  investigación; validar contra el sitio en vivo / los tokens en `src/` del repo).
- **Gráficas de línea limpias**, color por outcome, para timelines de probabilidad.
- **Volumen** mostrado de forma compacta ("$1B Vol").
- **Tiempo restante / fecha de resolución** como metadato.
- **Badges de estado:** `[INFERENCIA]` — el modelo de datos expone estados (active,
  closed/`enableOrderBook=false`, resolved). Imitar badges Active / Closed / Resolved.
  El estado real viene de campos Gamma como `active`, `closed`, `archived`,
  `enableOrderBook`. `[HECHO campos]` / `[INFERENCIA mapeo a badges de UI]`
- **Densidad baja / claridad alta:** ocultar order book en la vista de browse; mostrarlo
  solo en el detalle.
- **"Cripto invisible":** ocultar complejidad de wallet/blockchain al usuario final.
- **Optimización móvil thumb-zone** para los botones de acción.

> Nota de marca: los valores hex exactos de la paleta Polymarket NO se confirmaron con
> fuente oficial en esta ronda. Recomendación: extraerlos del sitio en vivo (inspeccionar
> CSS de polymarket.com) o alinear con los tokens RamosLabs ya presentes en el repo, y
> validar contraste.

---

## Fuentes citadas

**Oficiales**
- Home: https://polymarket.com/ · https://polymarket.com/predictions/cards
- Embeds (builder): https://embed.polymarket.com/
- Embeds (ejemplo): https://embed.polymarket.com/market.html?market=favorite-to-win-on-polymarket-one-day-after-debate&features=volume&theme=dark
- Embeds (doc): https://help.polymarket.com/en/articles/13364174-how-to-use-embeds
- Builders (landing): https://builders.polymarket.com/
- Builders (overview): https://docs.polymarket.com/builders/overview
- Builder fees: https://docs.polymarket.com/builders/fees
- Registro builder: https://polymarket.com/settings?tab=builder
- Prices & orderbook: https://docs.polymarket.com/concepts/prices-orderbook
- Limit orders: https://help.polymarket.com/en/articles/13364444-limit-orders
- Ejemplo builder: https://github.com/Polymarket/turnkey-safe-builder-example
- Cliente CLOB: https://github.com/Polymarket/py-clob-client

**Terceros (contexto)**
- Chainstack (APIs): https://chainstack.com/polymarket-api-for-developers/
- Avark (UX patterns): https://avark.agency/learn/prediction-market-design-patterns
- BotForKalshi (Builder guide): https://www.botforkalshi.com/blog/polymarket-builder-program-guide
- Medium / CLOB V2: https://benjamincup.medium.com/how-polymarket-orders-actually-get-executed-a-deep-dive-into-clob-v2-for-developers-fdcd5d395ef5
