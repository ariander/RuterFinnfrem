# Prosjekt: Reisetid POC for Ruter
Jeg er en UX-designer og frontend-utvikler som skal bygge en interaktiv kart-prototype (isokron-kart). 

## Vedlagte filer
1. Skisser av UI (Søkefelt øverst, kontrollpanel nederst).
2. SVG-filer for Ruter-logo og transportikoner.
3. Fontfilen "TID UI".

## Teknisk Stack
- Next.js (App Router), Tailwind CSS, shadcn/ui.
- Kartbibliotek: MapLibre GL JS.
- Geocoding API: Entur (https://api.entur.io/geocoder/v1/).
- Isokron API: Targomo (v1/isochrone).

## Design Tokens (Ruter Brand)
- **Font:** Bruk den vedlagte "TID UI" som primærfont i Tailwind-konfigurasjonen.
- **Ink Primary:** `#313663` (Bruk for all hovedtekst og ikoner).
- **Ink Secondary:** `#272D60` med 70% opacity (Bruk for dashed outline på isokron-bloben).
- **Ink Tertiary:** `#2A3066` med 55% opacity (Bruk som fill-farge på isokron-bloben).
- **Bakgrunn:** Rent hvit (#FFFFFF) for UI-komponenter med subtile skygger.

## Funksjonelle Krav
1. **Søk:** Implementer søkefeltet fra skissen. Bruk Entur Geocoder API for å finne steder (POI og adresser). Når et resultat velges, flytt kartet dit og sett en marker.
2. **Isokron-logikk (30+10):** - Hent verdier fra dropdowns i kontrollpanelet.
   - Beregn total tid (Transit + Walk). 
   - Send forespørsel til Targomo med `travelType: transit` og `maxWalkTime` satt til valgt gangtid.
   - Viktig: Bruk rush-hour tidspunkt (neste mandag kl. 08:00).
3. **Kartvisning:** - Bruk MapLibre med en lys, minimalistisk kartstil.
   - Tegn isokronen som et GeoJSON-lag.
   - Kanten (stroke) skal være dashed (Ink Secondary).
   - Fyllet (fill) skal være Ink Tertiary.
4. **UI-Komponenter:**
   - Bruk shadcn/ui (Card, Select, Input, Button) for å gjenskape skissene nøyaktig.
   - Plasser kontrollpanelet nederst og søkefeltet øverst som "floating elements".

## Oppgave
Lag en komplett `page.tsx`, `layout.tsx` og nødvendige underkomponenter. Sett opp Tailwind-konfigurasjonen slik at den inkluderer fargene og fonten nevnt over. Anta at API-nøkler ligger i `.env.local` som `NEXT_PUBLIC_TARGOMO_KEY`.