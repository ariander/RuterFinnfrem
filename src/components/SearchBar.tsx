"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search } from "lucide-react";

const TRANSIT_BADGE: Record<string, { icon: string; color: string }> = {
  onstreetBus:   { icon: "/icons/bus.svg",   color: "#E60000" },
  busStation:    { icon: "/icons/bus.svg",   color: "#E60000" },
  onstreetTram:  { icon: "/icons/tram.svg",  color: "#0B91EF" },
  tramStation:   { icon: "/icons/tram.svg",  color: "#0B91EF" },
  metroStation:  { icon: "/icons/metro.svg", color: "#EC700C" },
  railStation:   { icon: "/icons/train.svg", color: "#003087" },
  ferryStop:     { icon: "/icons/boat.svg",  color: "#682C88" },
  harbourPort:   { icon: "/icons/boat.svg",  color: "#682C88" },
  airport:       { icon: "/icons/bus.svg",   color: "#003087" },
};

type CategoryIcon =
  | { type: "emoji"; value: string }
  | { type: "svg"; src: string };

const CATEGORY_ICON: Record<string, CategoryIcon> = {
  museum:           { type: "emoji", value: "🏛️" },
  cafe:             { type: "emoji", value: "☕" },
  restaurant:       { type: "emoji", value: "🍽️" },
  school:           { type: "emoji", value: "🎓" },
  place_of_worship: { type: "emoji", value: "⛪" },
  government:       { type: "emoji", value: "🏛️" },
  dentist:          { type: "emoji", value: "🦷" },
  hospital:         { type: "emoji", value: "🏥" },
  pharmacy:         { type: "emoji", value: "💊" },
  park:             { type: "emoji", value: "🌳" },
  airport:          { type: "emoji", value: "✈️" },
  street:           { type: "svg",   src: "/road.svg" },
  bydel:            { type: "emoji", value: "📍" },
};

function getStopBadge(categories: string[] | undefined) {
  if (!categories) return null;
  for (const cat of categories) {
    if (TRANSIT_BADGE[cat]) return TRANSIT_BADGE[cat];
  }
  return null;
}

function getCategoryIcon(categories: string[] | undefined): CategoryIcon | null {
  if (!categories) return null;
  for (const cat of categories) {
    if (CATEGORY_ICON[cat]) return CATEGORY_ICON[cat];
  }
  return null;
}

export interface SearchBarRef {
  focus: () => void;
}

interface SearchBarProps {
  onSelect: (location: { lat: number; lng: number; name: string }) => void;
  onClear?: () => void;
  onClose?: () => void;
}

export const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(function SearchBar({ onSelect, onClear, onClose }, ref) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const suppressSearch = useRef(false);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (suppressSearch.current) {
      suppressSearch.current = false;
      return;
    }

    if (query.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.entur.io/geocoder/v1/autocomplete?text=${encodeURIComponent(
            query
          )}&lang=no&layers=venue,stop,address`
        );
        const data = await res.json();
        const features = data.features || [];
        // Prioritize transit stops/stations at the top
        const sorted = [...features].sort((a: any, b: any) => {
          const aIsTransit = getStopBadge(a.properties.category) ? 0 : 1;
          const bIsTransit = getStopBadge(b.properties.category) ? 0 : 1;
          return aIsTransit - bIsTransit;
        });
        setResults(sorted);
        setIsOpen(sorted.length > 0);
        setHighlightedIndex(-1);
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        onClose?.();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function handleClear() {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
    onClear?.();
  }

  return (
    <div className="relative flex-1" ref={containerRef}>
      {/* Results — opens upward */}
      {isOpen && (
        <Card className="absolute top-full gap-1 mt-1 w-full bg-white shadow-2xl rounded-lg overflow-hidden border-none py-3 max-h-80 overflow-y-auto z-50">
          {results.map((res: any, idx: number) => {
            const stopBadge = getStopBadge(res.properties.category);
            const catIcon = !stopBadge ? getCategoryIcon(res.properties.category) : null;
            const isHighlighted = idx === highlightedIndex;

            return (
              <button
                key={res.properties.id}
                ref={(el) => { itemRefs.current[idx] = el; }}
                className={`w-full px-4 py-2 text-left transition-colors flex items-center gap-3 ${isHighlighted ? "bg-slate-100" : "hover:bg-slate-50"}`}
                onClick={() => {
                  const [lng, lat] = res.geometry.coordinates;
                  onSelect({ lat, lng, name: res.properties.name });
                  suppressSearch.current = true;
                  setQuery(res.properties.name);
                  setIsOpen(false);
                  setResults([]);
                  inputRef.current?.blur();
                }}
              >
                {stopBadge ? (
                  <span
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: stopBadge.color }}
                  >
                    <img src={stopBadge.icon} width={16} height={16} alt="" />
                  </span>
                ) : catIcon?.type === "emoji" ? (
                  <span className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-ink-primary/5 text-base leading-none">
                    {catIcon.value}
                  </span>
                ) : catIcon?.type === "svg" ? (
                  <span className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-ink-primary/5">
                    <img src={catIcon.src} width={16} height={16} alt="" className="opacity-60" />
                  </span>
                ) : (
                  <span className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-ink-primary/5">
                    <img src="/poi.svg" width={16} height={16} alt="" className="opacity-50" />
                  </span>
                )}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-medium text-ink-primary text-sm truncate">
                    {res.properties.name}
                  </span>
                  <span className="text-xs text-ink-primary/50 truncate">
                    {res.properties.locality || res.properties.county || res.properties.label}
                  </span>
                </div>
              </button>
            );
          })}
        </Card>
      )}

      {/* Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-primary opacity-50">
          <Search size={16} />
        </div>
        <Input
          ref={inputRef}
          placeholder="Hvor vil du reise?"
          className="h-10 pl-9 pr-9 bg-transparent border-none shadow-none rounded-xl text-sm focus-visible:ring-0 placeholder:text-ink-primary/40"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(results.length > 0)}
          onKeyDown={(e) => {
            if (!isOpen || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = Math.min(highlightedIndex + 1, results.length - 1);
              setHighlightedIndex(next);
              itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const prev = Math.max(highlightedIndex - 1, 0);
              setHighlightedIndex(prev);
              itemRefs.current[prev]?.scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter" && highlightedIndex >= 0) {
              e.preventDefault();
              itemRefs.current[highlightedIndex]?.click();
            } else if (e.key === "Escape") {
              setIsOpen(false);
              inputRef.current?.blur();
              onClose?.();
            }
          }}
        />
        {query.length > 0 && (
          <button
            onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center bg-ink-primary/8 hover:bg-ink-primary/15 transition-colors"
            aria-label="Tøm søk"
          >
            <img src="/cross.svg" width={14} height={14} alt="" className="opacity-50" />
          </button>
        )}
      </div>
    </div>
  );
});
