# Docs — Polymarket Widget

Research y análisis inicial del coding challenge (Vue 3 + RamosLabs DS, enfoque SDD).

| Documento | Contenido |
|---|---|
| [`analysis-and-architecture.md`](./analysis-and-architecture.md) | **Empezar aquí.** Decisiones, stack, arquitectura de carpetas, contratos de servicios, UX, flujo SDD, riesgos |
| [`research-polymarket-api.md`](./research-polymarket-api.md) | Gamma API (búsqueda/datos), CLOB (order book/apuestas), auth, CORS, geoblock, qué es real vs mock |
| [`research-openrouter-ai.md`](./research-openrouter-ai.md) | OpenRouter chat API, modelos free, salida JSON estructurada, prompt, seguridad de la key |
| [`research-ramoslabs-ds.md`](./research-ramoslabs-ds.md) | `@ramoslabs/tokens`: consumo, tokens reales, convenciones de componentes, reglas duras |

## TL;DR

- **Reads reales** (búsqueda + mercados + precios) vía Gamma — público, sin key, CORS `*`.
- **Apuesta simulada** tras `BettingService` (trading real exige wallet/EIP-712/HMAC/USDC + backend; geobloqueado).
- **IA opt-in** vía OpenRouter con modelo free (discovery en runtime) y key provista por el usuario.
- **UI custom token-only** con RamosLabs DS (tema claro; sin componentes ni dark mode shippeados).
