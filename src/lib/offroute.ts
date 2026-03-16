import type { TripPattern } from "@/lib/entur-trip";
import { decodePolyline } from "@/lib/polyline";

interface LatLng {
  lat: number;
  lng: number;
}

function distToSegmentM(
  p: LatLng,
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
 * Returns true if user is off any active leg's polyline:
 *   walk legs    → >80m  (precise on foot)
 *   transit legs → >300m (only while actively riding: start passed, end not yet)
 */
export function isOffRoute(userLoc: LatLng, route: TripPattern): boolean {
  const now = Date.now();
  for (const leg of route.legs) {
    const legStartMs = new Date(leg.expectedStartTime).getTime();
    const legEndMs = new Date(leg.expectedEndTime).getTime();
    if (!leg.pointsOnLink?.points) continue;

    const pts = decodePolyline(leg.pointsOnLink.points);
    if (pts.length < 2) continue;

    if (leg.mode === "foot") {
      if (legEndMs < now - 90_000) continue; // completed >90s ago
      let minDist = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const [lngA, latA] = pts[i];
        const [lngB, latB] = pts[i + 1];
        minDist = Math.min(minDist, distToSegmentM(userLoc, [lngA, latA], [lngB, latB]));
      }
      if (minDist > 80) return true;
    } else {
      // Only check transit while the user should actively be riding
      // (60s grace on boarding side, 60s grace on alighting side)
      if (legStartMs > now - 60_000) continue; // not boarded yet
      if (legEndMs < now - 60_000) continue; // already alighted
      let minDist = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const [lngA, latA] = pts[i];
        const [lngB, latB] = pts[i + 1];
        minDist = Math.min(minDist, distToSegmentM(userLoc, [lngA, latA], [lngB, latB]));
      }
      if (minDist > 300) return true;
    }
  }
  return false;
}

