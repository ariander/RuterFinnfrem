"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Stop } from "@/lib/entur-stops";
import type { TripPattern } from "@/lib/entur-trip";
import { getModeColor } from "@/lib/entur-trip";
import { decodePolyline } from "@/lib/polyline";

interface MapViewProps {
  userLocation?: { lat: number; lng: number };
  destination?: { lat: number; lng: number; name: string };
  routes?: TripPattern[];
  selectedRouteIndex?: number;
  stops?: Stop[];
  onMapClick?: (lat: number, lng: number) => void;
  onViewChange?: (lat: number, lng: number) => void;
}

const STOP_COLORS: Record<string, string> = {
  metro: "#EC700C",
  tram: "#0B91EF",
  bus: "#E60000",
  coach: "#75A300",
  water: "#682C88",
  rail: "#003087",
};

const BADGE_OFFSET = 22;


/** Build GeoJSON for a trip pattern's legs */
function routeToGeoJSON(
  trip: TripPattern,
  opts: { opacity: number; width: number },
) {
  const features: GeoJSON.Feature[] = [];
  for (const leg of trip.legs) {
    if (!leg.pointsOnLink?.points) continue;
    const coords = decodePolyline(leg.pointsOnLink.points);
    if (coords.length < 2) continue;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {
        mode: leg.mode,
        color: getModeColor(leg.mode),
        isWalk: leg.mode === "foot",
        lineCode: leg.line?.publicCode ?? "",
        opacity: opts.opacity,
        width: opts.width,
      },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

/** Compute bounding box from all coordinates in a trip */
function tripBounds(trip: TripPattern): maplibre.LngLatBoundsLike | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let hasCoords = false;
  for (const leg of trip.legs) {
    if (!leg.pointsOnLink?.points) continue;
    for (const [lng, lat] of decodePolyline(leg.pointsOnLink.points)) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
      hasCoords = true;
    }
  }
  if (!hasCoords) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function MapView({
  userLocation,
  destination,
  routes,
  selectedRouteIndex = 0,
  stops,
  onMapClick,
  onViewChange,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibre.Map | null>(null);
  const mapLoaded = useRef(false);
  const userMarker = useRef<maplibre.Marker | null>(null);
  const destMarker = useRef<maplibre.Marker | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  // Track previous route bounds to avoid re-fitting on every render
  const lastFitKey = useRef("");

  const createUserMarker = useCallback((lng: number, lat: number) => {
    if (!map.current) return;
    if (userMarker.current) {
      userMarker.current.setLngLat([lng, lat]);
      return;
    }
    const el = document.createElement("div");
    el.className = "user-location-marker";
    el.innerHTML = `
      <div class="user-location-pulse"></div>
      <div class="user-location-dot"></div>
    `;
    userMarker.current = new maplibre.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map.current);
  }, []);

  const createDestMarker = useCallback((lng: number, lat: number) => {
    if (!map.current) return;
    if (destMarker.current) {
      destMarker.current.setLngLat([lng, lat]);
      return;
    }
    const el = document.createElement("div");
    el.innerHTML = `<img src="/pin.svg" width="40" height="40" alt="pin" style="transform: translateY(-50%);" />`;
    destMarker.current = new maplibre.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map.current);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;
    let destroyed = false;

    fetch("https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json")
      .then((r) => r.json())
      .then((voyagerStyle) => {
        if (destroyed || !mapContainer.current) return;
        voyagerStyle.glyphs = "/api/fonts/{fontstack}/{range}.pbf";

        map.current = new maplibre.Map({
          container: mapContainer.current,
          style: voyagerStyle,
          center: [10.7522, 59.9139],
          zoom: 12,
        });

        const fireViewChange = () => {
          const c = map.current?.getCenter();
          if (c) onViewChangeRef.current?.(c.lat, c.lng);
        };

        // ── Badge image helpers ──────────────────────────────────────
        function loadImg(url: string): Promise<HTMLImageElement> {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
          });
        }

        async function createBadge(
          svgUrl: string,
          color: string,
        ): Promise<ImageData> {
          const S = 56,
            RECT = 40,
            RAD = 10,
            STROKE = 3,
            ICON = 24;
          const canvas = document.createElement("canvas");
          canvas.width = S;
          canvas.height = S;
          const ctx = canvas.getContext("2d")!;
          const x = (S - RECT) / 2;
          const y = (S - RECT) / 2 - 1;

          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.3)";
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 3;
          ctx.beginPath();
          ctx.roundRect(x, y, RECT, RECT, RAD);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.restore();

          ctx.beginPath();
          ctx.roundRect(x, y, RECT, RECT, RAD);
          ctx.fillStyle = color;
          ctx.fill();

          ctx.beginPath();
          ctx.roundRect(x, y, RECT, RECT, RAD);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = STROKE;
          ctx.stroke();

          const icon = await loadImg(svgUrl);
          ctx.drawImage(icon, (S - ICON) / 2, y + (RECT - ICON) / 2, ICON, ICON);
          return ctx.getImageData(0, 0, S, S);
        }

        map.current.on("load", async () => {
          mapLoaded.current = true;
          requestAnimationFrame(() => map.current?.resize());

          // Badge images
          const badges: [string, string, string][] = [
            ["stop-metro", "/icons/metro.svg", STOP_COLORS.metro],
            ["stop-tram", "/icons/tram.svg", STOP_COLORS.tram],
            ["stop-bus", "/icons/bus.svg", STOP_COLORS.bus],
            ["stop-coach", "/icons/bus.svg", STOP_COLORS.coach],
            ["stop-train", "/icons/train.svg", STOP_COLORS.rail],
            ["stop-boat", "/icons/boat.svg", STOP_COLORS.water],
          ];
          await Promise.all(
            badges.map(([id, url, color]) =>
              createBadge(url, color)
                .then((imgData) => {
                  if (map.current && !map.current.hasImage(id))
                    map.current.addImage(id, imgData, { pixelRatio: 2 });
                })
                .catch(() => {}),
            ),
          );

          // ── Route sources & layers ─────────────────────────────────
          const emptyFC = { type: "FeatureCollection" as const, features: [] };

          map.current?.addSource("route-alternatives", {
            type: "geojson",
            data: emptyFC,
          });
          map.current?.addLayer({
            id: "route-alt-line",
            type: "line",
            source: "route-alternatives",
            paint: {
              "line-color": "#9CA3AF",
              "line-width": 4,
              "line-opacity": 0.4,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });

          map.current?.addSource("route-selected-walk", {
            type: "geojson",
            data: emptyFC,
          });
          map.current?.addLayer({
            id: "route-walk-line",
            type: "line",
            source: "route-selected-walk",
            paint: {
              "line-color": "#6B7280",
              "line-width": 4,
              "line-dasharray": [2, 3],
              "line-opacity": 0.8,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });

          map.current?.addSource("route-selected-transit", {
            type: "geojson",
            data: emptyFC,
          });
          map.current?.addLayer({
            id: "route-transit-outline",
            type: "line",
            source: "route-selected-transit",
            paint: {
              "line-color": "#ffffff",
              "line-width": 8,
              "line-opacity": 0.9,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
          map.current?.addLayer({
            id: "route-transit-line",
            type: "line",
            source: "route-selected-transit",
            paint: {
              "line-color": ["get", "color"],
              "line-width": 5,
              "line-opacity": 1,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });

          // Transfer dots
          map.current?.addSource("route-transfers", {
            type: "geojson",
            data: emptyFC,
          });
          map.current?.addLayer({
            id: "route-transfer-dots",
            type: "circle",
            source: "route-transfers",
            paint: {
              "circle-color": "#ffffff",
              "circle-radius": 6,
              "circle-stroke-color": ["get", "color"],
              "circle-stroke-width": 3,
            },
          });

          // ── Stops sources ──────────────────────────
          map.current?.addSource("stops", {
            type: "geojson",
            data: emptyFC,
          });
          map.current?.addSource("stops-dots-src", {
            type: "geojson",
            data: emptyFC,
          });

          // Dots at low zoom levels (< 12)
          // One layer per modeCount/modeIndex with pixel-based circle-translate
          // so separation stays consistent at all zoom levels
          const DOT_CONFIGS: { modeCount: number; modeIndex: number; translate: [number, number] }[] = [
            { modeCount: 1, modeIndex: 0, translate: [0, 0] },
            { modeCount: 2, modeIndex: 0, translate: [-4, 0] },
            { modeCount: 2, modeIndex: 1, translate: [4, 0] },
            { modeCount: 3, modeIndex: 0, translate: [-5, -3] },
            { modeCount: 3, modeIndex: 1, translate: [0, 5] },
            { modeCount: 3, modeIndex: 2, translate: [5, -3] },
          ];
          for (const { modeCount, modeIndex, translate } of DOT_CONFIGS) {
            map.current?.addLayer({
              id: `stops-dot-${modeCount}-${modeIndex}`,
              type: "circle",
              source: "stops-dots-src",
              minzoom: 9,
              maxzoom: 12,
              filter: ["all",
                ["==", ["get", "modeCount"], modeCount],
                ["==", ["get", "modeIndex"], modeIndex],
              ],
              paint: {
                "circle-radius": 5,
                "circle-color": ["get", "color"],
                "circle-opacity": 1,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.5,
                "circle-translate": translate,
              },
            });
          }

          map.current?.addLayer({
            id: "stops-badge",
            type: "symbol",
            source: "stops",
            minzoom: 12,
            filter: ["!", ["has", "point_count"]],
            layout: {
              "icon-image": [
                "match",
                ["get", "mode"],
                "metro",
                "stop-metro",
                "tram",
                "stop-tram",
                "bus",
                "stop-bus",
                "coach",
                "stop-coach",
                "rail",
                "stop-train",
                "water",
                "stop-boat",
                "stop-bus",
              ],
              "icon-size": 1,
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-offset": [
                "case",
                ["==", ["get", "modeCount"], 1],
                ["literal", [0, 0]],
                [
                  "all",
                  ["==", ["get", "modeCount"], 2],
                  ["==", ["get", "modeIndex"], 0],
                ],
                ["literal", [-BADGE_OFFSET / 2, 0]],
                [
                  "all",
                  ["==", ["get", "modeCount"], 2],
                  ["==", ["get", "modeIndex"], 1],
                ],
                ["literal", [BADGE_OFFSET / 2, 0]],
                [
                  "all",
                  ["==", ["get", "modeCount"], 3],
                  ["==", ["get", "modeIndex"], 0],
                ],
                ["literal", [-BADGE_OFFSET, 0]],
                [
                  "all",
                  ["==", ["get", "modeCount"], 3],
                  ["==", ["get", "modeIndex"], 1],
                ],
                ["literal", [0, 0]],
                [
                  "all",
                  ["==", ["get", "modeCount"], 3],
                  ["==", ["get", "modeIndex"], 2],
                ],
                ["literal", [BADGE_OFFSET, 0]],
                ["literal", [0, 0]],
              ] as any,
              "symbol-sort-key": ["get", "modeIndex"],
            },
          });

          map.current?.addLayer({
            id: "stops-label",
            type: "symbol",
            source: "stops",
            filter: [
              "all",
              ["!", ["has", "point_count"]],
              ["==", ["get", "modeIndex"], 0],
            ],
            minzoom: 13,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["TID UI Regular"],
              "text-size": 10,
              "text-offset": [0, 1.2],
              "text-anchor": "top",
              "text-max-width": 8,
            },
            paint: {
              "text-color": "#333333",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
            },
          });

          fireViewChange();
        });

        map.current.on("moveend", fireViewChange);
      });

    return () => {
      destroyed = true;
      map.current?.remove();
    };
  }, []);

  // Update user location marker
  useEffect(() => {
    if (!map.current || !userLocation) return;
    createUserMarker(userLocation.lng, userLocation.lat);
  }, [userLocation, createUserMarker]);

  // Update destination marker
  useEffect(() => {
    if (!map.current || !destination) return;
    createDestMarker(destination.lng, destination.lat);
  }, [destination, createDestMarker]);

  // Fly to user location on first fix
  const hasFlownToUser = useRef(false);
  useEffect(() => {
    if (!map.current || !userLocation || hasFlownToUser.current) return;
    hasFlownToUser.current = true;
    map.current.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 14,
      essential: true,
    });
  }, [userLocation]);

  // Update route layers
  useEffect(() => {
    if (!map.current || !mapLoaded.current) return;

    const altSource = map.current.getSource("route-alternatives") as maplibre.GeoJSONSource;
    const walkSource = map.current.getSource("route-selected-walk") as maplibre.GeoJSONSource;
    const transitSource = map.current.getSource("route-selected-transit") as maplibre.GeoJSONSource;
    const transferSource = map.current.getSource("route-transfers") as maplibre.GeoJSONSource;
    if (!altSource || !walkSource || !transitSource || !transferSource) return;

    const emptyFC = { type: "FeatureCollection" as const, features: [] };

    if (!routes || routes.length === 0) {
      altSource.setData(emptyFC);
      walkSource.setData(emptyFC);
      transitSource.setData(emptyFC);
      transferSource.setData(emptyFC);
      return;
    }

    // Selected route
    const selected = routes[selectedRouteIndex] ?? routes[0];
    const selectedGeo = routeToGeoJSON(selected, { opacity: 1, width: 5 });

    const walkFeatures = selectedGeo.features.filter(
      (f) => f.properties?.isWalk,
    );
    const transitFeatures = selectedGeo.features.filter(
      (f) => !f.properties?.isWalk,
    );

    walkSource.setData({ type: "FeatureCollection", features: walkFeatures });
    transitSource.setData({ type: "FeatureCollection", features: transitFeatures });

    // Transfer points (where you board/alight transit)
    const transfers: GeoJSON.Feature[] = [];
    for (const leg of selected.legs) {
      if (leg.mode === "foot") continue;
      const startCoords = leg.pointsOnLink?.points
        ? decodePolyline(leg.pointsOnLink.points)[0]
        : null;
      const endCoords = leg.pointsOnLink?.points
        ? decodePolyline(leg.pointsOnLink.points).at(-1)
        : null;
      if (startCoords) {
        transfers.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: startCoords },
          properties: { color: getModeColor(leg.mode) },
        });
      }
      if (endCoords) {
        transfers.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: endCoords },
          properties: { color: getModeColor(leg.mode) },
        });
      }
    }
    transferSource.setData({ type: "FeatureCollection", features: transfers });

    // Alternative routes
    const altFeatures: GeoJSON.Feature[] = [];
    routes.forEach((trip, i) => {
      if (i === selectedRouteIndex) return;
      const geo = routeToGeoJSON(trip, { opacity: 0.4, width: 4 });
      altFeatures.push(...geo.features);
    });
    altSource.setData({ type: "FeatureCollection", features: altFeatures });

    // Fit map to selected route bounds
    const fitKey = `${selectedRouteIndex}-${routes.length}`;
    if (fitKey !== lastFitKey.current) {
      lastFitKey.current = fitKey;
      const bounds = tripBounds(selected);
      if (bounds) {
        map.current?.fitBounds(bounds, {
          padding: { top: 120, bottom: 280, left: 40, right: 40 },
          maxZoom: 15,
          duration: 800,
        });
      }
    }
  }, [routes, selectedRouteIndex]);

  // Update stops layers
  useEffect(() => {
    if (!map.current || !mapLoaded.current) return;
    const badgeSource = map.current.getSource("stops") as maplibre.GeoJSONSource;
    const dotsSource = map.current.getSource("stops-dots-src") as maplibre.GeoJSONSource;
    if (!badgeSource || !dotsSource) return;

    const MAX_MODES = 3;
    const stopModes = (stops ?? []).flatMap((s) =>
      s.modes.slice(0, MAX_MODES).map((mode, i, arr) => ({
        stop: s, mode, modeIndex: i, modeCount: arr.length,
      })),
    );

    // Badges: original coordinates (pixel offset handled by icon-offset)
    badgeSource.setData({
      type: "FeatureCollection",
      features: stopModes.map(({ stop, mode, modeIndex, modeCount }) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [stop.lng, stop.lat],
        },
        properties: {
          name: stop.name,
          mode,
          color: STOP_COLORS[mode] || STOP_COLORS.bus,
          modeIndex,
          modeCount,
        },
      })),
    });

    // Dots: original coordinates, pixel offset handled by circle-translate per layer
    dotsSource.setData({
      type: "FeatureCollection",
      features: stopModes.map(({ stop, mode, modeIndex, modeCount }) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [stop.lng, stop.lat],
        },
        properties: {
          name: stop.name,
          mode,
          color: STOP_COLORS[mode] || STOP_COLORS.bus,
          modeIndex,
          modeCount,
        },
      })),
    });
  }, [stops]);

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
