import { decodePolyline } from "./polyline";

export interface WikiPOI {
  pageid: number;
  title: string;
  lat: number;
  lng: number;
  /** Closest distance to the route polyline, in metres */
  dist: number;
}

function distToSegmentM(
  p: { lat: number; lng: number },
  a: [number, number],
  b: [number, number],
): number {
  const R = 111320;
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  const px = (p.lng - a[0]) * R * cosLat;
  const py = (p.lat - a[1]) * R;
  const dx = (b[0] - a[0]) * R * cosLat;
  const dy = (b[1] - a[1]) * R;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  return Math.hypot(t * dx - px, t * dy - py);
}

/**
 * Fetches Wikipedia (no.wikipedia.org) POIs within `radiusM` metres of the
 * route defined by `encodedPolyline` (Entur/Google encoded format).
 *
 * Strategy:
 *  1. Compute bounding box of the polyline
 *  2. Query Wikipedia geosearch centered on the bbox midpoint with a radius
 *     large enough to cover the whole route plus the buffer
 *  3. Filter results to those within `radiusM` of any polyline segment
 */
export async function fetchPoisAlongRoute(
  encodedPolyline: string,
  radiusM = 150,
): Promise<WikiPOI[]> {
  const pts = decodePolyline(encodedPolyline); // [[lng, lat], ...]
  if (pts.length < 2) return [];

  // Bounding box in [lng, lat] order
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of pts) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Radius: half the diagonal of the bounding box + the POI buffer
  const R = 111320;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const diagM = Math.hypot(
    (maxLat - minLat) * R,
    (maxLng - minLng) * R * cosLat,
  );
  const searchRadius = Math.min(10000, Math.ceil(diagM / 2 + radiusM));

  const url =
    `https://no.wikipedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${centerLat}|${centerLng}&gsradius=${searchRadius}` +
    `&gslimit=50&format=json&origin=*`;

  let data: { query?: { geosearch?: { pageid: number; title: string; lat: number; lon: number }[] } };
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  const results = data.query?.geosearch ?? [];

  // Filter to points within radiusM of the polyline
  return results
    .map((r) => {
      const p = { lat: r.lat, lng: r.lon };
      let minDist = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = distToSegmentM(p, pts[i], pts[i + 1]);
        if (d < minDist) minDist = d;
      }
      return { pageid: r.pageid, title: r.title, lat: r.lat, lng: r.lon, dist: minDist };
    })
    .filter((r) => r.dist <= radiusM)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 10);
}
