"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronDown } from "lucide-react";
import type { TripPattern } from "@/lib/entur-trip";
import { getLegColor, formatTime, formatDuration, getModeName } from "@/lib/entur-trip";

interface RouteDetailProps {
  trip: TripPattern;
  destinationName: string;
  onBack: () => void;
  onMinimizedChange?: (minimized: boolean) => void;
  /** Real-time occupancy keyed by serviceJourneyId */
  occupancy?: Record<string, string>;
  /** Called with (window.innerHeight - panelTop) so the map can centre between cards */
  onBoundsChange?: (distFromViewportBottom: number) => void;
  /** User's current GPS position — used for proximity-based boarding hints */
  userLocation?: { lat: number; lng: number };
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function getActiveLegIndex(trip: TripPattern, now: number): number | null {
  for (let i = 0; i < trip.legs.length; i++) {
    const start = new Date(trip.legs[i].expectedStartTime).getTime();
    const end = new Date(trip.legs[i].expectedEndTime).getTime();
    // For transit legs add a 5-min buffer so a delayed bus doesn't prematurely flip to walking
    const buffer = trip.legs[i].mode !== "foot" ? 5 * 60 * 1000 : 0;
    if (now >= start && now <= end + buffer) return i;
  }
  return null;
}

function delayMinutes(aimed: string, expected: string): number {
  return Math.round((new Date(expected).getTime() - new Date(aimed).getTime()) / 60000);
}

function stopName(name: string, fallback: string): string {
  if (name === "Origin" || name === "origin") return fallback;
  if (name === "Destination" || name === "destination") return fallback;
  return name;
}

function occupancyInfo(status: string): { icon: string; label: string } | null {
  if (status === "EMPTY" || status === "MANY_SEATS_AVAILABLE")
    return { icon: "/Capacity_empty.svg", label: "God plass" };
  if (status === "FEW_SEATS_AVAILABLE")
    return { icon: "/Capacity_ok.svg", label: "Noen seter" };
  if (
    status === "STANDING_ROOM_ONLY" ||
    status === "CRUSHED_STANDING_ROOM_ONLY" ||
    status === "FULL" ||
    status === "NOT_ACCEPTING_PASSENGERS"
  ) return { icon: "/Capacity_full.svg", label: "Fullt" };
  return null;
}

export function RouteDetail({ trip, destinationName, onBack, onMinimizedChange, occupancy, onBoundsChange, userLocation }: RouteDetailProps) {
  const [expandedLegs, setExpandedLegs] = useState<Set<number>>(new Set());
  const [minimized, setMinimized] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onMinimizedChange?.(minimized);
  }, [minimized]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent of panel height so map can centre between cards
  useEffect(() => {
    const el = outerRef.current;
    if (!el || !onBoundsChange) return;
    const update = () => onBoundsChange(window.innerHeight - el.getBoundingClientRect().top);
    const obs = new ResizeObserver(update);
    obs.observe(el);
    update();
    return () => obs.disconnect();
  }, [onBoundsChange]);

  const [now, setNow] = useState(Date.now());
  const activeLegRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const activeLegIndex = getActiveLegIndex(trip, now);
  const tripStarted = now >= new Date(trip.startTime).getTime();

  // Scroll to active leg on open
  useEffect(() => {
    if (activeLegRef.current && scrollRef.current) {
      setTimeout(() => {
        activeLegRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 350); // wait for slide-in animation
    }
  }, [activeLegIndex]);

  function toggleLeg(i: number) {
    setExpandedLegs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // If the last leg is a short walk (≤100m) the destination is essentially at the stop — skip it
  const visibleLegs = trip.legs.filter((leg, i) =>
    !(i === trip.legs.length - 1 && leg.mode === "foot" && leg.distance <= 100)
  );
  const lastLeg = visibleLegs[visibleLegs.length - 1];

  // Collect all unique situations from legs (prefer Norwegian)
  const allSituations = trip.legs
    .flatMap((l) => l.situations ?? [])
    .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);

  function pickText(texts: { value: string; language: string }[]): string {
    return (
      texts.find((t) => t.language === "no")?.value ??
      texts.find((t) => t.language === "nb")?.value ??
      texts[0]?.value ??
      ""
    );
  }

  // What to show in minimized header
  const focusLegIndex = activeLegIndex !== null
    ? activeLegIndex
    : (() => {
        const idx = trip.legs.findIndex(l => now < new Date(l.expectedStartTime).getTime());
        return idx >= 0 ? idx : trip.legs.length - 1;
      })();
  const focusLeg = trip.legs[focusLegIndex];
  const nextTransitLeg = trip.legs.slice(focusLegIndex).find(l => l.mode !== "foot") ?? null;

  function platformLabel(mode: string, code: string) {
    return mode === "rail" || mode === "coach" ? `Spor ${code}` : `Perrong ${code}`;
  }

  return (
    <div
      ref={outerRef}
      className="fixed left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4 animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{ bottom: "-40px" }}
    >
      <div className="bg-white/90 backdrop-blur-xl rounded-t-2xl shadow-xl border border-ink-primary/5 overflow-hidden">
        {/* Header */}
        <div className="px-3 pt-3 pb-2.5 flex items-center gap-2 border-b border-ink-primary/5">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-ink-primary/5 hover:bg-ink-primary/10 transition-colors shrink-0"
          >
            <ChevronLeft size={18} className="text-ink-primary/70" />
          </button>
          {minimized ? (
            <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
              {focusLeg?.mode === "foot" && (
                <span className="text-sm text-ink-primary/70 shrink-0">
                  🚶 {Math.round(focusLeg.duration / 60)} m
                </span>
              )}
              {nextTransitLeg && (
                <>
                  {focusLeg?.mode === "foot" && (
                    <img src="/ArrowRight.svg" width={14} height={14} className="opacity-30 shrink-0" alt="→" />
                  )}
                  <span
                    className="inline-flex px-1.5 py-0.5 rounded text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: getLegColor(nextTransitLeg) }}
                  >
                    {nextTransitLeg.line?.publicCode || getModeName(nextTransitLeg.mode)}
                  </span>
                  {nextTransitLeg.fromEstimatedCall?.destinationDisplay?.frontText && (
                    <span className="text-sm font-medium text-ink-primary truncate">
                      {nextTransitLeg.fromEstimatedCall.destinationDisplay.frontText}
                    </span>
                  )}
                  <span className="text-sm text-ink-primary/70 shrink-0">
                    {formatTime(nextTransitLeg.expectedStartTime)}
                    {nextTransitLeg.fromPlace.quay?.publicCode &&
                      ` · ${platformLabel(nextTransitLeg.mode, nextTransitLeg.fromPlace.quay.publicCode)}`}
                  </span>
                </>
              )}
              {!nextTransitLeg && focusLeg && (
                <span className="text-sm text-ink-primary/50 truncate">
                  {formatTime(trip.endTime)}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-semibold text-ink-primary">{formatDuration(trip.duration)}</span>
              <span className="text-ink-primary/50 text-sm shrink-0">
                {formatTime(trip.startTime)} – {formatTime(trip.endTime)}
              </span>
            </div>
          )}
          <button
            onClick={() => setMinimized((m) => !m)}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-ink-primary/5 hover:bg-ink-primary/10 transition-colors shrink-0"
            aria-label={minimized ? "Vis rute" : "Minimer"}
          >
            <ChevronDown
              size={18}
              className="text-ink-primary/70 transition-transform duration-300"
              style={{ transform: minimized ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
        </div>

        {/* Disruption alerts */}
        {allSituations.length > 0 && !minimized && (
          <div className="border-b border-amber-200/80">
            {allSituations.map((s) => {
              const summary = pickText(s.summary);
              const description = pickText(s.description);
              return (
                <div
                  key={s.id}
                  className="flex gap-2.5 px-3 py-2.5 bg-amber-50/90"
                >
                  <img src="/warning.svg" width={18} height={18} className="shrink-0 mt-0.5 opacity-80" alt="" />
                  <div className="flex-1 min-w-0">
                    {summary && (
                      <p className="text-xs font-semibold leading-snug" style={{ color: "#313663" }}>
                        {summary}
                      </p>
                    )}
                    {description && description !== summary && (
                      <p className="text-xs leading-snug mt-0.5" style={{ color: "#313663", opacity: 0.75 }}>
                        {description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Timeline */}
        <div
          ref={scrollRef}
          className="overflow-y-auto transition-all duration-300 ease-in-out"
          style={{ maxHeight: minimized ? "0px" : "60vh" }}
        >
          <div className="px-4 py-3">

            {/* User position row at top (if trip is ongoing) */}
            {tripStarted && activeLegIndex !== null && (
              <div className="flex gap-3 mb-0">
                <div className="flex flex-col items-center w-5 shrink-0 pt-0.5">
                  <div className="w-3 h-3 rounded-full bg-[#4285F4] border-2 border-white shadow-sm z-20 ring-2 ring-[#4285F4]/30" />
                  <div className="w-0.5 flex-1 my-0.5 bg-ink-primary/10 min-h-[8px]" />
                </div>
                <div className="flex-1 pb-2 min-w-0">
                  <span className="text-xs font-medium text-[#4285F4]">Min posisjon</span>
                </div>
              </div>
            )}

            {visibleLegs.map((leg, i) => {
              const isWalk = leg.mode === "foot";
              const color = getLegColor(leg);
              const isActive = i === activeLegIndex;
              const past = tripStarted && activeLegIndex !== null
                ? now > new Date(leg.expectedEndTime).getTime() && !isActive
                : false;
              // Show past-departure notice when trip hasn't started and departure is >1 min ago
              const depTime = new Date(leg.expectedStartTime).getTime();
              const departurePassed = !tripStarted && now > depTime + 60_000;
              const intermediates = leg.intermediateEstimatedCalls ?? [];
              const isExpanded = expandedLegs.has(i);
              const fromName = i === 0
                ? stopName(leg.fromPlace.name, "Min posisjon")
                : leg.fromPlace.name;

              // Kort gå-ben på samme holdeplass → behandles som overgang
              const sameStop = leg.fromPlace.name === leg.toPlace.name;
              const shortDistance = leg.distance <= 75; // terskel for å kalle det overgang
              const isTransfer = isWalk && sameStop && shortDistance;

              // Brukeren er nær neste transportmiddel → vis "gå på buss X" i stedet for gangtid
              const nextLeg = trip.legs[i + 1];
              const isNearTransit =
                isWalk &&
                !isTransfer &&
                nextLeg &&
                nextLeg.mode !== "foot" &&
                userLocation != null &&
                haversineM(userLocation, {
                  lat: nextLeg.fromPlace.latitude,
                  lng: nextLeg.fromPlace.longitude,
                }) < 50;

              // Delay for departure
              const depDelay = delayMinutes(leg.aimedStartTime, leg.expectedStartTime);

              // Progress within active leg (0–1)
              const legStart = new Date(leg.expectedStartTime).getTime();
              const legEnd = new Date(leg.expectedEndTime).getTime();
              const legProgress = isActive
                ? Math.min(1, Math.max(0, (now - legStart) / (legEnd - legStart)))
                : 0;

              return (
                <div
                  key={i}
                  ref={isActive ? activeLegRef : null}
                  className={`flex gap-3 transition-opacity ${past ? "opacity-30" : ""}`}
                >
                  {/* Timeline spine */}
                  <div className="flex flex-col items-center w-5 shrink-0 pt-0.5">
                    <div
                      className="w-3 h-3 rounded-full border-2 border-white shadow-sm shrink-0 z-10"
                      style={{ backgroundColor: isWalk ? "#D1D5DB" : color }}
                    />
                    {isActive ? (
                      /* Progress bar: filled portion + remaining */
                      <div className="flex-1 my-0.5 min-h-[28px] w-[2px] relative overflow-hidden rounded-full"
                        style={{ backgroundColor: isWalk ? "#D1D5DB" : `${color}40` }}
                      >
                        <div
                          className="absolute top-0 left-0 w-full rounded-full"
                          style={{
                            height: `${legProgress * 100}%`,
                            backgroundColor: isWalk ? "#6B7280" : color,
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className="flex-1 my-0.5 min-h-[28px]"
                        style={
                          isWalk
                            ? {
                                width: "2px",
                                backgroundImage:
                                  "repeating-linear-gradient(to bottom, #9CA3AF 0px, #9CA3AF 4px, transparent 4px, transparent 8px)",
                              }
                            : { width: "2px", backgroundColor: color }
                        }
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-3 min-w-0">
                    {/* From stop + time */}
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-medium text-ink-primary leading-tight truncate">
                        {fromName}
                      </span>
                      <div className="flex items-baseline gap-1.5 ml-2 shrink-0">
                        {depDelay > 1 && (
                          <span className="text-[10px] text-red-500 font-medium">
                            +{depDelay} min
                          </span>
                        )}
                        <span className={`text-xs ${depDelay > 1 ? "text-ink-primary/30 line-through" : "text-ink-primary/50"}`}>
                          {formatTime(leg.aimedStartTime)}
                        </span>
                        {depDelay > 1 && (
                          <span className="text-xs text-red-500">
                            {formatTime(leg.expectedStartTime)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Walk / overgang */}
                    {isWalk && (
                      <div className="flex items-center gap-3 mb-1">
                        {isNearTransit && nextLeg ? (
                          <div className="text-xs font-medium flex items-center gap-1.5">
                            <span
                              className="inline-flex px-2 py-0.5 rounded text-xs font-bold text-white shrink-0"
                              style={{ backgroundColor: getLegColor(nextLeg) }}
                            >
                              {nextLeg.line?.publicCode || getModeName(nextLeg.mode)}
                            </span>
                            <span className="text-ink-primary/70">
                              {nextLeg.fromEstimatedCall?.destinationDisplay?.frontText
                                ? `mot ${nextLeg.fromEstimatedCall.destinationDisplay.frontText}`
                                : "gå på nå"}
                            </span>
                          </div>
                        ) : isTransfer ? (
                          <>
                            <div className="text-xs text-ink-primary/60 flex items-center gap-1.5">
                              <img src="/Platform.svg" width={14} height={14} alt="" className="opacity-70" />
                              <span>Overgang</span>
                            </div>
                            {leg.fromPlace.quay?.publicCode && leg.toPlace.quay?.publicCode && (
                              <div className="text-[11px] text-ink-primary/60 bg-ink-primary/5 px-1.5 py-0.5 rounded inline-flex items-center gap-1.5">
                                <span>{platformLabel(leg.mode, leg.fromPlace.quay.publicCode)}</span>
                                <img src="/ArrowRight.svg" width={12} height={12} alt="" className="opacity-50" />
                                <span>{platformLabel(leg.mode, leg.toPlace.quay.publicCode)}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="text-xs text-ink-primary/50 flex items-center gap-1.5">
                              <span>🚶</span>
                              <span>Gå {Math.round(leg.duration / 60)} min · {Math.round(leg.distance)} m</span>
                            </div>
                            <div className="text-xs text-ink-primary/30 flex items-center gap-1.5">
                              <span>🏃</span>
                              <span>Løp {Math.max(1, Math.round(leg.duration / 120))} min</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Transit */}
                    {!isWalk && (() => {
                      const occStatus =
                        leg.occupancy ??
                        (leg.serviceJourney?.id ? occupancy?.[leg.serviceJourney.id] : undefined);
                      const occInfo = occStatus ? occupancyInfo(occStatus) : null;
                      return (
                      <div className="mb-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className="inline-flex px-2 py-0.5 rounded text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {leg.line?.publicCode || getModeName(leg.mode)}
                          </span>
                          {leg.fromEstimatedCall?.destinationDisplay?.frontText && (
                            <span className="text-sm font-medium text-ink-primary truncate">
                              {leg.fromEstimatedCall.destinationDisplay.frontText}
                            </span>
                          )}
                          {leg.fromPlace.quay?.publicCode && (
                            <span className="text-[11px] text-ink-primary/70 bg-ink-primary/5 px-1.5 py-0.5 rounded shrink-0">
                              {platformLabel(leg.mode, leg.fromPlace.quay.publicCode)}
                            </span>
                          )}
                          {isActive && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium shrink-0 ml-auto">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                              Pågår nå
                            </span>
                          )}
                        </div>
                        {departurePassed && (
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-[10px] text-amber-600 font-medium">⚠ Avgangen kan ha gått</span>
                          </div>
                        )}
                        {occInfo && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <img src={occInfo.icon} width={13} height={13} alt="" className="opacity-70" />
                            <span className="text-[11px]" style={{ color: "#313663", opacity: 0.6 }}>{occInfo.label}</span>
                          </div>
                        )}

                        {intermediates.length > 0 && (
                          <button
                            onClick={() => toggleLeg(i)}
                            className="text-xs text-ink-primary/40 hover:text-ink-primary/60 transition-colors flex items-center gap-1 py-0.5"
                          >
                            <span
                              className="inline-block transition-transform"
                              style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                            >
                              ▾
                            </span>
                            {intermediates.length + 1} stopp
                          </button>
                        )}

                        <div
                          className="grid transition-all duration-300 ease-in-out"
                          style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
                        >
                          <div className="overflow-hidden">
                          <div className="mt-1 flex flex-col">
                            {intermediates.map((call, j) => {
                              const callDelay = delayMinutes(
                                call.aimedDepartureTime,
                                call.expectedDepartureTime,
                              );
                              return (
                                <div
                                  key={j}
                                  className="flex items-baseline justify-between py-1 pl-3 border-l-2"
                                  style={{ borderColor: color }}
                                >
                                  <span className="text-xs text-ink-primary/60 truncate">
                                    {call.quay.name}
                                  </span>
                                  <div className="flex items-baseline gap-1.5 ml-2 shrink-0">
                                    {callDelay > 1 && (
                                      <span className="text-[10px] text-red-500 font-medium">
                                        +{callDelay} min
                                      </span>
                                    )}
                                    <span
                                      className={`text-xs ${callDelay > 1 ? "text-ink-primary/30 line-through" : "text-ink-primary/40"}`}
                                    >
                                      {formatTime(call.aimedDepartureTime)}
                                    </span>
                                    {callDelay > 1 && (
                                      <span className="text-xs text-red-500">
                                        {formatTime(call.expectedDepartureTime)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          </div>
                        </div>
                      </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}

            {/* Final destination */}
            <div className="flex gap-3">
              <div className="w-5 shrink-0 flex items-start justify-center pt-0.5">
                <div className="w-3 h-3 rounded-full bg-[#E60000] border-2 border-white shadow-sm" />
              </div>
              <div className="flex items-baseline justify-between flex-1 pb-2 min-w-0">
                <span className="text-sm font-medium text-ink-primary truncate">
                  {stopName(lastLeg.toPlace.name, destinationName)}
                </span>
                <span className="text-xs text-ink-primary/50 ml-2 shrink-0">
                  {formatTime(lastLeg.expectedEndTime)}
                </span>
              </div>
            </div>

          </div>
        </div>
        {/* Safe-area spacer — keeps content above home indicator, card background fills behind it */}
        <div style={{ height: "40px" }} />
      </div>
    </div>
  );
}
