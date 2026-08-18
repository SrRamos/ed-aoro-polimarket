# Research: RamosLabs Design System (para el Polymarket Widget)

> Valores citados verbatim del paquete `@ramoslabs/tokens@0.1.0` (`dist/tokens.json`, `dist/tokens.css`)
> y de `https://design.ramoslabs.com` (`/llms-full.txt`, `/registry.json`). **Nada inventado.**

## 0. Regla no-negociable

**Nunca hardcodear** un color, spacing, tipografía, radius, shadow o motion. Siempre `var(--token)`.
Un hex/px/rgb/rem crudo en CSS de producto es un **defecto**. `#4f46e5` (Indigo 600) es el **único** accent de acción; el violeta/secondary es decorativo, nunca para interacción.

---

## 1. Consumo en Vite + Vue 3

- Paquete único publicado: **`@ramoslabs/tokens`** (npm, v`0.1.0`, MIT).
- **`@ramoslabs/vue` es un scaffold vacío — no hay componentes.** Se construyen componentes propios desde tokens + patrones documentados.

```bash
npm install @ramoslabs/tokens
```

```ts
// src/main.ts — importar UNA vez en el entry
import '@ramoslabs/tokens/css' // expone todas las --vars en :root
import { createApp } from 'vue'
import App from './App.vue'
createApp(App).mount('#app')
```

**Entry points** (`package.json` exports):

| Import                   | Qué da                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| `@ramoslabs/tokens/css`  | CSS custom properties (`:root { … }`). **Esto se importa para estilar.** |
| `@ramoslabs/tokens`      | Valores ES-module tipados camelCase (`import { colorPrimary }`).         |
| `@ramoslabs/tokens/json` | Mapa DTCG plano name→value.                                              |

Exposición: **CSS custom properties** en `:root`. Sin Tailwind preset, sin runtime JS theming. En SFCs se referencian en `<style>`. 213 tokens en 12 categorías.

**Source of truth:** el paquete instalado (`/json`) para valores exactos; docs servidas en `design.ramoslabs.com` (`/llms-full.txt`, `/registry.json`); MCP opcional `search_tokens/get_token/check_contrast/lint_css`.

---

## 2. Tokens core (verbatim)

### Color — roles semánticos

**Primary / acción (mono-indigo):**

```
--color-primary: #4f46e5   --color-primary-light: #6366f1   --color-primary-dark: #4338ca
--color-primary-surface: #eef2ff   --color-focus: #4f46e5
```

**Secondary (violeta — decorativo, nunca acciones):**

```
--color-secondary: #8b5cf6   -light: #a78bfa   -dark: #7c3aed   -surface: #f5f3ff
```

**Texto:**

```
--color-text-heading: #0f172a   -strong: #1e293b   -secondary: #475569
--color-text-body: #64748b (floor lectura)   -muted: #64748b   -disabled: #cbd5e1
```

**Superficies / bordes:**

```
--color-surface: #ffffff   -secondary: #f8fafc   -hover: #f1f5f9
--color-background: #f8fafc   --color-border: #e6e8eb   -light: #e2e8f0   -subtle: #f1f5f9
```

**Estados semánticos** (triadas strong/surface/border/text; nunca color solo):

```
success: #10b981  -strong #059669  -surface #f0fdf4  -border #bbf7d0  -text #166534
warning: #f59e0b  -surface #fffbeb  -border #fde68a  -text #78350f
error:   #ef4444  -strong #dc2626  -surface #fef2f2  -border #fecaca  -text #991b1b
info:    #3b82f6  -surface #eff6ff  -border #bfdbfe  -text #1e40af
```

> **Yes/No del widget:** usar triadas `success` (verde) y `error` (rojo), **siempre** con texto/icono/forma, nunca color solo (SC 1.4.1).

### Spacing (rem — snap todo a esto)

```
0:0  1:.25  2:.5  3:.75  4:1(default)  5:1.25  6:1.5(gap entre componentes)
8:2  10:2.5  12:3  16:4  20:5  24:6  32:8
```

Denso: interiores `--space-2`/`--space-3`. Nunca valores off-scale (nada de 13px/15px).

### Tipografía

```
--font-family-sans: Rubik, system-ui, sans-serif        (body default)
--font-family-display: 'Red Hat Display', system-ui, sans-serif
--font-family-alt: Roboto, system-ui, sans-serif
```

> Fuentes NO bundleadas — cargarlas (Google Fonts / self-host). Fallback `system-ui`.

Weights: thin100…normal400, medium500, semibold600, bold700, extrabold800.
Sizes: xs .75 · sm .875 · **base 1 (floor + inputs ≥16px evita zoom iOS)** · lg 1.125 · xl 1.25 · 2xl 1.5 · 3xl 1.875 · 4xl 2.25 · 5xl 3 · 6xl 3.75 (rem).
Leading: none1 tight1.1 snug1.25 **normal1.5(body)** relaxed1.625. Tracking: tighter-.05 … wider.05em.

### Radius

```
none0  xs .25  sm .375(6px CONTROLES: botones/inputs)  md .5  lg .75(cards)
xl 1(modals)  2xl 1.25  pill 9999(chips/tags/avatars SOLO — nunca botones/cards anchos)
```

### Shadow (indigo-tinted; SOLO elevación, nunca feedback de estado)

```
--shadow-sm: raised buttons/cards
--shadow-md: dropdowns/popovers
--shadow-lg: modals/sheets (techo)
--shadow-focus: 0 0 0 2px #fff, 0 0 0 4px #4f46e5   (anillo de foco de teclado)
```

### Motion (solo 3 duraciones)

```
--duration-fast:150ms  normal:200ms(default)  slow:300ms(techo, takeovers)
--easing-out: cubic-bezier(0,0,0.2,1) entradas   --easing-in: salidas
--easing-in-out: reposición   --easing-spring: éxito discreto (GATE con prefers-reduced-motion)
```

"No job, no motion." Animar **solo `transform` y `opacity`** — nunca width/height/top/left/margin.

### State-layer opacities (overlay tonal indigo)

```
--state-hover:0.08 (gate @media hover:hover)  focus:0.1  pressed:0.1  dragged:0.16
```

### Breakpoints (5, min-width, base=0, sin xs)

```
sm:576  md:769  lg:992  xl:1200  2xl:1366 (px)
```

### Z-index

```
dropdown100 sticky200 fixed300 fab400 modal-backdrop500 modal600 popover700 tooltip800 toast900
```

---

## 3. Convenciones de componentes (para el widget)

**Naming:** `SJ` = UI compartida sin dominio (`SJButton`, `SJInput`, `SJCard`); `W` = widgets de app que componen primitivas (`WMarketCard`, `WEventCard`). Reusar antes de crear. **No shipeados — se autoran siguiendo este naming.** Tier solo referencia al de abajo (foundations→patterns→components).

- **Botones/estados:** orden `:active` → `:focus-visible` → `:hover` (hover gated `@media (hover:hover) and (pointer:fine)`). Un overlay tonal indigo (`--state-*`) expresa hover/focus/pressed. **Nunca shadow para estado.** Foco: `--shadow-focus` en `:focus-visible`. Radius `--radius-sm`.
- **Inputs / search:** `<label>` visible persistente (placeholder ≠ label) + control + help + error inline específico. Native-first. Validar con atributos HTML; estilar con **`:user-invalid`/`:user-valid`** (post-interacción). `inputmode`, `autocomplete`, `font-size:16px` mín. Touch ≥24×24 (AA), objetivo 44×44.
- **Cards:** `surface` bg · `--space-6` padding · `--radius-lg` · `--shadow-sm`.
- **Badges/chips:** `--radius-pill` + triadas semánticas (`-surface`+`-border`+`-text`) con icono/texto.
- **Modals:** `--radius-xl`, `--shadow-lg`, `--z-modal-backdrop:500`/`--z-modal:600`, motion ≤300ms.
- **Toasts/loading:** toasts `--z-toast:900`. **Live regions** para updates dinámicos (`role="alert"` interrumpe / `role="status"` `aria-live="polite"`). **No hay skeleton/empty-state shipeado** — construir desde surface/border, animar solo opacity/transform con reduced-motion.

---

## 4. Accesibilidad (piso WCAG 2.2 AA)

1. HTML semántico antes de ARIA. 2. Contraste 4.5:1 texto / 3:1 large+UI (AA); muted floor `#64748b` (slate 400 prohibido para texto). 3. Color nunca único señal. 4. Name/role/value en cada interactivo. 5. Foco visible en `:focus-visible`. 6. Touch ≥24×24 (aim 44). 7. `prefers-reduced-motion`. 8. Live regions.

Utilidades: `.sr-only`, `.focus-ring`, `.skip-link`.

---

## 5. Patrones documentados

`/registry.json`: Interactive, Accessibility, Form Elements, Data Tables, Modals, Mobile First, Persuasion, Voice & Tone, AI Content. Relevantes al widget: **Interactive, Form Elements, Modals, Mobile First, Accessibility**. Leer la página (MCP `get_doc`) antes de improvisar.

---

## 6. Checklist de reglas duras

1. Token-only. 2. Mono-indigo `#4f46e5` único accent de acción. 3. Una escala `--space-*`. 4. Jerarquía radius (sm controles / lg cards / xl modals; pill accent). 5. Shadow = elevación. 6. Estados press-first. 7. Foco siempre visible. 8. Native controls + `<label>` persistente. 9. Motion: 3 duraciones, transform/opacity, spring con reduced-motion. 10. 5 breakpoints. 11. Contraste AA + no-color-solo. 12. Naming SJ/W. 13. Inventar nada.

## ⚠️ Hallazgos importantes

- **Sin dark mode:** `tokens.css` solo tiene un bloque `:root {}` — no hay `@media (prefers-color-scheme: dark)` ni `[data-theme]` ni variantes dark en v0.1.0. **No inventar valores dark.** Diseñar para la paleta clara; si se requiere dark, marcarlo como no soportado y confirmar scope.
- **Sin componentes shipeados:** se autoran todos (naming SJ/W), token-only.
- **Fuentes no bundleadas:** cargar Rubik / Red Hat Display / Roboto aparte.

## Implicaciones para el widget

- Todo custom, token-only. Componentes: `SJButton`, `SJInput`, `SJCard`, `SJBadge`, `SJModal`, `SJSpinner`/skeleton; widgets `WMarketSearch`, `WMarketCard`, `WMarketDetail`, `WBetForm`, `WAiPrediction`.
- Yes/No con triadas success/error + icono/texto.
- Barra de confidence de IA: usar `--color-primary` + label numérico (no color solo).
- Loading/empty/error states construidos a mano desde tokens.
