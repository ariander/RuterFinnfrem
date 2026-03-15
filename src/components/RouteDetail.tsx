"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronDown } from "lucide-react";
import type { TripPattern } from "@/lib/entur-trip";
import { getModeColor, formatTime, formatDuration, getModeName } from "@/lib/entur-trip";

interface RouteDetailProps {
  trip: TripPattern;
  destinationName: string;
  onBack: () => void;
}

function getActiveLegIndex(trip: TripPattern, now: number): number | null {
  for (let i = 0; i < trip.legs.length; i++) {
    const start = new Date(trip.legs[i].expectedStartTime).getTime();
    const end = new Date(trip.legs[i].expectedEndTime).getTime();
    if (now >= start && now <= end) return i;
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

export function RouteDetail({ trip, destinationName, onBack }: RouteDetailProps) {
  const [expandedLegs, setExpandedLegs] = useState<Set<number>>(new Set());
  const [minimized, setMinimized] = useState(false);
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

  const lastLeg = trip.legs[trip.legs.length - 1];

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
      className="fixed left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4 animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-ink-primary/5 overflow-hidden">
        {/* Header */}
        <div className="px-3 pt-3 pb-2.5 flex items-center gap-2 border-b border-ink-primary/5">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-ink-primary/5 hover:bg-ink-primary/10 transition-colors shrink-0"
          >
            <ChevronLeft size={18} className="text-ink-primary/70" />
          </button>
          {minimized ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
              {focusLeg?.mode === "foot" && (
                <span className="text-sm text-ink-primary/70 shrink-0">
                  🚶 {Math.round(focusLeg.duration / 60)} min
                </span>
              )}
              {nextTransitLeg && (
                <>
                  {focusLeg?.mode === "foot" && (
                    <span className="text-ink-primary/25 shrink-0 text-xs">→</span>
                  )}
                  <span
                    className="inline-flex px-1.5 py-0.5 rounded text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: getModeColor(nextTransitLeg.mode) }}
                  >
                    {nextTransitLeg.line?.publicCode || getModeName(nextTransitLeg.mode)}
                  </span>
                  <span className="text-sm text-ink-primary/70 truncate">
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

            {trip.legs.map((leg, i) => {
              const isWalk = leg.mode === "foot";
              const color = getModeColor(leg.mode);
              const isActive = i === activeLegIndex;
              const past = tripStarted && activeLegIndex !== null
                ? now > new Date(leg.expectedEndTime).getTime() && !isActive
                : false;
              const intermediates = leg.intermediateEstimatedCalls ?? [];
              const isExpanded = expandedLegs.has(i);
              const fromName = i === 0
                ? stopName(leg.fromPlace.name, "Min posisjon")
                : leg.fromPlace.name;

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

                    {/* Platform/track */}
                    {!isWalk && leg.fromPlace.quay?.publicCode && (
                      <div className="mb-1">
                        <span className="text-[11px] text-ink-primary/50 bg-ink-primary/5 px-1.5 py-0.5 rounded">
                          {platformLabel(leg.mode, leg.fromPlace.quay.publicCode)}
                        </span>
                      </div>
                    )}

                    {/* Walk */}
                    {isWalk && (
                      <div className="flex items-center gap-3 mb-1">
                        <div className="text-xs text-ink-primary/50 flex items-center gap-1.5">
                          <span>🚶</span>
                          <span>Gå {Math.round(leg.duration / 60)} min · {Math.round(leg.distance)} m</span>
                        </div>
                        <div className="text-xs text-ink-primary/30 flex items-center gap-1.5">
                          <span>🏃</span>
                          <span>Løp {Math.max(1, Math.round(leg.duration / 120))} min</span>
                        </div>
                      </div>
                    )}

                    {/* Transit */}
                    {!isWalk && (
                      <div className="mb-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className="inline-flex px-2 py-0.5 rounded text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {leg.line?.publicCode || getModeName(leg.mode)}
                          </span>
                          {leg.line?.name && (
                            <span className="text-xs text-ink-primary/50 truncate">
                              {leg.line.name}
                            </span>
                          )}
                          {isActive && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium shrink-0 ml-auto">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                              Pågår nå
                            </span>
                          )}
                        </div>

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
                    )}
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
      </div>
    </div>
  );
}
