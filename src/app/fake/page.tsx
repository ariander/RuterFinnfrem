"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MapView } from "@/components/Map";
import { RoutePanel } from "@/components/RoutePanel";
import { RouteDetail } from "@/components/RouteDetail";
import { searchTrip, type TripPattern } from "@/lib/entur-trip";
import { getNearbyStops, type Stop } from "@/lib/entur-stops";

// Simulated journey: Oslo S → walk → Jernbanetorget T-bane → T-bane 4 → Tøyen (miss!) → Carl Berner
// Times in milliseconds of simulated real-world time
const TRACK: [number, number, number][] = [
  [59.9111, 10.7528,      0],  // Oslo S
  [59.9116, 10.7522,  15_000], // Walking...
  [59.9120, 10.7519,  30_000], // ...
  [59.9126, 10.7519,  50_000], // Jernbanetorget T-bane (boarding)
  [59.9128, 10.7530,  65_000], // Avgår
  [59.9130, 10.7558,  85_000], // Under Grønland
  [59.9131, 10.7610, 110_000], // Nærmer seg Tøyen
  [59.9131, 10.7628, 130_000], // ← HER ER TØYEN — bør gå av!
  [59.9135, 10.7660, 148_000], // Glemt å gå av, fortsetter...
  [59.9143, 10.7712, 165_000], // Mot Carl Berners plass
  [59.9157, 10.7760, 185_000], // Carl Berners plass
  [59.9165, 10.7790, 210_000], // Etter Carl Berner
];

const PHASES: { from: number; to: number; label: string }[] = [
  { from:       0, to:  50_000, label: "🚶 Går til Jernbanetorget T-bane" },
  { from:  50_000, to:  65_000, label: "⏳ Venter på T-bane 4" },
  { from:  65_000, to: 128_000, label: "🚇 T-bane 4 mot Tøyen" },
  { from: 128_000, to: 135_000, label: "📍 Tøyen — gå av her!" },
  { from: 135_000, to: 210_000, label: "😅 Glemte å gå av... rute oppdateres" },
];

const DESTINATION = { lat: 59.9131, lng: 10.7628, name: "Tøyen T-banestasjon" };
const TOTAL_DURATION = TRACK[TRACK.length - 1][2];
const SPEED = 5; // 5× real time → full journey in ~3.5 min wall time

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
      .then((trips) => { setRoutes(trips); setSelectedRoute(0); })
      .catch(console.error);
  }, [userLocation]);

  // Stops
  const handleViewChange = useCallback((lat: number, lng: number) => {
    getNearbyStops(lat, lng, 8000)
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

  function reset() {
    setSimTime(0);
    setRunning(false);
    setDone(false);
    setRoutes([]);
    setExpandedRoute(null);
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
