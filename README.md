FinnFrem er en mobil-først prototype for GPS-basert kollektivnavigasjon bygget som en PWA med Next.js.

## Getting Started

For å starte utviklingsserveren:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Åpne `http://localhost:3000` i nettleseren for å se appen.

## Teknisk oversikt

- Next.js (App Router) med TypeScript og ESLint v9.
- UI: Tailwind CSS v4 + shadcn/ui + Ruter-fonten `TID UI`.
- Kart: MapLibre GL JS med egen font-endepunkt (`/api/fonts/...`).
- Datakilder:
  - Entur Geocoder (`api.entur.io/geocoder/v1/`) for søk etter steder/stopp.
  - Entur Journey Planner (`api.entur.io/journey-planner/v3/graphql`) for ruter og stopp.

## Miljøvariabler

Per nå brukes kun Entur uten eksplisitte nøkler i denne POC-en. Dersom Entur krever identifikasjon kan du legge til et klientnavn i `.env.local`:

```bash
ET_CLIENT_NAME=ruterfinnfrem-poc
```

og bruke den i fetch-kallene ved behov.

## Hovedstruktur

- `src/app/page.tsx`: Orkestrerer kart, søk, ruteoversikt og detaljer.
- `src/components/Map.tsx`: Kartvisning med ruter, stopp og brukerposisjon.
- `src/components/SearchBar.tsx`: Entur-geocodingsøk med tastaturnavigasjon.
- `src/lib/entur-trip.ts`: Typer og helpers for Entur-ruteforespørsler.
- `src/lib/entur-stops.ts`: Henting og normalisering av nærliggende stopp.
- `src/hooks/useUserLocation.ts`: Hook for geolokasjon og heading.
- `src/hooks/useNearbyStops.ts`: Hook for stopp-cache rundt bruker og kartutsnitt.

Isokron-funksjonaliteten som tidligere brukte Targomo er fjernet; appen viser nå ruter og reisetider basert på Entur alene.
