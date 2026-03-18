"use client";

import { useRef, useEffect } from "react";
import type { TripPattern, Leg } from "@/lib/entur-trip";
import { getLegColor, formatTime, formatDuration, getModeName } from "@/lib/entur-trip";

const WALK_MAX_SECS = 900;  // 15 min
const BIKE_SPEED_MS = 15000 / 3600; // 15 km/h in m/s

interface RoutePanelProps {
  routes: TripPattern[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  walkRoute?: TripPattern;
  onBoundsChange?: (distFromViewportBottom: number) => void;
  excludeRail?: boolean;
  onToggleExcludeRail?: () => void;
}

function LegBar({ legs }: { legs: Leg[] }) {
  const totalDuration = legs.reduce((sum, l) => sum + l.duration, 0);
  if (totalDuration === 0) return null;

  return (
    <div className="flex items-center gap-0.5 h-3 w-full rounded overflow-hidden">
      {legs.map((leg, i) => {
        const pct = Math.max((leg.duration / totalDuration) * 100, 4);
        const color = getLegColor(leg);
        const isWalk = leg.mode === "foot";

        return (
          <div
            key={i}
            className="h-full rounded relative overflow-hidden"
            style={{
              flex: `${pct} 0 0`,
              backgroundColor: isWalk ? "transparent" : color,
            }}
          >
            {isWalk && (
              <div
                className="absolute inset-0 rounded"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, #9CA3AF 0px, #9CA3AF 3px, transparent 3px, transparent 6px)`,
                }}
              />
            )}
            {!isWalk && leg.line?.publicCode && pct > 10 && (
              <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-[9px] leading-none">
                {leg.line.publicCode}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LegSummary({ legs }: { legs: Leg[] }) {
  const transitLegs = legs.filter((l) => l.mode !== "foot");
  if (transitLegs.length === 0) return <span className="text-s text-ink-primary/60">Kun gange</span>;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {transitLegs.map((leg, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-ink-primary/30 text-sm">›</span>}
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold text-white"
            style={{ backgroundColor: getLegColor(leg) }}
          >
            {leg.line?.publicCode || getModeName(leg.mode)}
          </span>
          {leg.intermediateEstimatedCalls && leg.intermediateEstimatedCalls.length > 0 && (
            <span className="text-xs text-ink-primary/50">
              {leg.intermediateEstimatedCalls.length + 1} stopp
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function RealtimeBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Sanntid
    </span>
  );
}

export function RoutePanel({ routes, selectedIndex, onSelect, walkRoute, onBoundsChange, excludeRail, onToggleExcludeRail }: RoutePanelProps) {
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || !onBoundsChange) return;
    const update = () => onBoundsChange(window.innerHeight - el.getBoundingClientRect().top);
    const obs = new ResizeObserver(update);
    obs.observe(el);
    update();
    return () => obs.disconnect();
  }, [onBoundsChange]);

  if (routes.length === 0) return null;

  const hasRealtime = (trip: TripPattern) => trip.legs.some((l) => l.realtime);
  const hasRail = routes.some((t) => t.legs.some((l) => l.mode === "rail"));

  // Walk/bike alternatives — only show if ≤ 15 min
  const walkLeg = walkRoute?.legs?.[0];
  const distM = walkLeg?.distance ?? 0;
  const walkSecs = walkLeg?.duration ?? 0;
  const bikeSecs = distM > 0 ? Math.max(60, Math.round(distM / BIKE_SPEED_MS)) : 0;
  const showWalk = walkSecs > 0 && walkSecs <= WALK_MAX_SECS;
  const showBike = bikeSecs > 0 && bikeSecs <= WALK_MAX_SECS;

  return (
    <div
      ref={outerRef}
      className="fixed left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4 animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{ bottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-ink-primary/5 overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-primary">Reiseruter</h2>
            <div className="flex items-center gap-2">
              {(hasRail || excludeRail) && onToggleExcludeRail && (
                <button
                  onClick={onToggleExcludeRail}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                    excludeRail
                      ? "bg-ink-primary/8 border-ink-primary/20 text-ink-primary/50 line-through"
                      : "bg-[#003087]/8 border-[#003087]/20 text-[#003087]"
                  }`}
                >
                  <img src="/icons/train.svg" width={12} height={12} alt="" style={{ opacity: excludeRail ? 0.4 : 0.8 }} />
                  Tog
                </button>
              )}
              <span className="text-xs text-ink-primary/40">{routes.length} alternativer</span>
            </div>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {routes.map((trip, i) => {

            const isSelected = i === selectedIndex;
            const transfers = trip.legs.filter((l) => l.mode !== "foot").length - 1;

            return (
              <button
                key={i}
                onClick={() => onSelect(i)}
                className={`w-full px-4 py-3 text-left transition-colors border-t border-ink-primary/5 ${
                  isSelected
                    ? "bg-[#091AA9]/5"
                    : "hover:bg-ink-primary/[0.02] active:bg-ink-primary/5"
                }`}
              >
                {/* Top row: duration + time range */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${isSelected ? "text-[#091AA9]" : "text-ink-primary"}`}>
                      {formatDuration(trip.duration)}
                    </span>
                    {hasRealtime(trip) && <RealtimeBadge />}
                  </div>
                  <span className="text-sm text-ink-primary/60">
                    {formatTime(trip.startTime)} – {formatTime(trip.endTime)}
                  </span>
                </div>

                {/* Leg bar */}
                <div className="mb-2">
                  <LegBar legs={trip.legs} />
                </div>

                {/* Leg summary */}
                <div className="flex items-center justify-between">
                  <LegSummary legs={trip.legs} />
                  {transfers > 0 && (
                    <span className="text-xs text-ink-primary/40 shrink-0 ml-2">
                      {transfers} {transfers === 1 ? "bytte" : "bytter"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Walk / bike alternatives */}
          {(showWalk || showBike) && (
            <div className="border-t border-ink-primary/8">
              <div className="px-4 pt-2.5 pb-1">
                <span className="text-[11px] font-medium text-ink-primary/40 uppercase tracking-wide">Eller på egenhånd</span>
              </div>

              {showWalk && (
                <div className="px-4 py-2.5 border-t border-ink-primary/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-bold text-ink-primary">
                      {formatDuration(walkSecs)}
                    </span>
                    <span className="text-xs text-ink-primary/40">
                      {distM > 0 ? `${(distM / 1000).toFixed(1)} km` : ""}
                    </span>
                  </div>
                  <div className="h-3 rounded overflow-hidden mb-2">
                    <div
                      className="h-full w-full rounded"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(90deg, #9CA3AF 0px, #9CA3AF 4px, transparent 4px, transparent 8px)",
                      }}
                    />
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold text-white bg-[#6B7280]">
                    🚶 Gange
                  </span>
                </div>
              )}

              {showBike && (
                <div className="px-4 py-2.5 border-t border-ink-primary/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-bold text-ink-primary">
                      {formatDuration(bikeSecs)}
                    </span>
                    <div className="flex items-center gap-2">
                      {distM > 0 && (
                        <span className="text-xs text-ink-primary/40">
                          {(distM / 1000).toFixed(1)} km
                        </span>
                      )}
                      <span className="text-[10px] text-ink-primary/35">estimert</span>
                    </div>
                  </div>
                  <div className="h-3 rounded overflow-hidden mb-2 bg-[#0891b2]" />
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold text-white bg-[#0891b2]">
                    🚲 Sykkel
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
