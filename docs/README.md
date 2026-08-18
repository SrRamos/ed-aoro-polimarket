# Docs — Polymarket Widget

Research y análisis inicial del coding challenge (Vue 3 + RamosLabs DS, enfoque SDD).

| Documento | Contenido |
|---|---|
| [`analysis-and-architecture.md`](./analysis-and-architecture.md) | **Empezar aquí.** Decisiones, stack, arquitectura de carpetas, contratos de servicios, UX, flujo SDD, riesgos |
| [`research-polymarket-api.md`](./research-polymarket-api.md) | Gamma API (búsqueda/datos), CLOB (order book/apuestas), auth, CORS, geoblock, qué es real vs mock |
| [`research-polymarket-product.md`](./research-polymarket-product.md) | Producto/UX: qué es un "widget" (embed oficial solo-lectura vs SPA custom vs builder), anatomía de cards/mercados, programa Builder, patrones visuales a imitar |
| [`research-polymarket-sdks-builder.md`](./research-polymarket-sdks-builder.md) | SDKs oficiales (CLOB V2, `@polymarket/client`), Builder Program: builder code `bytes32` + fees additivas, firma L1+Order, viabilidad browser-only, blockers (geoblock/fondos/Verified) |
| [`research-openrouter-ai.md`](./research-openrouter-ai.md) | OpenRouter chat API, modelos free, salida JSON estructurada, prompt, seguridad de la key |
| [`research-ramoslabs-ds.md`](./research-ramoslabs-ds.md) | `@ramoslabs/tokens`: consumo, tokens reales, convenciones de componentes, reglas duras |

## TL;DR

- **Reads reales** (búsqueda + mercados + precios) vía Gamma — público, sin key, CORS `*`.
- **Apuesta MOCK builder-aware** tras `BettingService`: incorpora el builderCode (`bytes32`) y muestra el desglose real de fees (builder additivo al platform, `notional×bps/10000`). Se mockea por razón **operativa** (geoblock por IP + VPN prohibida + wallet fondeada), NO porque el browser no pueda: el path real (`@polymarket/client` + signer viem, sin backend para la atribución) existe detrás del mismo interface como stretch opt-in/gateado.
- **IA opt-in** vía OpenRouter con modelo free (discovery en runtime) y key provista por el usuario.
- **UI custom token-only** con RamosLabs DS (tema claro; sin componentes ni dark mode shippeados).
