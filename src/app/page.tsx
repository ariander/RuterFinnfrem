"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MapView } from "@/components/Map";
import { SearchBar } from "@/components/SearchBar";
import { RoutePanel } from "@/components/RoutePanel";
import { RouteDetail } from "@/components/RouteDetail";
import { searchTrip, type TripPattern } from "@/lib/entur-trip";
import { getNearbyStops, type Stop } from "@/lib/entur-stops";

export default function Home() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routes, setRoutes] = useState<TripPattern[]>([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches ||
      window.innerWidth < 768
    );
  }, []);
  const [loading, setLoading] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Loading overlay state
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingLeaving, setLoadingLeaving] = useState(false);
  const loadingShowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingLeaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loading) {
      if (loadingLeaveRef.current) clearTimeout(loadingLeaveRef.current);
      setLoadingLeaving(false);
      loadingShowRef.current = setTimeout(() => setLoadingVisible(true), 200);
    } else {
      if (loadingShowRef.current) clearTimeout(loadingShowRef.current);
      setLoadingLeaving(true);
      loadingLeaveRef.current = setTimeout(() => {
        setLoadingVisible(false);
        setLoadingLeaving(false);
      }, 300);
    }
  }, [loading]);

  // Start GPS tracking on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation støttes ikke i denne nettleseren.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoError(null);
      },
      (err) => {
        console.error("Geolocation error:", err);
        // Fallback to Oslo S for development/testing
        setUserLocation({ lat: 59.9111, lng: 10.7528 });
        setGeoError(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Search for trips when destination or user location changes
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userLocation || !destination) return;

    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const trips = await searchTrip(userLocation, destination, 5);
        setRoutes(trips);
        setSelectedRoute(0);
      } catch (err) {
        console.error("Trip search error:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (searchRef.current) clearTimeout(searchRef.current);
    };
  }, [userLocation, destination]);

  // Periodic route refresh when detail is open
  useEffect(() => {
    if (expandedRoute === null || !userLocation || !destination) return;
    const id = setInterval(async () => {
      try {
        const trips = await searchTrip(userLocation, destination, 5);
        setRoutes(trips);
      } catch (err) {
        console.error("Route refresh error:", err);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [expandedRoute, userLocation, destination]);

  // Stops cache
  const stopsCacheRef = useRef<Map<string, Stop>>(new Map());
  const handleViewChange = useCallback((lat: number, lng: number) => {
    getNearbyStops(lat, lng, 8000)
      .then((newStops) => {
        const cache = stopsCacheRef.current;
        let changed = false;
        for (const s of newStops) {
          if (!cache.has(s.id)) {
            cache.set(s.id, s);
            changed = true;
          }
        }
        if (changed) setStops(Array.from(cache.values()));
      })
      .catch(console.error);
  }, []);

  const handleDestinationSelect = useCallback(
    (loc: { lat: number; lng: number; name: string }) => {
      setDestination(loc);
      setSearchFocused(false);
    },
    [],
  );

  const handleClearDestination = useCallback(() => {
    setDestination(null);
    setRoutes([]);
    setSelectedRoute(0);
    setExpandedRoute(null);
  }, []);

  const handleRouteSelect = useCallback((i: number) => {
    setSelectedRoute(i);
    setExpandedRoute(i);
  }, []);

  return (
    <main className="fixed inset-0">
      {/* Search panel — animates from bottom to top on focus */}
      {!destination && (
        <div
          className="fixed left-1/2 z-[110] w-full max-w-md px-4 transition-transform duration-300 ease-in-out"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 1rem)",
            transform: (!isMobile || searchFocused)
              ? "translateX(-50%)"
              : "translateX(-50%) translateY(calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 5rem))",
          }}
        >
          <div className="bg-white/85 backdrop-blur-xl rounded-2xl shadow-lg px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchBar
                  onSelect={handleDestinationSelect}
                  onFocusChange={setSearchFocused}
                />
              </div>
              <div
                className={`shrink-0 w-2 h-2 rounded-full transition-colors ${
                  userLocation ? "bg-emerald-500" : geoError ? "bg-red-400" : "bg-amber-400 animate-pulse"
                }`}
                title={userLocation ? "Posisjonen din er funnet" : geoError || "Finner posisjonen din..."}
              />
            </div>
          </div>
          {geoError && searchFocused && (
            <div className="mt-2 bg-red-50/90 backdrop-blur-xl rounded-xl px-3 py-2 shadow-lg">
              <p className="text-xs text-red-700">{geoError}</p>
            </div>
          )}
        </div>
      )}

      {/* Route header — shown when destination is set */}
      {destination && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
        >
          <div className="bg-white/85 backdrop-blur-xl rounded-2xl shadow-lg px-3 py-2.5">
            <div className="flex flex-col gap-0 px-2">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-3 h-3 rounded-full bg-[#4285F4] border-2 border-white shadow-sm shrink-0" />
                <span className="text-sm text-ink-primary/60 truncate">Min posisjon</span>
              </div>
              <div className="ml-1.25 border-l-2 border-ink-primary/15 h-3" />
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#E60000] border-2 border-white shadow-sm shrink-0" />
                <span className="text-sm font-medium text-ink-primary truncate flex-1">
                  {destination.name}
                </span>
                <button
                  onClick={handleClearDestination}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-ink-primary/5 transition-colors"
                  aria-label="Fjern destinasjon"
                >
                  <span className="text-ink-primary/40 text-lg leading-none">×</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <MapView
        userLocation={userLocation ?? undefined}
        destination={destination ?? undefined}
        routes={routes}
        selectedRouteIndex={selectedRoute}
        stops={stops}
        onViewChange={handleViewChange}
      />

      {/* Route panel / detail */}
      {routes.length > 0 && expandedRoute === null && (
        <RoutePanel
          routes={routes}
          selectedIndex={selectedRoute}
          onSelect={handleRouteSelect}
        />
      )}
      {routes.length > 0 && expandedRoute !== null && (
        <RouteDetail
          trip={routes[expandedRoute] ?? routes[0]}
          destinationName={destination?.name ?? ""}
          onBack={() => setExpandedRoute(null)}
        />
      )}

      {/* Loading overlay — only show if no routes found yet */}
      {loadingVisible && routes.length === 0 && (
        <div
          className={`absolute inset-0 bg-white/20 backdrop-blur-[2px] z-[100] flex items-center justify-center ${
            loadingLeaving
              ? "animate-out fade-out duration-300"
              : "animate-in fade-in duration-200"
          }`}
        >
          <div
            className={`bg-white p-5 rounded-2xl shadow-2xl flex items-center gap-3 ${
              loadingLeaving
                ? "animate-out fade-out zoom-out-75 duration-300"
                : "animate-in fade-in zoom-in-75 duration-200"
            }`}
          >
            <div className="w-5 h-5 border-3 border-ink-primary border-t-transparent rounded-full animate-spin" />
            <span className="font-medium text-ink-primary text-sm">Søker reiseruter...</span>
          </div>
        </div>
      )}
    </main>
  );
}
