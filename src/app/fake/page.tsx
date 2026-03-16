"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MapView } from "@/components/Map";
import { RoutePanel } from "@/components/RoutePanel";
import { RouteDetail } from "@/components/RouteDetail";
import { searchTrip, type TripPattern } from "@/lib/entur-trip";
import { getNearbyStops, type Stop } from "@/lib/entur-stops";

// ── Fake vehicles scattered around the simulated route ─────────────────────
const FAKE_VEHICLES = [
  {
    id: "fake-metro-1",
    lat: 59.9138, lng: 10.7375, // Stortinget T-bane
    bearing: 88,
    mode: "metro",
    occupancyStatus: "FEW_SEATS_AVAILABLE",
  },
  {
    id: "fake-bus-37",
    lat: 59.9065, lng: 10.7730, // Schweigaardsgate
    bearing: 100,
    mode: "bus",
    occupancyStatus: "STANDING_ROOM_ONLY",
  },
  {
    id: "fake-tram-12",
    lat: 59.9195, lng: 10.7310, // Majorstuen-retning
    bearing: 145,
    mode: "tram",
    occupancyStatus: "MANY_SEATS_AVAILABLE",
  },
  {
    id: "fake-bus-30",
    lat: 59.9155, lng: 10.7155, // Frogner
    bearing: 60,
    mode: "bus",
    occupancyStatus: "FULL",
  },
];

// ── Fake occupancy to inject by transit mode order ─────────────────────────
const FAKE_OCCUPANCY_BY_MODE: Record<string, string> = {
  metro: "FEW_SEATS_AVAILABLE",
  bus: "STANDING_ROOM_ONLY",
  tram: "MANY_SEATS_AVAILABLE",
  rail: "FEW_SEATS_AVAILABLE",
  water: "MANY_SEATS_AVAILABLE",
  coach: "FEW_SEATS_AVAILABLE",
};

// ── Fake situations to inject into the first transit leg ───────────────────
const FAKE_SITUATIONS = [
  {
    id: "fake-sit-1",
    summary: [{ value: "Forsinkelser på linje 3", language: "no" }],
    description: [{ value: "Signalfeil ved Majorstuen medfører inntil 8 minutters forsinkelse mot sentrum.", language: "no" }],
  },
  {
    id: "fake-sit-2",
    summary: [{ value: "Begrenset fremkommelighet ved Jernbanetorget", language: "no" }],
    description: [{ value: "Veiarbeid gjør at bussavganger kan avvike fra ruten.", language: "no" }],
  },
];

// Simulert reise: Frogner → gange → Nationaltheatret T-bane → T-bane 3 →
// Jernbanetorget → gange → Buss 37 → Helsfyr (glemt å gå av!) → Bryn
const TRACK: [number, number, number][] = [
  // Gange fra Frogner mot Nationaltheatret
  [59.9220, 10.7198,      0],
  [59.9205, 10.7220,  20_000],
  [59.9185, 10.7245,  45_000],
  [59.9168, 10.7262,  70_000], // Nationaltheatret T-bane (ankommer)
  // Venter + avgår T-bane 3 mot sentrum
  [59.9155, 10.7310, 100_000],
  [59.9138, 10.7375, 120_000], // Stortinget T-bane
  [59.9128, 10.7460, 140_000], // Mellom stopp
  [59.9126, 10.7519, 158_000], // Jernbanetorget (bytte)
  // Gange til bussholdeplass
  [59.9118, 10.7548, 180_000],
  [59.9108, 10.7572, 200_000], // Venter på buss 37
  // Buss 37 østover
  [59.9090, 10.7640, 225_000],
  [59.9065, 10.7730, 250_000], // Schweigaardsgate
  [59.9035, 10.7840, 275_000], // Nærmer seg Helsfyr
  [59.9017, 10.7888, 295_000], // ← HELSFYR — gå av her!
  // Glemt å gå av
  [59.9005, 10.7940, 312_000],
  [59.8985, 10.8010, 330_000], // Mot Bryn
  [59.8960, 10.8070, 360_000], // Bryn
];

const PHASES: { from: number; to: number; label: string }[] = [
  { from:       0, to:  70_000, label: "🚶 Går til Nationaltheatret T-bane" },
  { from:  70_000, to: 100_000, label: "⏳ Venter på T-bane 3" },
  { from: 100_000, to: 158_000, label: "🚇 T-bane 3 → Jernbanetorget" },
  { from: 158_000, to: 200_000, label: "🚶 Bytter — går til buss 37" },
  { from: 200_000, to: 290_000, label: "🚌 Buss 37 mot Helsfyr" },
  { from: 290_000, to: 305_000, label: "📍 Helsfyr — gå av her!" },
  { from: 305_000, to: 360_000, label: "😅 Glemte å gå av... rute oppdateres" },
];

const DESTINATION = { lat: 59.9017, lng: 10.7888, name: "Helsfyr T-banestasjon" };
const TOTAL_DURATION = TRACK[TRACK.length - 1][2];
const SPEED = 5; // 5× real time → full journey i ~72 sek

function interpolate(t: number): { lat: number; lng: number } {
  if (t <= TRACK[0][2]) return { lat: TRACK[0][0], lng: TRACK[0][1] };
  const last = TRACK[TRACK.length - 1];
  if (t >= last[2]) return { lat: last[0], lng: last[1] };
  for (let i = 0; i < TRACK.length - 1; i++) {
    const [la0, lo0, t0] = TRACK[i];
    const [la1, lo1, t1] = TRACK[i + 1];
    if (t >= t0 && t <= t1) {
      const p = (t - t0) / (t1 - t0);
      return { lat: la0 + (la1 - la0) * p, lng: lo0 + (lo1 - lo0) * p };
    }
  }
  return { lat: TRACK[0][0], lng: TRACK[0][1] };
}

function getPhase(t: number): string {
  for (const ph of PHASES) {
    if (t >= ph.from && t < ph.to) return ph.label;
  }
  return PHASES[PHASES.length - 1].label;
}

export default function FakePage() {
  const [simTime, setSimTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>(
    { lat: TRACK[0][0], lng: TRACK[0][1] }
  );
  const destination = DESTINATION;

  const [routes, setRoutes] = useState<TripPattern[]>([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [routeDetailMinimized, setRouteDetailMinimized] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopsCacheRef = useRef<Map<string, Stop>>(new Map());

  // Advance simulation
  useEffect(() => {
    if (!running || done) return;
    intervalRef.current = setInterval(() => {
      setSimTime((prev) => {
        const next = prev + (100 * SPEED);
        if (next >= TOTAL_DURATION) {
          setRunning(false);
          setDone(true);
          return TOTAL_DURATION;
        }
        return next;
      });
    }, 100);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, done]);

  // Update user location from sim time
  useEffect(() => {
    setUserLocation(interpolate(simTime));
  }, [simTime]);

  // Fetch routes on location change
  const lastFetchRef = useRef<string>("");
  useEffect(() => {
    const key = `${userLocation.lat.toFixed(4)},${userLocation.lng.toFixed(4)}`;
    if (key === lastFetchRef.current) return;
    lastFetchRef.current = key;
    searchTrip(userLocation, destination, 3)
      .then((trips) => {
        // Inject fake situations into transit legs of the first trip
        const patched = trips.map((trip, ti) => {
          if (ti !== 0) return trip;
          let sitIdx = 0;
          return {
            ...trip,
            legs: trip.legs.map((leg) => {
              if (leg.mode === "foot") return leg;
              const patchedLeg = {
                ...leg,
                occupancy: FAKE_OCCUPANCY_BY_MODE[leg.mode],
              };
              if (sitIdx < FAKE_SITUATIONS.length) {
                patchedLeg.situations = [FAKE_SITUATIONS[sitIdx++]];
              }
              return patchedLeg;
            }),
          };
        });
        setRoutes(patched);
        setSelectedRoute(0);
      })
      .catch(console.error);
  }, [userLocation]);

  // Stops — same caching logic as main page
  function haversineDist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  const lastViewFetchPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const handleViewChange = useCallback((lat: number, lng: number) => {
    const last = lastViewFetchPosRef.current;
    if (last && haversineDist(last, { lat, lng }) < 3000) return;
    lastViewFetchPosRef.current = { lat, lng };
    getNearbyStops(lat, lng, 10000)
      .then((newStops) => {
        const cache = stopsCacheRef.current;
        let changed = false;
        for (const s of newStops) {
          if (!cache.has(s.id)) { cache.set(s.id, s); changed = true; }
        }
        if (changed) setStops(Array.from(cache.values()));
      })
      .catch(console.error);
  }, []);

  // vehicleLegs from the expanded route (for real polling if serviceJourneys exist)
  const vehicleLegs = useMemo(() => {
    if (expandedRoute === null || !routes[expandedRoute]) return undefined;
    return routes[expandedRoute].legs
      .filter(l => l.mode !== "foot" && l.serviceJourney?.id)
      .map(l => ({
        serviceJourneyId: l.serviceJourney!.id,
        mode: l.mode,
        transportSubmode: l.transportSubmode,
        color: "#E60000",
      }));
  }, [expandedRoute, routes]);

  function reset() {
    setSimTime(0);
    setRunning(false);
    setDone(false);
    setRoutes([]);
    setExpandedRoute(null);
    setRouteDetailMinimized(false);
    lastFetchRef.current = "";
  }

  const progress = Math.min(simTime / TOTAL_DURATION, 1);
  const phase = getPhase(simTime);

  return (
    <main className="fixed inset-0">
      <MapView
        userLocation={userLocation}
        destination={destination}
        routes={routes}
        selectedRouteIndex={selectedRoute}
        stops={stops}
        centerOnUser={expandedRoute !== null}
        detailMinimized={routeDetailMinimized}
        onViewChange={handleViewChange}
      />

      {routes.length > 0 && expandedRoute === null && (
        <RoutePanel
          routes={routes}
          selectedIndex={selectedRoute}
          onSelect={(i) => { setSelectedRoute(i); setExpandedRoute(i); }}
        />
      )}
      {routes.length > 0 && expandedRoute !== null && (
        <RouteDetail
          trip={routes[expandedRoute] ?? routes[0]}
          destinationName={destination.name}
          onBack={() => setExpandedRoute(null)}
          onMinimizedChange={setRouteDetailMinimized}
        />
      )}

      {/* Simulation control panel */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      >
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-ink-primary/5 px-4 py-3">
          {/* Phase label */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink-primary">{phase}</span>
            <span className="text-xs text-ink-primary/40 font-mono">5× fart</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-ink-primary/10 rounded-full mb-3 overflow-hidden">
            <div
              className="h-full bg-[#091AA9] rounded-full transition-all duration-100"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {!done ? (
              <button
                onClick={() => setRunning((r) => !r)}
                className="flex-1 h-9 rounded-xl bg-[#091AA9] text-white text-sm font-medium hover:bg-[#091AA9]/90 transition-colors"
              >
                {running ? "⏸ Pause" : simTime === 0 ? "▶ Start simulasjon" : "▶ Fortsett"}
              </button>
            ) : (
              <div className="flex-1 text-center text-sm text-ink-primary/60">Simulasjon ferdig</div>
            )}
            <button
              onClick={reset}
              className="h-9 px-3 rounded-xl bg-ink-primary/5 text-ink-primary/60 text-sm hover:bg-ink-primary/10 transition-colors"
            >
              ↺ Start på nytt
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
