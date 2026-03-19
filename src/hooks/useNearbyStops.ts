import { useCallback, useEffect, useRef, useState } from "react";
import { getNearbyStops, type Stop } from "@/lib/entur-stops";

interface LatLng {
  lat: number;
  lng: number;
}

function haversineDist(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function useNearbyStops(userLocation: LatLng | null) {
  const [stops, setStops] = useState<Stop[]>([]);

  const stopsCacheRef = useRef<Map<string, Stop>>(new Map());
  const lastStopFetchPosRef = useRef<LatLng | null>(null);
  const lastViewFetchPosRef = useRef<LatLng | null>(null);

  useEffect(() => {
    if (!userLocation) return;
    const last = lastStopFetchPosRef.current;
    if (last && haversineDist(last, userLocation) < 500) return;
    lastStopFetchPosRef.current = userLocation;
    getNearbyStops(userLocation.lat, userLocation.lng, 15000)
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
      .catch((err) => {
        console.error(err);
        // Reset so next GPS update triggers a retry
        lastStopFetchPosRef.current = null;
      });
  }, [userLocation]);

  const handleViewChange = useCallback((lat: number, lng: number) => {
    const last = lastViewFetchPosRef.current;
    const current = { lat, lng };
    if (last && haversineDist(last, current) < 3000) return;
    lastViewFetchPosRef.current = current;
    getNearbyStops(lat, lng, 10000)
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
      .catch((err) => {
        console.error(err);
        lastViewFetchPosRef.current = null;
      });
  }, []);

  return { stops, handleViewChange };
}

