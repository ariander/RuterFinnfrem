"use client";

import { useState, useEffect, useCallback } from "react";
import { MapView } from "@/components/Map";
import { SearchBar } from "@/components/SearchBar";
import { TimeSelector } from "@/components/TimeSelector";
import { getIsochrone } from "@/lib/targomo";
import Image from "next/image";

export default function Home() {
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [transitTime, setTransitTime] = useState(10);
  const [walkTime, setWalkTime] = useState(5);
  const [isochrone, setIsochrone] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchIsochrone = useCallback(async (lat: number, lng: number, transit: number, walk: number) => {
    setLoading(true);
    try {
      const data = await getIsochrone(lat, lng, transit, walk);
      setIsochrone(data);
    } catch (err) {
      console.error("Fetch isochrone error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location) {
      fetchIsochrone(location.lat, location.lng, transitTime, walkTime);
    }
  }, [location, transitTime, walkTime, fetchIsochrone]);

  const handleTransitChange = (val: string) => setTransitTime(parseInt(val));
  const handleWalkChange = (val: string) => setWalkTime(parseInt(val));
  const handleMapClick = (lat: number, lng: number) => setLocation({ lat, lng, name: "" });

  return (
    <main className="relative w-full h-screen overflow-hidden bg-slate-50">
      {/* Top panel: logo + search + time selectors */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg px-3 py-2.5">
          {/* Row 1: Logo + Search */}
          <div className="flex items-center gap-3">
            <Image src="/reisetid-logo.svg" alt="Reisetid" width={96} height={96} className="shrink-0" />
            <SearchBar onSelect={setLocation} />
          </div>

          {/* Divider */}
          <div className="h-px bg-ink-primary/10 mx-1 my-2" />

          {/* Row 2: Time selectors */}
          <TimeSelector
            transitTime={transitTime}
            walkTime={walkTime}
            onTransitChange={handleTransitChange}
            onWalkChange={handleWalkChange}
          />
        </div>
      </div>

      {/* Map */}
      <MapView
        center={location || undefined}
        isochrone={isochrone}
        onMapClick={handleMapClick}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px] z-[100] flex items-center justify-center">
          <div className="bg-white p-5 rounded-2xl shadow-2xl flex items-center gap-3">
            <div className="w-5 h-5 border-3 border-ink-primary border-t-transparent rounded-full animate-spin" />
            <span className="font-medium text-ink-primary text-sm">Beregner reisetid...</span>
          </div>
        </div>
      )}
    </main>
  );
}
