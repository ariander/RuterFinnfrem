# Kickstart: Tilgjengelig kollektivnavigasjon
**Læringer fra RuterFinnFrem → neste prosjekt**

*Formål: Senke kognitiv last for folk med nedsatt fokus, svaksynthet, blindhet og hukommelsesvikt.*

---

## Kontekst

RuterFinnFrem viste at det tekniske grunnlaget (Entur, MapLibre, GPS) er solid. Men appen er fortsatt designet for folk som kan følge med på en tidslinje, lese kart og holde kontekst i hodet. Det nye prosjektet skal svare på ett spørsmål hele tiden:

> **Hva gjør jeg NÅ?**

Ingenting annet. Alltid bare én ting om gangen.

---

## Det viktigste vi lærte

### 1. «Hva gjør jeg NÅ?» er alt som teller

Det mest angstdempende vi bygget var «Gå av på Helsfyr» i minimert visning og boardingdeteksjon. Ikke kartet. Ikke tidslinjen. Den lille setningen som forteller brukeren akkurat hva som skjer.

For folk med hukommelsesvikt eller nedsatt fokus: **de glemmer hva de ventet på**. Appen må hele tiden gjenta status uten at det føles mas.

For svaksynte: de trenger én stor tydelig handlingsoppfordring, ikke et dashbord.

Reisens fem tilstander i ny app:
```
1. "Søker rute til [sted]..."
2. "Gå til [holdeplass] · 3 min · 250 m →"
3. "Vent på [LINJE] mot [endestopp] · om 4 min"
4. "Du er på [LINJE] · Gå av på [stopp]"
5. "Du er fremme! 📍"
```
Ingenting mellom disse tilstandene vises automatisk. Brukeren kan velge å se mer.

### 2. Forsinkelsesinformasjon øker angst — men det å *ikke ha den* er verre

Vi lærte at sanntidsdata er kritisk, men presentasjonen er alt. «+3 min» i rødt øker stress. «Avgangen er 3 minutter forsinket, du rekker det» er bedre. Eller bare: «Avgangen: 08:48» (uten å si det er forsinket).

### 3. GPS-hastighet er gull for kontekst

Fra `useUserLocation` → `detectBoardedTransitLeg` lærte vi:
- Speed > 5 km/h = sannsynligvis ombord
- Speed null (iOS) = bruk avstandsterskel 75 m istedenfor 200 m
- Speed > 15 km/h = zoom kartet ut automatisk (zoom 14 → 11)

Ny app: bruk hastighetssignalet til å bytte tilstand stille, uten å spørre.

### 4. Position-basert fremgang > tidsbasert

Tidsbasert framdrift i en forsinkelse = feil prosent. Vi gikk over til polyline-projeksjon (nærmeste punkt på ruten). Det er riktig uansett forsinkelse.

Funksjonen `positionProgress()` i `RouteDetail.tsx` er den rette tilnærmingen og bør gjenbrukes.

### 5. 200 m overgangsradius er den rette terskelen

Testet i felt: 50 m = for sent, brukeren er stresset. 200 m = akkurat passe tid til å orientere seg. Samme for boardingdeteksjon med kjent hastighet.

### 6. «Du er fremme» skjer aldri tidsnok

300 m er minimum. For folk med nedsatt mobilitet eller orientering: 400–500 m. Husk at «destinasjon» for mange er inngangsdøren, ikke stedskoordinaten. Legg til 50–100 m sikkerhetsbuffer på destinasjonsmarkøren.

---

## API-er og tjenester

### Entur Journey Planner v3 (GraphQL) ✅ Behold alt

```
URL: https://api.entur.io/journey-planner/v3/graphql
Header: ET-Client-Name: [app-navn]-poc
```

Viktige parametere vi validerte:
- `walkSpeed: 1.7` m/s (raskere enn default 1.4 — testet og riktig for Oslo)
- `numTripPatterns: 3` (ikke 5 for enkel app — færre valg = mindre kognitiv last)
- `directMode: foot` for gangrute
- `modes: { accessMode: foot, egressMode: foot, transportModes: [...] }`

Feltene vi faktisk bruker fra hvert leg:
```graphql
mode transportSubmode duration distance realtime
aimedStartTime expectedStartTime aimedEndTime expectedEndTime
fromPlace { name latitude longitude quay { id name publicCode } }
toPlace { name latitude longitude }
line { publicCode name transportMode authority { id } }
fromEstimatedCall { destinationDisplay { frontText } }
intermediateEstimatedCalls { quay { name id } aimedDepartureTime expectedDepartureTime realtime }
pointsOnLink { points }   ← Google-encoded polyline, kritisk for alt
serviceJourney { id }     ← for boardingdeteksjon
situations { id summary { value language } description { value language } }
```

### Entur Geocoder ✅ Behold alt
```
URL: https://api.entur.io/geocoder/v1/autocomplete
Params: text, lang=no, layers=venue,stop,address
Debounce: 300 ms, min 3 tegn
```

Prioriter stopplace-resultater (kategori `busStation`, `metroStation` osv.) øverst — brukere med hukommelsesvikt søker etter navn de kjenner, ikke adresser.

### Entur Nearest Stops ✅ Behold
```graphql
nearest(
  latitude: $lat
  longitude: $lng
  maximumDistance: 1500
  maximumResults: 200
  filterByPlaceTypes: [stopPlace]
)
```

### Entur Vehicles (sanntidsposisjon) ✅ Behold
```
URL: https://api.entur.io/realtime/v1/vehicles/graphql
Felter: vehicleId, bearing, location.lat/lng, lastUpdatedEpochSecond, occupancyStatus
```
Nyttig for: vis kjøretøy på kartet, bekreft at bussen nærmer seg.

### Kartbasemap: Carto Voyager ✅ Behold
```
URL: https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json
Tilpass: voyagerStyle.glyphs = "/api/fonts/{fontstack}/{range}.pbf"
```
For høykontrastmodus: vurder Carto Dark Matter eller Stamen Toner (monokromt).

### Wikipedia Geosearch 🟡 Valgfritt (kun for gange)
```
URL: https://no.wikipedia.org/w/api.php?action=query&list=geosearch
Radius: 50 m fra rutepolyline, maks 10 resultater
```
Nyttig som distraherende/berikende element på gange — men ikke relevant for primærflyt.

### Font-serving API ✅ Behold (nødvendig for MapLibre labels)
```
Endpoint: /api/fonts/{fontstack}/{range}.pbf
Fonts: TID UI Regular, TID UI Bold
```

---

## Farger

### Transportmodusfarger (Ruter-standard) — behold eksakt

Disse er etablerte og gjenkjennbare for norske kollektivbrukere. Endre dem ikke.

| Modus | Farge | Hex | Kontrast på hvit |
|-------|-------|-----|-----------------|
| Buss | Rød | `#E60000` | 4.0:1 ⚠️ (grensen AA) |
| Trikk | Blå | `#0B91EF` | 3.0:1 ❌ |
| T-bane | Oransje | `#EC700C` | 3.1:1 ❌ |
| Tog | Marineblå | `#003087` | 10.5:1 ✅ |
| Båt | Lilla | `#682C88` | 5.5:1 ✅ |
| Ekspressbuss | Grønn | `#75A300` | 4.3:1 ⚠️ |
| Gange | Grå | `#888888` | 3.9:1 ❌ |

**For tekst:** Bruk aldri modusfarger på liten tekst. Bruk dem bare på badges/piller med hvit tekst på farget bakgrunn (slik vi gjør nå). For varseltekst og statustekst: bruk alltid `#313663` (ink-primary) på hvit.

**For høykontrast-modus:** Lag alternativ palett der alle modi er over 7:1:
- Buss: `#CC0000`
- Trikk: `#006DB5`
- T-bane: `#B55800`
- Gange: `#595959`

### UI-farger (Ruter)

```css
--ink-primary: #313663    /* Hovedelement, all tekst */
--ink-secondary: #272D60  /* Sekundærtekst */
--background: #FFFFFF
--surface: rgba(255,255,255,0.90)  /* Kort med bakgrunn */
--user-dot: #4285F4       /* GPS-markør */
--destination: #E60000    /* Destinasjonsmarkør */
--success: #10B981        /* Ankomstbanner (emerald-500) */
--warning: #F59E0B        /* Forsinkelser/advarsler */
```

### Hva vi lærte om fargebruk i navigasjon

- **Hvit bakgrunn, mørk tekst** er alltid riktig for kort/paneler. Aldri mørk bakgrunn i kart-overlay (for vanskelig mot skiftende kartbakgrunn).
- **Grønn** (#10B981) betyr «du er trygg» — bruk det konsekvent: GPS funnet, sanntid aktiv, fremme.
- **Amber/gul** (#F59E0B) betyr «vær oppmerksom» — forsinkelse, mulig at avgangen gikk.
- **Rød** (#E60000) betyr kollektivrute (buss), ikke feil. For feil: bruk `#DC2626`.

---

## Typografi

### Font: TID (Ruters husfont) ✅ Behold

Filer: `TID-Regular.ttf`, `TID-Medium.ttf`, `TID-Bold.ttf`, `TID-BoldItalic.ttf`
MapLibre label: `"TID UI Regular"` (og Bold i egne lag)

TID er en humanistisk grotesk — optimalisert for lesbarhet på skjerm, særlig ved lav oppløsning. Veldig bra for svaksynte.

### Skriftstørrelser for tilgjengelighet

| Element | Nå (RuterFinnFrem) | Ny app (minimum) |
|---------|-------------------|------------------|
| Primærhandling | 16px bold | **20px bold** |
| Stoppnavn | 14px medium | **18px medium** |
| Tid/detaljer | 12px | **16px** |
| Merkelapper/badges | 12px | **14px bold** |
| Sekundærinfo | 10–11px | **14px** |
| Minste tillatte | 10px | **14px** |

Linjeavstand: minimum `1.5` for all brødtekst. `1.3` for overskrifter.

### Regel: Bold er standarden

For brukere med svak konsentrasjon: bold tekst er lettere å skanne.
- **Alt primærinnhold = bold (700)**
- Sekundær = medium (500)
- Aldri regular (400) for primær informasjon

---

## Ikoner

### Eksisterende ikoner (behold fra dette prosjektet)

```
/icons/bus.svg       – Buss
/icons/tram.svg      – Trikk
/icons/metro.svg     – T-bane
/icons/train.svg     – Tog
/icons/boat.svg      – Båt
/ArrowRight.svg      – Neste steg/retning
/Platform.svg        – Overgang
/warning.svg         – Advarsel
/Capacity_empty.svg  – God plass
/Capacity_ok.svg     – Noen seter
/Capacity_full.svg   – Fullt
/target.svg          – Sentrer kart
/pin.svg             – Destinasjon
```

### Hva vi lærte om ikonbruk

- **Aldri ikon alene** — alltid med tekst for disse brukergruppene
- **Størrelse**: minimum 24×24px i lister, 32×32px for primærhandling
- **Farget ikon på farget bakgrunn** krever hvit kontur (som stop-badges)
- Emoji i kode: 🚶 (gange), 🚲 (sykkel), 📍 (ankomst) — bra for prototyping, erstatt med SVG for produksjon og skjermleser-støtte

---

## Ord og uttrykk

### Navigasjonsord vi validerte i felt

| Norsk | Bruk | Ikke bruk |
|-------|------|-----------|
| `Gå av på Helsfyr` | ✅ Klar, handlingsorientert | ~~«Stopp: Helsfyr»~~ |
| `Gå til Helsfyr stasjon` | ✅ Presist | ~~«Gå mot nord»~~ |
| `Vent på buss 37` | ✅ Konkret | ~~«Neste avgang»~~ |
| `Du er på T-banen` | ✅ Bekreftende | ~~«Aktiv strekning»~~ |
| `Du er fremme!` | ✅ Tydelig | ~~«Destinasjon nådd»~~ |
| `Stå på til Nationaltheatret` | ✅ Enkelt | ~~«Bli sittende til»~~ |

### Transportmodi (norsk)

| Kode | Tekst | I setning |
|------|-------|-----------|
| `foot` | Gange | «Gå til...» |
| `bus` | Buss | «Er du på bussen?» |
| `tram` | Trikk | «Er du på trikken?» |
| `metro` | T-bane | «Er du på T-banen?» |
| `rail` | Tog | «Er du på toget?» |
| `water` | Båt | «Er du på båten?» |
| `coach` | Buss | «Er du på bussen?» |

### Plattform-termer (validert)

| Modus | Term | Eksempel |
|-------|------|---------|
| Tog, T-bane | Spor | «Spor 4» |
| Båt | Kai | «Kai 2» |
| Trikk | Holdeplass | «Holdeplass 1» |
| Buss, Ekspressbuss | Plattform | «Plattform B» |

*Bergen og Trondheim bruker «Holdeplass» konsekvent for trikk/Bybanen.*

### Kapasitet

| Status | Tekst | Ikon |
|--------|-------|------|
| `EMPTY` / `MANY_SEATS_AVAILABLE` | God plass | Capacity_empty.svg |
| `FEW_SEATS_AVAILABLE` | Noen seter | Capacity_ok.svg |
| `STANDING_ROOM_ONLY` / `FULL` / `NOT_ACCEPTING_PASSENGERS` | Fullt | Capacity_full.svg |

### UI-tekster

```
Søkefelt placeholder : "Hvor vil du reise?"
Tilbake             : aria-label "Tilbake" (ChevronLeft, ingen synlig tekst)
Minimer             : aria-label "Minimer" / "Vis rute"
Start               : "Start navigasjon"
Avbryt              : "Avslutt"
Laster              : "Søker reiseruter..."
GPS finner          : "Finner posisjonen din..."
GPS funnet          : "Posisjonen din er funnet"
Ingen ruter         : "Ingen kollektivruter"
Gange-alternativ    : "Egne ben gjelder"
Sanntid-merke       : "Sanntid"
Pågår nå            : "Pågår nå"
Advarsel avgang     : "Avgangen kan ha gått"
```

---

## Algoritmer og terskler (gjenbruk direkte)

### Fra `src/lib/offroute.ts`

```typescript
// Off-route deteksjon
WALK_THRESHOLD = 80 m        // > 80m fra gangpolyline = off-route
TRANSIT_THRESHOLD = 500 m    // > 500m fra transittrute = off-route
BOARDING_GRACE_NORMAL = 2 min
BOARDING_GRACE_FAST = 4 min  // når hastighet > 5 km/h
WALK_COMPLETED = 180 s       // ben > 3 min gammel = ignorert

// Boardingdeteksjon
BOARDING_PROXIMITY_KNOWN = 200 m   // kjent hastighet ≥ 5 km/h
BOARDING_PROXIMITY_UNKNOWN = 75 m  // hastighet ukjent (iOS)
BOARDING_WINDOW_MAX = 12 min       // maks 12 min siden avgang
BOARDING_WINDOW_FUTURE = 2 min     // maks 2 min til avgang
```

### Fra `src/components/RouteDetail.tsx`

```typescript
NEAR_TRANSIT_RADIUS = 200 m     // vis «gå på nå» ved neste holdeplass
TRANSFER_WALK_MAX = 75 m        // + sameStop = true → behandles som overgang
DEPARTURE_PASSED_THRESHOLD = 60 s
```

### Fra `src/hooks/useNearbyStops.ts`

```typescript
GPS_FETCH_THRESHOLD = 500 m    // hent ny stoppdata hver 500 m
VIEW_FETCH_THRESHOLD = 3000 m  // hent ved kartvandring 3 km
GPS_SEARCH_RADIUS = 15000 m
VIEW_SEARCH_RADIUS = 10000 m
```

### Fra `src/components/Map.tsx`

```typescript
// Dynamisk zoom basert på hastighet
>= 80 km/h → zoom 11
>= 50 km/h → zoom 12
>= 30 km/h → zoom 13
>= 15 km/h → zoom 14
< 15 km/h  → zoom 15
```

### Polyline-dekoding

Gjenbruk `src/lib/polyline.ts` direkte — standard Google-encoded format, brukes av Entur.

### Posisjonsfremgang langs ben

Gjenbruk `positionProgress()` fra `src/components/RouteDetail.tsx`:
- Input: `userLoc {lat, lng}`, `pts [lng, lat][]` (dekodet polyline)
- Output: 0–1 (fremgang langs benet)
- Metode: nærmeste segmentprojeksjon + akkumulert distanse

---

## Komponent-arkitektur for ny app

### Én skjerm, én tilstand

Istedenfor RoutePanel → RouteDetail → Minimized, tenk:

```
<JourneyScreen state="walking_to_stop" />
<JourneyScreen state="waiting_at_stop" />
<JourneyScreen state="riding_transit" />
<JourneyScreen state="transferring" />
<JourneyScreen state="arrived" />
```

Hvert state viser: stor primærhandling øverst, bekreftelse av kontekst midt, valgfri detalj-knapp.

### Hva som aldri vises automatisk

- Tidslinjer med alle stopp
- Kart (valgfritt tillegg)
- Forsinkelseshistorikk
- Alternative ruter (maks 2–3 om nødvendig)

### Hva som alltid er synlig

- «Hva gjør jeg NÅ?» (primær handling, stor bold)
- GPS-statusindikator (grønn/amber/rød dot)
- Tilbake/avslutt-knapp

---

## Tilgjengelighet fra dag én

### Skjermleser (VoiceOver/TalkBack)

- Dynamisk info: `aria-live="polite"` for tilstandsbytte, `aria-live="assertive"` for ankomst og viktige varsler
- Kart: `aria-hidden="true"` med tekstalternativ
- Alle knapper: `aria-label` på norsk
- Bruk `<button>`, ikke `<div>` for interaktive elementer

### Berøringsmål

```
Minimum : 44 × 44 px (iOS/Apple-standard)
Anbefalt: 60 × 60 px for primærhandlinger
Aldri   : under 40 px for noe interaktivt
```

### Skriftstørrelser (CSS-variabler)

```css
--text-action : 20px   /* Primærhandling «Gå til...» */
--text-stop   : 18px   /* Stoppnavn */
--text-detail : 16px   /* Tid, avstand */
--text-label  : 14px   /* Merkelapper, badges */
```

### Kontrastsjekk

| Kombinasjon | Ratio | Status |
|-------------|-------|--------|
| `#313663` på `#FFFFFF` | 10.5:1 | ✅ AAA |
| `#FFFFFF` på `#E60000` | 4.0:1 | ⚠️ AA (bare store elementer) |
| `#FFFFFF` på `#EC700C` | 3.1:1 | ❌ bruk `#B55800` |
| `#FFFFFF` på `#0B91EF` | 3.0:1 | ❌ bruk `#006DB5` |
| `#FFFFFF` på `#003087` | 10.5:1 | ✅ AAA |

**Regel:** Modusfarger kun for grafiske elementer (prikker, striper, piller). For pill-tekst: hvit tekst er OK, men gjør bakgrunnen mørk nok.

---

## PWA og plattform

### Next.js-konfigurasjon som fungerer

```typescript
// layout.tsx
viewport: { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover" }
appleWebApp: { capable: true, statusBarStyle: "black-translucent" }
```

```css
/* globals.css */
body { overflow: hidden; overscroll-behavior: none; }
touch-action: manipulation; /* forhindrer dobbelttrykk-zoom */
```

### Geolocation

```typescript
// Fra src/hooks/useUserLocation.ts
navigator.geolocation.watchPosition(success, error, {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 5000
})
// Speed fra API er m/s — konverter til km/h: speed * 3.6
// iOS returnerer ikke speed konsekvent — håndter null alltid
```

---

## Prosjektstruktur (startpunkt for ny app)

```
/src
  /app
    /api/fonts/[...params]/route.ts   ← Kopier fra RuterFinnFrem
    layout.tsx
    page.tsx                          ← JourneyScreen orchestrator
    globals.css                       ← Kopier design tokens, juster størrelse opp
  /components
    JourneyScreen.tsx                 ← Ny: tilstandsmaskin for ett-om-gangen
    ActionCard.tsx                    ← Stor primærhandling
    MapView.tsx                       ← Valgfritt, bakgrunnskart
    SearchBar.tsx                     ← Kopier fra RuterFinnFrem
  /hooks
    useUserLocation.ts                ← Kopier fra RuterFinnFrem
    useNearbyStops.ts                 ← Kopier fra RuterFinnFrem
    useJourneyState.ts                ← Ny: boardingdeteksjon + tilstandsmaskin
  /lib
    entur-trip.ts                     ← Kopier fra RuterFinnFrem
    entur-stops.ts                    ← Kopier fra RuterFinnFrem
    entur-vehicles.ts                 ← Kopier fra RuterFinnFrem
    offroute.ts                       ← Kopier fra RuterFinnFrem
    polyline.ts                       ← Kopier fra RuterFinnFrem
/public
  /fonts/TID UI Regular/...           ← Kopier fra RuterFinnFrem
  /icons/...                          ← Kopier fra RuterFinnFrem
```

---

## Hva vi IKKE anbefaler å ta med

| Funksjon | Hvorfor ikke |
|----------|-------------|
| Rutepanel med 5 alternativer | For mange valg. Maks 2–3, eller la appen velge. |
| Full tidslinje | For mye info. Erstatt med tilstandsbasert «ett-om-gangen». |
| Kart som primærgrensesnitt | Kartforståelse er krevende. Gjør kartet valgfritt. |
| «Kun gange»-seksjonen | Bra idé, men integrer i primærflyt istedenfor eget panel. |
| Wikipedia POIs | Valgfritt tillegg, ikke relevant for primærmålgruppen. |
| Tog-filteret (exclude rail) | For avansert. Risiko for at brukeren velger bort det rette alternativet. |
| Rutenummer i stor skrift | Fargesymbol + «mot [endestopp]» er mer intuitivt for mange. |

---

## Neste steg

1. **Kopier lib-filer direkte** — `entur-trip.ts`, `entur-stops.ts`, `offroute.ts`, `polyline.ts`, `useUserLocation.ts`, `useNearbyStops.ts` er produksjonsklar kode
2. **Designsystem** — start med `globals.css` herfra og juster skriftstørrelser opp
3. **Tilstandsmaskin** — bygg `useJourneyState.ts` som eksponerer én av fem tilstander med boardingdeteksjon innbygd
4. **Én komponent om gangen** — bygg `ActionCard.tsx` som det eneste grensesnittelementet brukeren ser
5. **Test med reelle brukere tidlig** — off-route tersklene og boardingdeteksjon trenger feltvalidering per brukergruppe
