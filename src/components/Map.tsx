"use client";

import { useEffect, useRef, useCallback, useState } from "react";
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
  centerOnUser?: boolean;
  detailMinimized?: boolean;
  walkRoute?: TripPattern;
  userHeading?: number | null;
  onMapClick?: (lat: number, lng: number) => void;
  onViewChange?: (lat: number, lng: number) => void;
  onStopClick?: (stop: { lat: number; lng: number; name: string }) => void;
  vehicleLegs?: Array<{
    serviceJourneyId: string;
    mode: string;
    transportSubmode?: string;
    color: string;
  }>;
  onVehicleUpdate?: (positions: Array<{ serviceJourneyId: string; occupancyStatus?: string }>) => void;
  /** Dynamic padding so the user dot appears centred in the space between the top and bottom UI cards */
  followPadding?: { top: number; bottom: number; left: number; right: number };
  fakeVehicles?: Array<{
    id: string;
    lat: number;
    lng: number;
    bearing?: number;
    mode: string;
    transportSubmode?: string;
    occupancyStatus?: string;
  }>;
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

/** Build the DOM element for a vehicle map marker */
function buildVehicleMarkerEl(icon: string, color: string, bearing: number | null | undefined): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "vehicle-marker";
  el.style.cssText = "width:44px;height:44px;position:relative;overflow:visible;";
  const hasBearing = bearing !== null && bearing !== undefined;
  el.innerHTML = `
    <div class="vehicle-bearing-arrow" style="position:absolute;inset:0;pointer-events:none;${hasBearing ? `transform:rotate(${bearing}deg)` : "opacity:0"}">
      <div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ${color};filter:drop-shadow(0 1px 1px rgba(0,0,0,0.15))"></div>
    </div>
    <div style="position:absolute;inset:0;border-radius:50%;background:white;border:3px solid ${color};box-shadow:0 2px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;">
      <img class="vehicle-mode-icon" src="${icon}" width="22" height="22" style="display:block" />
    </div>
  `;
  return el;
}

function updateVehicleBearing(el: HTMLElement, bearing: number | null | undefined) {
  const arrow = el.querySelector(".vehicle-bearing-arrow") as HTMLElement | null;
  if (!arrow) return;
  if (bearing !== null && bearing !== undefined) {
    arrow.style.transform = `rotate(${bearing}deg)`;
    arrow.style.opacity = "1";
  } else {
    arrow.style.opacity = "0";
  }
}

function vehicleIconInfo(mode: string, transportSubmode?: string): { icon: string; color: string } {
  const REGIONAL_SUBMODES = ["regionalBus", "expressBus", "airportBus", "airportLinkBus", "shuttleBus"];
  if (mode === "bus" || mode === "coach") {
    if (mode === "coach" || (transportSubmode && REGIONAL_SUBMODES.includes(transportSubmode))) {
      return { icon: "/live_regionalbus.svg", color: "#75A300" };
    }
    return { icon: "/live_bus.svg", color: "#E60000" };
  }
  if (mode === "tram") return { icon: "/live_tram.svg", color: "#0B91EF" };
  if (mode === "metro") return { icon: "/live_metro.svg", color: "#EC700C" };
  if (mode === "rail") return { icon: "/live_train.svg", color: "#003087" };
  if (mode === "water") return { icon: "/live_boat.svg", color: "#682C88" };
  return { icon: "/live_bus.svg", color: "#E60000" };
}

export function MapView({
  userLocation,
  destination,
  routes,
  selectedRouteIndex = 0,
  stops,
  centerOnUser,
  detailMinimized,
  walkRoute,
  userHeading,
  onMapClick,
  onViewChange,
  onStopClick,
  vehicleLegs,
  fakeVehicles,
  onVehicleUpdate,
  followPadding,
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
  const onStopClickRef = useRef(onStopClick);
  onStopClickRef.current = onStopClick;
  const onVehicleUpdateRef = useRef(onVehicleUpdate);
  onVehicleUpdateRef.current = onVehicleUpdate;
  const userHeadingRef = useRef<number | null>(null);
  userHeadingRef.current = userHeading ?? null;

  // Fake vehicle markers ref (for /fake page)
  const fakeVehicleMarkersRef = useRef<Map<string, maplibre.Marker>>(new Map());

  // Vehicle tracking refs
  const vehicleMarkersRef = useRef<Map<string, maplibre.Marker>>(new Map());
  const vehicleInterpRef = useRef<Map<string, {
    fromLat: number; fromLng: number;
    toLat: number; toLng: number;
    startMs: number; durationMs: number;
  }>>(new Map());
  const rafRef = useRef<number | null>(null);

  // Track previous route bounds to avoid re-fitting on every render
  const lastFitKey = useRef("");
  const prevCenterOnUser = useRef(false);
  const centerOnUserRef = useRef(false);
  centerOnUserRef.current = !!centerOnUser;
  const isFollowingRef = useRef(false);
  const [showRecenter, setShowRecenter] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const createUserMarker = useCallback((lng: number, lat: number) => {
    if (!map.current) return;
    if (userMarker.current) {
      userMarker.current.setLngLat([lng, lat]);
      return;
    }
    const el = document.createElement("div");
    el.className = "user-location-marker";
    el.innerHTML = `
      <div class="user-location-inner">
        <div class="user-location-cone"></div>
        <div class="user-location-pulse"></div>
        <div class="user-location-dot"></div>
      </div>
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
          setMapReady(true);
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
              "line-dasharray": [1, 2],
              "line-opacity": 0.7,
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
            { modeCount: 2, modeIndex: 0, translate: [-3, 0] },
            { modeCount: 2, modeIndex: 1, translate: [3, 0] },
            { modeCount: 3, modeIndex: 0, translate: [-4, -2] },
            { modeCount: 3, modeIndex: 1, translate: [0, 4] },
            { modeCount: 3, modeIndex: 2, translate: [4, -2] },
          ];
          for (const { modeCount, modeIndex, translate } of DOT_CONFIGS) {
            map.current?.addLayer({
              id: `stops-dot-${modeCount}-${modeIndex}`,
              type: "circle",
              source: "stops-dots-src",
              minzoom: 8,
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

          // Stop click handlers
          const stopLayers = [
            "stops-badge",
            ...DOT_CONFIGS.map((c) => `stops-dot-${c.modeCount}-${c.modeIndex}`),
          ];
          let stopClickFired = false;
          for (const layerId of stopLayers) {
            map.current?.on("mouseenter", layerId, () => {
              if (map.current) map.current.getCanvas().style.cursor = "pointer";
            });
            map.current?.on("mouseleave", layerId, () => {
              if (map.current) map.current.getCanvas().style.cursor = "";
            });
            map.current?.on("click", layerId, (e) => {
              if (stopClickFired) return;
              stopClickFired = true;
              setTimeout(() => { stopClickFired = false; }, 100);
              const feature = e.features?.[0];
              if (!feature) return;
              const name = (feature.properties?.name as string) ?? "";
              const coords = (feature.geometry as GeoJSON.Point).coordinates;
              onStopClickRef.current?.({ lat: coords[1], lng: coords[0], name });
            });
          }

          map.current?.on("dragstart", () => {
            if (centerOnUserRef.current && isFollowingRef.current) {
              isFollowingRef.current = false;
              setShowRecenter(true);
            }
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

  // Update user location marker + heading (account for map bearing so cone always points compass-north)
  useEffect(() => {
    if (!map.current || !userLocation) return;
    createUserMarker(userLocation.lng, userLocation.lat);
    const el = userMarker.current?.getElement();
    if (!el) return;
    const inner = el.querySelector(".user-location-inner") as HTMLElement | null;
    if (userHeading != null) {
      const mapBearing = map.current?.getBearing() ?? 0;
      if (inner) inner.style.transform = `rotate(${userHeading - mapBearing}deg)`;
      el.classList.add("has-heading");
    } else {
      if (inner) inner.style.transform = "";
      el.classList.remove("has-heading");
    }
  }, [userLocation, userHeading, createUserMarker]);

  // Keep heading cone aligned as map rotates
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const onRotate = () => {
      const el = userMarker.current?.getElement();
      if (!el) return;
      const inner = el.querySelector(".user-location-inner") as HTMLElement | null;
      if (!inner || userHeadingRef.current == null) return;
      inner.style.transform = `rotate(${userHeadingRef.current - (map.current?.getBearing() ?? 0)}deg)`;
    };
    map.current.on("rotate", onRotate);
    return () => { map.current?.off("rotate", onRotate); };
  }, [mapReady]);

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
      padding: { top: 180, bottom: 80, left: 40, right: 40 },
    });
  }, [userLocation]);

  // Keep a ref to the latest follow padding — updated on every render, never triggers effects
  const FOLLOW_PADDING_FALLBACK = { top: 100, bottom: 360, left: 40, right: 40 };
  const followPaddingRef = useRef(followPadding ?? FOLLOW_PADDING_FALLBACK);
  followPaddingRef.current = followPadding ?? FOLLOW_PADDING_FALLBACK;

  // Re-center when detail panel is minimized/expanded — wait for the 300ms CSS transition to
  // finish so that ResizeObserver has already delivered the final padding values.
  const prevDetailMinimized = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (!map.current || !userLocation || !centerOnUser || !isFollowingRef.current) return;
    if (prevDetailMinimized.current === detailMinimized) return;
    prevDetailMinimized.current = detailMinimized;
    setTimeout(() => {
      map.current?.easeTo({
        center: [userLocation.lng, userLocation.lat],
        duration: 400,
        padding: followPaddingRef.current,
      });
    }, 320); // 300ms CSS transition + small buffer
  }, [detailMinimized, centerOnUser, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom to user when entering route detail
  useEffect(() => {
    if (!map.current || !userLocation) return;
    if (centerOnUser && !prevCenterOnUser.current) {
      isFollowingRef.current = true;
      setShowRecenter(false);
      map.current.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 15,
        duration: 800,
        essential: true,
        padding: followPaddingRef.current,
      });
    }
    if (!centerOnUser) {
      isFollowingRef.current = false;
      setShowRecenter(false);
    }
    prevCenterOnUser.current = !!centerOnUser;
  }, [centerOnUser, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow user location continuously when in follow mode (only on GPS updates, not on centerOnUser flip)
  useEffect(() => {
    if (!map.current || !userLocation || !centerOnUser || !isFollowingRef.current) return;
    map.current.easeTo({
      center: [userLocation.lng, userLocation.lat],
      duration: 800,
      padding: followPaddingRef.current,
    });
  }, [userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

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
      transitSource.setData(emptyFC);
      transferSource.setData(emptyFC);
      if (walkRoute) {
        const geo = routeToGeoJSON(walkRoute, { opacity: 1, width: 4 });
        walkSource.setData({ type: "FeatureCollection", features: geo.features });
        const bounds = tripBounds(walkRoute);
        const fitKey = `walk-${walkRoute.startTime}`;
        if (bounds && fitKey !== lastFitKey.current) {
          lastFitKey.current = fitKey;
          map.current?.fitBounds(bounds, {
            padding: { top: 120, bottom: 200, left: 40, right: 40 },
            maxZoom: 16,
            duration: 800,
          });
        }
      } else {
        walkSource.setData(emptyFC);
      }
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

    // Fit map to selected route bounds (skip when route detail is open)
    const fitKey = `${selectedRouteIndex}-${routes.length}`;
    if (fitKey !== lastFitKey.current && !centerOnUserRef.current) {
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
  }, [routes, selectedRouteIndex, walkRoute]);

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

  // Vehicle positions: poll every 10s, smooth interpolation with RAF
  useEffect(() => {
    if (!vehicleLegs || vehicleLegs.length === 0) {
      // Clean up all vehicle markers
      vehicleMarkersRef.current.forEach(m => m.remove());
      vehicleMarkersRef.current.clear();
      vehicleInterpRef.current.clear();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    let cancelled = false;

    async function poll() {
      if (cancelled || !map.current) return;
      const ids = vehicleLegs!.map(l => l.serviceJourneyId);
      try {
        const { fetchVehiclePositions } = await import("@/lib/entur-vehicles");
        const positions = await fetchVehiclePositions(ids);

        if (cancelled) return;

        // Notify parent with occupancy data
        onVehicleUpdateRef.current?.(positions.map(p => ({
          serviceJourneyId: p.serviceJourneyId,
          occupancyStatus: p.occupancyStatus,
        })));

        for (const pos of positions) {
          const leg = vehicleLegs!.find(l => l.serviceJourneyId === pos.serviceJourneyId);
          if (!leg) continue;
          const { icon, color } = vehicleIconInfo(leg.mode, leg.transportSubmode);
          const key = pos.serviceJourneyId;

          // Create marker if needed
          if (!vehicleMarkersRef.current.has(key)) {
            const el = buildVehicleMarkerEl(icon, color, pos.bearing);
            const marker = new maplibre.Marker({ element: el, anchor: "center" })
              .setLngLat([pos.lng, pos.lat])
              .addTo(map.current!);
            vehicleMarkersRef.current.set(key, marker);
          }

          // Set interpolation target
          const currentMarker = vehicleMarkersRef.current.get(key)!;
          const currentLngLat = currentMarker.getLngLat();
          vehicleInterpRef.current.set(key, {
            fromLat: currentLngLat.lat,
            fromLng: currentLngLat.lng,
            toLat: pos.lat,
            toLng: pos.lng,
            startMs: Date.now(),
            durationMs: 10000,
          });

          // Update bearing arrow
          updateVehicleBearing(currentMarker.getElement(), pos.bearing);
        }
      } catch {
        // ignore
      }
    }

    // RAF interpolation loop
    function animationLoop() {
      const now = Date.now();
      vehicleInterpRef.current.forEach((interp, key) => {
        const marker = vehicleMarkersRef.current.get(key);
        if (!marker) return;
        const t = Math.min(1, (now - interp.startMs) / interp.durationMs);
        // ease-out cubic
        const ease = 1 - Math.pow(1 - t, 3);
        const lat = interp.fromLat + (interp.toLat - interp.fromLat) * ease;
        const lng = interp.fromLng + (interp.toLng - interp.fromLng) * ease;
        marker.setLngLat([lng, lat]);
      });
      if (!cancelled) rafRef.current = requestAnimationFrame(animationLoop);
    }

    poll();
    const interval = setInterval(poll, 10_000);
    rafRef.current = requestAnimationFrame(animationLoop);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      vehicleMarkersRef.current.forEach(m => m.remove());
      vehicleMarkersRef.current.clear();
      vehicleInterpRef.current.clear();
    };
  }, [vehicleLegs]);

  // Fake vehicles: static markers for /fake page testing
  useEffect(() => {
    if (!map.current || !mapReady) return;

    // Remove any markers not in the new list
    const newIds = new Set((fakeVehicles ?? []).map(v => v.id));
    fakeVehicleMarkersRef.current.forEach((m, id) => {
      if (!newIds.has(id)) { m.remove(); fakeVehicleMarkersRef.current.delete(id); }
    });

    if (!fakeVehicles || fakeVehicles.length === 0) return;

    for (const v of fakeVehicles) {
      const { icon, color } = vehicleIconInfo(v.mode, v.transportSubmode);

      if (fakeVehicleMarkersRef.current.has(v.id)) {
        const marker = fakeVehicleMarkersRef.current.get(v.id)!;
        marker.setLngLat([v.lng, v.lat]);
        updateVehicleBearing(marker.getElement(), v.bearing);
      } else {
        const el = buildVehicleMarkerEl(icon, color, v.bearing);
        const marker = new maplibre.Marker({ element: el, anchor: "center" })
          .setLngLat([v.lng, v.lat])
          .addTo(map.current!);
        fakeVehicleMarkersRef.current.set(v.id, marker);
      }
    }
  }, [fakeVehicles, mapReady]);

  function handleRecenter() {
    if (!map.current || !userLocation) return;
    isFollowingRef.current = true;
    setShowRecenter(false);
    map.current.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 15,
      duration: 600,
      essential: true,
      padding: followPaddingRef.current,
    });
  }

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      {showRecenter && (
        <button
          onClick={handleRecenter}
          className="absolute right-4 z-[105] w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 24rem)" }}
          aria-label="Sentrer på min posisjon"
        >
          <img src="/target.svg" width={22} height={22} alt="" />
        </button>
      )}
    </div>
  );
}
