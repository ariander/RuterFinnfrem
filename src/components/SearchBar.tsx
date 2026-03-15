"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search } from "lucide-react";

interface SearchBarProps {
  onSelect: (location: { lat: number; lng: number; name: string }) => void;
}

export function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
        setResults(data.features || []);
        setIsOpen(data.features?.length > 0);
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative flex-1" ref={containerRef}>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-primary opacity-50">
          <Search size={16} />
        </div>
        <Input
          ref={inputRef}
          placeholder="Hvor vil du reise?"
          className="h-10 pl-9 pr-3 bg-transparent border-none shadow-none rounded-xl text-sm focus-visible:ring-0 placeholder:text-ink-primary/40"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(results.length > 0)}
        />
      </div>

      {isOpen && (
        <Card className="absolute top-full gap-1 mt-0 w-full bg-white shadow-2xl rounded-lg overflow-hidden border-none py-3 max-h-96 overflow-y-auto z-50">
          {results.map((res: any) => {
            const layer = res.properties.layer;
            const isStop = layer === "stop";
            const isVenue = layer === "venue";
            return (
              <button
                key={res.properties.id}
                className="w-full px-4 py-2 text-left hover:bg-slate-50 transition-colors flex items-center gap-3"
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
                <span className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-ink-primary/5">
                  {isStop ? (
                    <img src="/public-transport.svg" width={16} height={16} alt="" />
                  ) : isVenue ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-primary/60">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-primary/60">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                  )}
                </span>
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
    </div>
  );
}
