# PWA Fullscreen — Teknikker brukt i Linjer

Dokumentasjon over hva som er gjort for å få appen til å se bra ut som PWA og i nettleser, med korrekt håndtering av safe area, animasjoner og glassmorphic design.

---

## 1. Viewport og PWA-metadata (`layout.tsx`)

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",   // Innhold strekker seg bak notch/Dynamic Island
};

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,                          // Aktiverer fullscreen PWA-modus på iOS
    title: "Linjer",
    statusBarStyle: "black-translucent",    // Statusbar er gjennomsiktig, innhold bak
  },
};
```

### Hva disse gjør

| Innstilling | Effekt |
|---|---|
| `viewportFit: "cover"` | Kartet og innhold fyller hele skjermen inkl. notch-sonen |
| `appleWebApp.capable: true` | iOS legger til appen som fullscreen PWA fra hjemskjermen |
| `statusBarStyle: "black-translucent"` | iOS-statusbar flyter over innholdet (ikke en egen bar) |
| `maximumScale: 1` | Hindrer utilsiktet pinch-zoom som bryter kartet |

Uten `viewportFit: "cover"` + `black-translucent` vil appen ha en hvit/sort statusbar-stripe øverst, og `env(safe-area-inset-top)` vil returnere 0.

---

## 2. Safe Area Insets

iOS og Android eksponerer safe area via CSS-miljøvariabler:

```css
env(safe-area-inset-top)     /* Under Dynamic Island / notch */
env(safe-area-inset-bottom)  /* Over home indicator */
env(safe-area-inset-left)
env(safe-area-inset-right)
```

Disse er kun tilgjengelige når `viewportFit: cover` er satt. Bruk alltid en fallback:

```css
padding-top: env(safe-area-inset-top, 0px);
```

### Hvor de brukes i Linjer

**Søkefelt og filterbar** (`page.tsx`):
```tsx
style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
```
Holder søkefeltet synlig under Dynamic Island med 14px ekstra luft.

**Bottom sheet — full tilstand** (`LinePanel.tsx`):
```tsx
paddingTop: panelState === "full"
  ? "calc(env(safe-area-inset-top, 0px) + 12px)"
  : undefined
```
Kun i full tilstand — når panelet dekker hele skjermen skyves innholdet ned under notchen.

**Bottom sheet — stopp-liste** (`LinePanel.tsx`):
```tsx
paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)"
```
Siste stopp i listen havner ikke bak home indicator.

**LoadingToast** (`LoadingToast.tsx`):
```tsx
bottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)"
```
Toast-meldingen flyter over home indicator.

---

## 3. Scroll-håndtering

```css
/* globals.css */
body {
  overscroll-behavior: none;  /* Hindrer rubber-band scroll / pull-to-refresh */
  height: 100%;
}
html {
  height: 100%;
}
```

**Viktig:** Vi bruker `overscroll-behavior: none` i stedet for `overflow: hidden`.
`overflow: hidden` på `body`/`html` blokkerer `backdrop-filter` i Chrome (se punkt 5).

---

## 4. Bottom Sheet — animasjon og touch

### Tre tilstander med CSS transition

```css
.line-panel {
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}
```

```tsx
const getTranslate = (state: PanelState) => {
  if (state === "hidden") return "translateY(100%)";
  if (state === "mini")   return "translateY(calc(100% - 120px))"; // ~120px peek
  return "translateY(0)";                                          // full open
};
```

Panelet er alltid i DOM — bare transform endres. Dette sikrer at CSS-transition alltid har en "fra"-tilstand å animere fra.

### Swipe-gestures

```tsx
// touchAction: "none" kun på drag-handle og header — IKKE hele panelet
// Å sette touch-action: none på hele panelet bryter CSS-transitions
<div style={{ touchAction: "none" }}>  {/* drag handle */}
<div style={{ touchAction: "none" }}>  {/* header */}
<div style={{ touchAction: "pan-y" }}> {/* stopp-liste — kan scrolles */}
```

**Lært leksjon:** `touch-action: none` på hele panelet forstyrrer kompositeringen og bryter CSS-transitions. Det må begrenses til kun de elementene man faktisk drar i.

### Peek-høyde og safe area

Mini-tilstanden bruker **fast 120px** — ikke `120px + env(safe-area-inset-bottom)`. Årsaken er at iOS-safe area (~34px på iPhone 14+) ville gjort peek-en for høy på telefon vs. desktop. Panelens glassbakgrunn dekker home indicator-sonen naturlig siden panelet strekker seg til `bottom: 0`.

---

## 5. Glassmorphic design og `backdrop-filter`

### Viktig begrensning: WebGL-canvas

`backdrop-filter: blur()` fungerer **ikke** over WebGL-canvas i Chrome. MapLibre rendrer kartet i et `<canvas>` med WebGL. Resultatet:

- **Safari / iOS**: Ekte blur over kartet ✅
- **Chrome / Android**: Ingen blur — viser solid mørk bakgrunn ✅ (via fallback)
- **Firefox**: Ekte blur ✅

### `@supports`-fallback

```css
.search-panel {
  /* Fallback for Chrome/Android */
  background: rgba(10, 10, 10, 0.96);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .search-panel {
    background: var(--glass-bg);           /* Mer gjennomsiktig */
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
  }
}
```

### `overflow: hidden` blokkerer blur i Chrome

Chrome krever at ingen ancestor-element har `overflow: hidden` for at `backdrop-filter` skal composites korrekt. Safari er mer tilgivende.

**Feil:** `body { overflow: hidden }` → ingen blur i Chrome
**Riktig:** `body { overscroll-behavior: none }` → blur fungerer der det støttes

### CSS-variabler for enkel tweaking

```css
:root {
  --glass-bg:   rgba(15, 15, 15, 0.8);  /* Lavere opacity → mer blur synes */
  --glass-blur: blur(5px);              /* Juster etter smak */
  --glass-border: rgba(255, 255, 255, 0.1);
}
```

Tommelfingerregel: jo lavere opacity, jo mer trenger du blur for god effekt.

---

## 6. MapLibre attribution

```css
.maplibregl-ctrl-attrib {
  background: rgba(15, 15, 15, 0.75) !important;
  backdrop-filter: blur(8px);
  border-radius: 8px !important;
}
.maplibregl-ctrl-attrib a,
.maplibregl-ctrl-attrib-inner {
  color: rgba(255, 255, 255, 0.4) !important;
}
```

Satt til `compact: true` i MapLibre-konstruktøren for å starte kollapset.

---

## 7. Kjente gotchas

| Problem | Årsak | Løsning |
|---|---|---|
| `env(safe-area-inset-top)` returnerer 0 | Mangler `viewportFit: cover` | Legg til i viewport-config |
| Blur virker ikke i Chrome | WebGL-canvas + Chrome-begrensning | `@supports`-fallback |
| `backdrop-filter` virker ikke i Chrome | `overflow: hidden` på ancestor | Bruk `overscroll-behavior: none` i stedet |
| Bottom sheet animerer ikke | `touch-action: none` på hele panelet | Sett kun på drag-handle og header |
| Siden scroller ved swipe på panelet | Touch-events bobler til kartet | `touch-action: none` på de interaktive sonene |
| Caret dropper i bunnen av input på iOS | `overflow: hidden` + `position: fixed` + keyboard | Kjent WebKit-bug; delvis hjulpet av `overscroll-behavior` |
| Innhold gjemmes bak Dynamic Island | Mangler safe-area padding i full tilstand | `padding-top: calc(env(safe-area-inset-top) + 12px)` |
