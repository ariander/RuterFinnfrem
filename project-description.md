# Prosjekt: Reisetid POC for Ruter
Jeg er en UX-designer og frontend-utvikler som skal bygge en interaktiv kart-prototype (isokron-kart). 

## Vedlagte filer
1. Skisser av UI (Søkefelt øverst, kontrollpanel nederst).
2. SVG-filer for Ruter-logo og transportikoner.
3. Fontfilen "TID UI".

## Teknisk Stack
- Next.js (App Router), Tailwind CSS, shadcn/ui.
- Kartbibliotek: MapLibre GL JS.
- Geocoding API og ruter: Entur (https://api.entur.io/).

## Design Tokens (Ruter Brand)
- **Font:** Bruk den vedlagte "TID UI" som primærfont i Tailwind-konfigurasjonen.
- **Ink Primary:** `#313663` (Bruk for all hovedtekst og ikoner).
- **Ink Secondary:** `#272D60` med 70% opacity (Bruk for dashed outline på isokron-bloben).
- **Ink Tertiary:** `#2A3066` med 55% opacity (Bruk som fill-farge på isokron-bloben).
- **Bakgrunn:** Rent hvit (#FFFFFF) for UI-komponenter med subtile skygger.

## Funksjonelle Krav (opprinnelig POC)
1. **Søk:** Implementer søkefeltet fra skissen. Bruk Entur Geocoder API for å finne steder (POI og adresser). Når et resultat velges, flytt kartet dit og sett en marker.
2. **Reisetid / isokron (historisk):** Den opprinnelige POC-en brukte Targomo til isokroner (30+10). Denne funksjonen er nå fjernet og erstattet av ren Entur-basert reisevisning.
3. **Kartvisning:** - Bruk MapLibre med en lys, minimalistisk kartstil.
   - Tegn relevante lag for ruter, stopp og posisjon.
4. **UI-Komponenter:**
   - Bruk shadcn/ui (Card, Select, Input, Button) for å gjenskape skissene nøyaktig.
   - Plasser kontrollpanelet nederst og søkefeltet øverst som "floating elements".

## Oppgave
Lag en komplett `page.tsx`, `layout.tsx` og nødvendige underkomponenter. Sett opp Tailwind-konfigurasjonen slik at den inkluderer fargene og fonten nevnt over. Eventuelle API-nøkler ligger i `.env.local` (for eksempel Entur-klientnavn dersom det blir påkrevd).