"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search } from "lucide-react";
import { MapView } from "@/components/Map";
import { SearchBar, type SearchBarRef } from "@/components/SearchBar";
import { RoutePanel } from "@/components/RoutePanel";
import { RouteDetail } from "@/components/RouteDetail";
import { searchTrip, searchWalkRoute, formatDuration, formatTime, getLegColor, type TripPattern, type Leg } from "@/lib/entur-trip";
import type { Stop } from "@/lib/entur-stops";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useNearbyStops } from "@/hooks/useNearbyStops";
import { isOffRoute, detectBoardedTransitLeg } from "@/lib/offroute";

export default function Home() {
  const { userLocation, userHeading, userSpeed, geoError } = useUserLocation();
  const [destination, setDestination] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routes, setRoutes] = useState<TripPattern[]>([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBarRef = useRef<SearchBarRef>(null);
  const [loading, setLoading] = useState(false);
  const [walkOnly, setWalkOnly] = useState(false);
  const [walkRoute, setWalkRoute] = useState<TripPattern | null>(null);
  const [excludeRail, setExcludeRail] = useState(false);
  const excludeRailRef = useRef(excludeRail);
  excludeRailRef.current = excludeRail;
  const { stops, handleViewChange } = useNearbyStops(userLocation);

  // Boarding detection popup
  const [boardingPrompt, setBoardingPrompt] = useState<{ legIndex: number; leg: Leg } | null>(null);
  const suppressedJourneysRef = useRef(new Set<string>());

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

  // Boarding detection: show popup when user appears to be on a transit vehicle
  useEffect(() => {
    if (expandedRoute === null || !userLocation || !userSpeed || userSpeed < 10) return;
    if (boardingPrompt) return; // already showing one
    const route = routes[expandedRoute];
    if (!route) return;
    const legIdx = detectBoardedTransitLeg(userLocation, userSpeed, route);
    if (legIdx === null) return;
    const leg = route.legs[legIdx];
    const journeyId = leg.serviceJourney?.id;
    if (journeyId && suppressedJourneysRef.current.has(journeyId)) return;
    setBoardingPrompt({ legIndex: legIdx, leg });
  }, [userLocation, userSpeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search for trips when destination changes OR when user has moved significantly off-route
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSearchedDestRef = useRef<{ lat: number; lng: number } | null>(null);
  const expandedRouteRef = useRef(expandedRoute);
  expandedRouteRef.current = expandedRoute;
  const routesRef = useRef(routes);
  routesRef.current = routes;

  useEffect(() => {
    if (!userLocation || !destination) return;

    const destChanged = !(
      lastSearchedDestRef.current &&
      lastSearchedDestRef.current.lat === destination.lat &&
      lastSearchedDestRef.current.lng === destination.lng
    );

    // Off-route: check perpendicular distance from user to current/upcoming walk leg polylines
    const activeRoute =
      expandedRouteRef.current !== null
        ? (routesRef.current[expandedRouteRef.current] ?? routesRef.current[0])
        : null;
    const offRoute = activeRoute != null && isOffRoute(userLocation, activeRoute, userSpeed);

    if (!destChanged && !offRoute) return;

    lastSearchedDestRef.current = { lat: destination.lat, lng: destination.lng };

    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const trips = await searchTrip(userLocation, destination, 5, excludeRailRef.current);
        setRoutes(trips);
        if (expandedRouteRef.current === null) {
          setSelectedRoute(0);
        }
        setWalkOnly(trips.length === 0);
      } catch (err) {
        console.error("Trip search error:", err);
        // On failure, fall through to walk-only so user sees something
        setWalkOnly(true);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (searchRef.current) clearTimeout(searchRef.current);
    };
  }, [userLocation, destination]);

  // Fetch walk route whenever destination changes (for walk/bike alternatives + walk-only panel)
  useEffect(() => {
    if (!userLocation || !destination) {
      setWalkRoute(null);
      return;
    }
    searchWalkRoute(userLocation, destination)
      .then(setWalkRoute)
      .catch(console.error);
  }, [destination]); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic route refresh when detail is open — anchor to the currently expanded trip
  useEffect(() => {
    if (expandedRoute === null || !userLocation || !destination) return;
    const anchorStartTime = routes[expandedRoute]?.startTime ?? null;
    const id = setInterval(async () => {
      try {
        const trips = await searchTrip(userLocation, destination, 5, excludeRailRef.current);
        setRoutes(trips);
        // Try to keep the user on the same trip after a refresh
        if (anchorStartTime) {
          const sameIdx = trips.findIndex(t => t.startTime === anchorStartTime);
          if (sameIdx >= 0) setExpandedRoute(sameIdx);
          // else: trip disappeared (completed?), leave expandedRoute at current index
        }
      } catch (err) {
        console.error("Route refresh error:", err);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [expandedRoute, userLocation, destination]); // eslint-disable-line react-hooks/exhaustive-deps

  // (stopp-hentelogikk håndteres nå av useNearbyStops)

  const handleDestinationSelect = useCallback(
    (loc: { lat: number; lng: number; name: string }) => {
      setDestination(loc);
      setRoutes([]);
      setWalkOnly(false);
      setWalkRoute(null);
      setExpandedRoute(null);
      lastSearchedDestRef.current = null;
      setSearchOpen(false);
    },
    [],
  );

  const handleClearDestination = useCallback(() => {
    setDestination(null);
    setRoutes([]);
    setSelectedRoute(0);
    setExpandedRoute(null);
    setWalkOnly(false);
    setWalkRoute(null);
    setSearchOpen(false);
    setBoardingPrompt(null);
    lastSearchedDestRef.current = null;
  }, []);

  const handleToggleExcludeRail = useCallback(async () => {
    const next = !excludeRail;
    setExcludeRail(next);
    if (!userLocation || !destination) return;
    setLoading(true);
    try {
      const trips = await searchTrip(userLocation, destination, 5, next);
      setRoutes(trips);
      setSelectedRoute(0);
      setExpandedRoute(null);
      setWalkOnly(trips.length === 0);
    } catch (err) {
      console.error("Trip search error:", err);
    } finally {
      setLoading(false);
    }
  }, [excludeRail, userLocation, destination]);

  const [routeDetailMinimized, setRouteDetailMinimized] = useState(false);

  // Dynamic map follow-padding: measure top card + bottom panel heights
  const topCardRef = useRef<HTMLDivElement>(null);
  const walkPanelRef = useRef<HTMLDivElement>(null);
  const [topPad, setTopPad] = useState(100);
  const [bottomPad, setBottomPad] = useState(360);

  // Observe top card size (re-runs when destination becomes set/cleared)
  useEffect(() => {
    const el = topCardRef.current;
    if (!el) { setTopPad(100); return; }
    const update = () => setTopPad(el.getBoundingClientRect().bottom + 16);
    const obs = new ResizeObserver(update);
    obs.observe(el);
    update();
    return () => obs.disconnect();
  }, [destination]);

  // Called by RoutePanel / RouteDetail / walk panel when their height changes
  const handleBottomBoundsChange = useCallback((dist: number) => {
    setBottomPad(dist + 16);
  }, []);

  // Observe walk-only panel (separate element, not a component with onBoundsChange)
  useEffect(() => {
    const el = walkPanelRef.current;
    if (!el) return;
    const update = () => setBottomPad(window.innerHeight - el.getBoundingClientRect().top + 16);
    const obs = new ResizeObserver(update);
    obs.observe(el);
    update();
    return () => obs.disconnect();
  }, [walkOnly, walkRoute]);

  const followPadding = useMemo(
    () => ({ top: topPad, bottom: bottomPad, left: 40, right: 40 }),
    [topPad, bottomPad],
  );

  const handleRouteSelect = useCallback((i: number) => {
    setSelectedRoute(i);
    setExpandedRoute(i);
    setRouteDetailMinimized(false);
  }, []);


  return (
    <main className="fixed inset-0">
      {/* Fake search trigger — mobile only, bottom, fades out when search opens */}
      {!destination && (
        <button
          onClick={() => { setSearchOpen(true); searchBarRef.current?.focus(); }}
          className={`search-trigger fixed left-1/2 z-[110] w-full max-w-md px-4${searchOpen ? " search-trigger-hidden" : ""}`}
          style={{ bottom: "env(safe-area-inset-bottom, 0px)", transform: "translateX(-50%)" }}
        >
          <div className="bg-white/85 backdrop-blur-xl rounded-2xl shadow-lg px-4 h-[52px] flex items-center gap-3">
            <Search size={16} className="text-ink-primary/50 shrink-0" />
            <span className="text-sm text-ink-primary/40">Hvor vil du reise?</span>
            <div
              className={`ml-auto shrink-0 w-2 h-2 rounded-full transition-colors ${
                userLocation ? "bg-emerald-500" : geoError ? "bg-red-400" : "bg-amber-400 animate-pulse"
              }`}
            />
          </div>
        </button>
      )}

      {/* Real search panel — top, hidden on mobile until trigger tapped */}
      {!destination && (
        <div className={`search-real fixed left-1/2 z-[110] w-full max-w-md px-4${searchOpen ? " search-real-open" : ""}`}>
          <div className="bg-white/85 backdrop-blur-xl rounded-2xl shadow-lg px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchBar
                  onSelect={handleDestinationSelect}
                  ref={searchBarRef}
                  onClear={handleClearDestination}
                  onClose={() => setSearchOpen(false)}
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
          {geoError && (
            <div className="mt-2 bg-red-50/90 backdrop-blur-xl rounded-xl px-3 py-2 shadow-lg">
              <p className="text-xs text-red-700">{geoError}</p>
            </div>
          )}
        </div>
      )}

      {/* Route header — shown when destination is set */}
      {destination && (
        <div
          ref={topCardRef}
          className="fixed left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4"
          style={{ top: "env(safe-area-inset-top, 0px)" }}
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
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-ink-primary/8 hover:bg-ink-primary/15 transition-colors"
                  aria-label="Fjern destinasjon"
                >
                  <span className="text-ink-primary/50 text-xl text-bold leading-none">×</span>
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
        centerOnUser={expandedRoute !== null}
        detailMinimized={routeDetailMinimized}
        walkRoute={walkRoute ?? undefined}
        userHeading={userHeading}
        onViewChange={handleViewChange}
        onStopClick={handleDestinationSelect}
        followPadding={followPadding}
      />

      {/* Route panel / detail */}
      {routes.length > 0 && expandedRoute === null && (
        <RoutePanel
          routes={routes}
          selectedIndex={selectedRoute}
          onSelect={handleRouteSelect}
          walkRoute={!loading ? (walkRoute ?? undefined) : undefined}
          onBoundsChange={handleBottomBoundsChange}
          excludeRail={excludeRail}
          onToggleExcludeRail={handleToggleExcludeRail}
        />
      )}
      {routes.length > 0 && expandedRoute !== null && (
        <RouteDetail
          trip={routes[expandedRoute] ?? routes[0]}
          destinationName={destination?.name ?? ""}
          onBack={() => setExpandedRoute(null)}
          onMinimizedChange={setRouteDetailMinimized}
          onBoundsChange={handleBottomBoundsChange}
        />
      )}

      {/* Walk-only: no transit routes — show walk + bike panel (only after transit search is done) */}
      {walkOnly && !loading && routes.length === 0 && destination && userLocation && (
        <div
          ref={walkPanelRef}
          className="fixed left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4 animate-in slide-in-from-bottom-4 fade-in duration-300"
          style={{ bottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-ink-primary/5 overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-3 pb-2 border-b border-ink-primary/5">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-ink-primary">Ingen kollektivruter</span>
                <span className="text-xs text-ink-primary/40">Egne ben gjelder</span>
              </div>
            </div>

            {(() => {
              const leg = walkRoute?.legs?.[0];
              const distM = leg?.distance ?? walkRoute?.walkDistance ?? 0;
              const walkDuration = leg ? formatDuration(leg.duration) : null;
              const bikeSeconds = distM > 0 ? Math.max(60, Math.round(distM / (15000 / 3600))) : null; // ~15 km/h
              const bikeDuration = bikeSeconds ? formatDuration(bikeSeconds) : null;
              const distKm = distM > 0 ? (distM / 1000).toFixed(1) : null;

              return (
                <>
                  {/* Walk row */}
                  <div className="px-4 py-3 border-b border-ink-primary/5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-ink-primary">
                          {walkDuration ?? "—"}
                        </span>
                        {distKm && (
                          <span className="text-xs text-ink-primary/50">{distKm} km</span>
                        )}
                      </div>
                    </div>
                    {/* Leg bar — dashed walk */}
                    <div className="h-3 rounded overflow-hidden mb-2">
                      <div
                        className="h-full w-full rounded"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(90deg, #9CA3AF 0px, #9CA3AF 4px, transparent 4px, transparent 8px)",
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold text-white bg-[#6B7280]">
                        🚶 Gange
                      </span>
                    </div>
                  </div>

                  {/* Bike row */}
                  {bikeDuration != null && (
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-ink-primary">
                            {bikeDuration}
                          </span>
                          {distKm && (
                            <span className="text-xs text-ink-primary/50">{distKm} km</span>
                          )}
                        </div>
                        <span className="text-[10px] text-ink-primary/35">estimert</span>
                      </div>
                      {/* Leg bar — solid teal for bike */}
                      <div className="h-3 rounded overflow-hidden mb-2 bg-[#0891b2]" />
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold text-white bg-[#0891b2]">
                          🚲 Sykkel
                        </span>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Boarding confirmation popup */}
      {boardingPrompt && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4 animate-in slide-in-from-bottom-2 fade-in duration-200"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
        >
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-ink-primary/8 px-4 py-3">
            <p className="text-sm text-ink-primary/70 mb-1">Er du på bussen?</p>
            <div className="flex items-center gap-2 mb-3">
              <span
                className="inline-flex px-2 py-0.5 rounded text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: getLegColor(boardingPrompt.leg) }}
              >
                {boardingPrompt.leg.line?.publicCode}
              </span>
              {boardingPrompt.leg.fromEstimatedCall?.destinationDisplay?.frontText && (
                <span className="text-sm font-medium text-ink-primary truncate">
                  {boardingPrompt.leg.fromEstimatedCall.destinationDisplay.frontText}
                </span>
              )}
              <span className="text-sm text-ink-primary/50 shrink-0 ml-auto">
                avg. {formatTime(boardingPrompt.leg.expectedStartTime)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const journeyId = boardingPrompt.leg.serviceJourney?.id;
                  if (journeyId) suppressedJourneysRef.current.add(journeyId);
                  setBoardingPrompt(null);
                }}
                className="flex-1 py-2 rounded-xl bg-ink-primary text-white text-sm font-medium"
              >
                Ja
              </button>
              <button
                onClick={() => {
                  const journeyId = boardingPrompt.leg.serviceJourney?.id;
                  if (journeyId) suppressedJourneysRef.current.add(journeyId);
                  setBoardingPrompt(null);
                  // Force recalculation by resetting last searched dest
                  lastSearchedDestRef.current = null;
                }}
                className="flex-1 py-2 rounded-xl bg-ink-primary/8 text-ink-primary/60 text-sm font-medium"
              >
                Nei
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay — only show if no routes found yet and not walk-only */}
      {loadingVisible && routes.length === 0 && !walkOnly && (
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
