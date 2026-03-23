1. Hjernen i appen: Tilstandsmaskinen (The State Machine)
For å svare på «Hva gjør jeg NÅ?», må appen vite nøyaktig hvilken fase brukeren er i. Ikke stol på løs logikk i komponentene; bygg en robust tilstandsmaskin.

De 5 tilstandene (Logikken bak)
SEARCHING: Bruker skriver inn destinasjon.

WALKING_TO_STOP: Brukeren beveger seg mot start-punktet.

Trigger: GPS-avstand til fromPlace minker.

WAITING: Brukeren er innenfor 75m (BOARDING_PROXIMITY_UNKNOWN) fra holdeplassen.

Logikk: Her skal vi kun vise "Vent på [Linje]".

ON_VEHICLE: Brukeren er ombord.

Trigger: Hastighet > 15 km/t (Buss/Trikk) ELLER Manuelt trykk/Stopp-teller (T-bane).

ARRIVED: Brukeren er innenfor 300-500m fra destinasjon.

2. Løsningen på T-bane-nøtten: "Hybrid Deteksjon"
Siden du jobber i Ruter, vet du at T-banen er "blindsonen". Her må vi utfordre "automatikk-prinsippet" ditt:

Hvorfor: GPS dør i tunnelen. Akselerometer-data i en PWA er upålitelig når telefonen er i lomma.

Løsning: Bruk læringen fra "Position-basert fremgang", men la den "simuleres" under bakken.

AI-oppgave: Be AI skrive en TransitTimer-hook som tar inn intermediateEstimatedCalls fra Entur. Når brukeren trigger "Jeg er ombord", starter en virtuell progresjon basert på forventet tid mellom stoppene, som kalibreres hver gang de får GPS-fix (f.eks. på Majorstuen/Grønland).

3. Teknisk implementering med AI (Prompts)
Bruk din eksisterende tech-stack (Next.js + Mantine), men mat AI-en med dine spesifikke terskler fra offroute.ts.

Prompt for Boarding-logikk (Kopier/Lim inn til Claude/GPT):
"Jeg bygger en reise-app. Lag en React Hook useBoardingDetection som overvåker brukerens posisjon og hastighet.

Bruk disse konstantene:

BOARDING_PROXIMITY_KNOWN = 200 (meter)

SPEED_THRESHOLD = 5 (m/s)

TRANSIT_THRESHOLD = 500 (meter)

Hooken skal returnere en boolean isProbablyBoarded. Logikken er: Hvis brukeren er innenfor 200m fra holdeplassen OG hastigheten stiger over 5 m/s, sett isProbablyBoarded til true. Hvis brukeren beveger seg mer enn 500m bort fra ruten, sett isOffRoute til true."

Prompt for "Action Card" (UU-fokus):
"Lag en React-komponent ActionCard med Mantine. Den skal implementere 'Hva gjør jeg nå?'-prinsippet.

Krav:

Bruk fonten 'TID UI' (fallback sans-serif).

Tekststørrelse for hovedhandling: 24px bold.

Kontrastforholdet må være minst 7:1 (hvit tekst på #313663 bakgrunn).

Komponenten skal ta imot en state (f.eks. 'walking', 'waiting', 'riding') og vise riktig ikon og tekst basert på Ruters fargestandarder, men med universell utforming (mørkere nyanser for bedre kontrast)."

4. Jeg utfordrer dine antakelser
Utfordring: Er "Ett valg" alltid best?
Du skriver at du vil ha maks 2–3 ruter. Jeg foreslår: Vis kun én. Hvis Entur gir deg en "beste rute" (raskeste), vis den som standard. La brukeren sveipe for å se "Alternativ 2" kun hvis de eksplisitt ønsker det. For en svaksynt eller stresset person er valget mellom to ruter som går med 2 minutters mellomrom en kilde til unødvendig tvil.

Utfordring: Stemmestyring (VoiceFirst)
Siden du bygger en web-app for Ruter-innsalg: Har du vurdert å bruke Web Speech API?

Hvorfor: VoiceOver er fantastisk, men det krever at brukeren navigerer med sveip.

Alternativ: La appen proaktivt "snakke" til brukeren uten at de må røre skjermen: "Du er nå 100 meter fra holdeplassen. Bussen kommer om 2 minutter." Dette senker den kognitive lasten til nesten null.

5. Veien videre (Action Plan)
Gjenbruk direkte: Kopier polyline.ts og positionProgress fra ditt forrige eksperiment. Det er ingen vits i å skrive matte-logikken for projeksjon på nytt.

Fokusér på "The Big Three" skjermer:

Søk (Enkel liste med store trykkflater).

Navigasjon (Action Card).

Feilsituasjon ("Jeg har gått meg vill" - stor rød knapp).

Innsalg internt: Når du presenterer dette for Ruter, fokuser på forsinkelses-logikken din. "Avgangen er 08:48" (istedenfor +3 min rød tekst) er et psykologisk skup som ledelsen vil elske.