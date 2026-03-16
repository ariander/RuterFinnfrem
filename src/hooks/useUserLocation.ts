import { useEffect, useState } from "react";

interface LatLng {
  lat: number;
  lng: number;
}

interface UserLocationState {
  userLocation: LatLng | null;
  userHeading: number | null;
  geoError: string | null;
}

export function useUserLocation(): UserLocationState {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation støttes ikke i denne nettleseren.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUserHeading(typeof pos.coords.heading === "number" && !isNaN(pos.coords.heading) ? pos.coords.heading : null);
        setGeoError(null);
      },
      (err) => {
        console.error("Geolocation error:", err);
        // Fallback til sentrum for utvikling/testing (Dronningens gate 40, Oslo)
        setUserLocation({ lat: 59.9125292, lng: 10.7489867 });
        setGeoError(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { userLocation, userHeading, geoError };
}

