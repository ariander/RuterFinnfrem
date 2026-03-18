## FinnFrem – prosjektoversikt

Denne filen er ment som en “kickstart” for assistenter/utviklere som skal inn i prosjektet uten å kunne lese hele repoet først.

### 1. Hva er FinnFrem?

- **Type**: Mobil-først PWA bygget med Next.js (App Router).
- **Formål**: Vise GPS-basert reiseveiledning for kollektiv (Ruter/Entur) på et kart, med fokus på:
  - Nåværende posisjon
  - Søk etter destinasjon
  - Foreslåtte ruter og reisedetaljer
  - God visuell/UX-fidelitet i tråd med Ruter-brand.
- **Inspirasjon**: Viser reisedetaljer i stil med native reiseapper (kort med linjer, perrong, gangetapper, overganger osv.).

### 2. Teknisk stack (kort)

- **Framework**: Next.js 16 (App Router) med React 19.
- **Språk**: TypeScript, strict mode.
- **Styling**:
  - Tailwind CSS v4 (`src/app/globals.css` med design tokens).
  - shadcn/ui-komponenter.
  - Lokal font `TID UI` via `next/font` (se `src/app/layout.tsx`).
- **Kart**:
  - MapLibre GL JS (`src/components/Map.tsx`).
  - Egen font-endepunkt for kart (`src/app/api/fonts/[...params]/route.ts`).
- **Deploy**:
  - GitHub repo.
  - Vercel, automatisk deploy fra `main` og previews fra feature-branches.

### 3. Hovedfunksjoner og dataflyt

#### 3.1 Hovedskjerm / reiseflyt

- **Fil**: `src/app/page.tsx`
- **Komponent**: `Home`
- **Ansvar**:
  - Henter brukerposisjon via hook (`useUserLocation`).
  - Viser søkefelt og toppkort.
  - Holder state for valgt destinasjon, ruter, valgt rute, utvidet detaljpanel, walk-only osv.
  - Koordinerer kart (`MapView`), ruteoversikt (`RoutePanel`), rutedetaljer (`RouteDetail`) og walk-only-panelet.
  - Henter ruter fra Entur (`searchTrip`, `searchWalkRoute`).
  - Holder en lokal cache av nærliggende stopp via `useNearbyStops`.
  - Har logikk for “off-route”-deteksjon (om brukeren har gått av ruten) via `isOffRoute` (i `src/lib/offroute.ts`).

#### 3.2 Geolokasjon

- **Hook**: `src/hooks/useUserLocation.ts`
- **Gjør**:
  - Bruker `navigator.geolocation.watchPosition`.
  - Oppdaterer `userLocation`, `userHeading` (kompassretning) og eventuelle geofeil.
  - Har fallback-posisjon (Dronningens gate 40, Oslo) ved feil.

#### 3.3 Stopp rundt bruker/kartutsnitt

- **Hook**: `src/hooks/useNearbyStops.ts`
- **Backend-helper**: `src/lib/entur-stops.ts`
- **Gjør**:
  - Kaller Entur Journey Planner (GraphQL) `nearest` for stopp rundt bruker/visningen.
  - Normaliserer til `Stop { id, name, lat, lng, modes[] }`.
  - Cache’er stopp i et `Map` og oppdaterer kun når brukeren beveger seg et visst antall meter.
  - Eksponerer `stops` og en `handleViewChange(lat, lng)` som `MapView` kaller når kartet panoreres.

#### 3.4 Ruter og reisedetaljer (Entur)

- **Fil**: `src/lib/entur-trip.ts`
- **Viktig**:
  - Definerer typer: `TripPattern`, `Leg`, `Place`, `LineInfo`, `EstimatedCall`, `Situation`.
  - Eksporterer `searchTrip` og `searchWalkRoute`:
    - Begge kaller Entur Journey Planner v3 GraphQL-endepunkt.
    - `searchTrip` ber om flere transportmodi (buss, trikk, metro, tog, båt, coach).
    - `searchWalkRoute` henter ren gangrute (brukes til “walk-only” og gang/sykkel-panel).
  - Hjelpefunksjoner:
    - `formatTime`, `formatDuration`.
    - `getModeColor` (Ruter-farger for modus).
    - `getModeName` (norske transportnavn).

#### 3.5 Kart (`MapView`)

- **Fil**: `src/components/Map.tsx`
- **Ansvar**:
  - Initialiserer MapLibre med Carto Voyager-stil.
  - Overstyrer `glyphs` slik at kartet bruker `TID UI` (via eget API-endepunkt).
  - Viser:
    - Brukerposisjon (blå prikk med siktkone).
    - Destinasjon (pin-ikon).
    - Valgte ruter (transit + gang) som linjer, med alternative ruter i svakere farge.
    - Overgangspunkter som prikker.
    - Nærliggende stopp som “badges” (busstopp, trikk, T-bane osv.).
  - Har logikk for:
    - “Follow user” (kartet følger brukerposisjon med padding mellom topp- og bunnkort).
    - Re-center-knapp når brukeren drar kartet manuelt.
  - Bruker `decodePolyline` fra `src/lib/polyline.ts` for å dekode Entur-polylines.

#### 3.6 Rutedetaljer

- **Fil**: `src/components/RouteDetail.tsx`
- **Ansvar**:
  - Viser en tidslinje med alle `legs` i valgt `TripPattern`:
    - Gange, venting, ombordstigning, avstigning, mellomstopp.
    - Viser forsinkelser, sanntid (occupancy) og eventuelle situasjoner/avvik (fra Entur).
  - Viser et toppfelt med total reisetid og tidspunkter.
  - Støtter minimert/utvidet visning (brukes for å justere kart-padding).
  - **Egen UX-logikk**:
    - Korte gå-ben på samme holdeplass (samme `fromPlace.name` og `toPlace.name`, liten distanse) vises som **“Overgang”** i stedet for “Gå 0 min …”.
    - Ved overgang brukes `Platform.svg` som ikon og `ArrowRight.svg` som pil mellom plattformer (`Perrong X → Perrong Y` eller `Spor X → Spor Y`).

### 4. API-er som brukes

- **Entur Geocoder**:
  - URL: `https://api.entur.io/geocoder/v1/autocomplete`
  - Brukes i `SearchBar` (`src/components/SearchBar.tsx`) for å søke etter adresser/POI/stopp.
  - Resultatene sorteres slik at kollektivstopp/stasjoner prioriteres øverst.

- **Entur Journey Planner v3 (GraphQL)**:
  - URL: `https://api.entur.io/journey-planner/v3/graphql`
  - Brukes i:
    - `searchTrip` / `searchWalkRoute` (`src/lib/entur-trip.ts`).
    - `getNearbyStops` (`src/lib/entur-stops.ts`).

### 5. Viktige filer og mapper (hurtigkart)

- `src/app/layout.tsx` – rotlayout, fonter, metadata.
- `src/app/page.tsx` – hovedskjermen (Home).
- `src/app/globals.css` – Tailwind + design tokens (Ruter-farger, bakgrunn, typografi).
- `src/components/Map.tsx` – kart, ruter, stopp, brukerposisjon.
- `src/components/RoutePanel.tsx` – oversikt over alternativer (listekort).
- `src/components/RouteDetail.tsx` – detaljvisning for valgt rute (timeline).
- `src/components/SearchBar.tsx` – søkekomponent mot Entur Geocoder.
- `src/hooks/useUserLocation.ts` – geolokasjon/heading-hook.
- `src/hooks/useNearbyStops.ts` – stopp rundt bruker/kartutsnitt.
- `src/lib/entur-trip.ts` – Entur trip-helpers + typer.
- `src/lib/entur-stops.ts` – Entur stopp-helpers.
- `src/lib/polyline.ts` – polyline-dekoder (brukes i kart og offroute).
- `src/lib/offroute.ts` – logikk for om bruker er “av rute”.

### 6. Git- og deploy-flyt (anbefalt)

- **Main branch**: `main`
  - Skal alltid være stabil og matche det som ligger i produksjon på Vercel.
- **Feature-branches**:
  - Navn: `feature/...` eller `fix/...` (f.eks. `feature/overgang-visning`).
  - Opprett fra `main`, gjør endringer, lag PR tilbake til `main`.
- **Pull Requests**:
  - All utvikling inn til `main` bør skje via PR (ingen direkte push til `main`).
  - Vercel lager automatisk preview-deploy for hver PR slik at endringer kan testes visuelt.

### 7. Hva er bevisst fjernet/ikke i bruk?

- Tidligere fantes en Targomo-basert isokron-funksjon (`/api/isochrone`, `lib/targomo.ts`), men:
  - Targomo-integrasjonen er fjernet.
  - All reiseinformasjon og dekning håndteres nå av Entur (ruter + gangavstand) + egne helpers.
  - Eventuelle referanser i docs til Targomo skal tolkes som historiske.

### 8. Hva bør en ny assistent gjøre først?

1. Les denne filen for oversikt (du er her).
2. Se raskt på:
   - `src/app/page.tsx` – hvordan state flyter.
   - `src/components/Map.tsx` og `RouteDetail.tsx` – kart og rutedetaljer.
   - `src/lib/entur-trip.ts` – hvordan data ser ut.
3. Kjør lokalt:

```bash
npm install
npm run dev
```

4. Åpne `http://localhost:3000` og test:
   - Geolokasjon/posisjonsindikator.
   - Søk og valg av destinasjon.
   - Visning av ruteoversikt og detaljer.
   - Overgangsvisning på korte gangetapper.

