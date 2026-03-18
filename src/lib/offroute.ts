import type { TripPattern, Leg } from "@/lib/entur-trip";
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

function minDistToPolyline(p: LatLng, pts: [number, number][]): number {
  let minDist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [lngA, latA] = pts[i];
    const [lngB, latB] = pts[i + 1];
    minDist = Math.min(minDist, distToSegmentM(p, [lngA, latA], [lngB, latB]));
  }
  return minDist;
}

/**
 * Returns true if user is off any active leg's polyline.
 *
 * Speed-aware: if userSpeedKmh > 10 (moving at transit speed):
 *   - Walk legs that are about to end or have just ended are skipped
 *     (user has boarded, small drift from walk path is expected)
 *   - Transit leg boarding grace is extended from 1 min to 3 min
 *     (handles "last-minute" boarding where bus just departed)
 */
export function isOffRoute(
  userLoc: LatLng,
  route: TripPattern,
  userSpeedKmh?: number | null,
): boolean {
  const now = Date.now();
  const movingFast = userSpeedKmh != null && userSpeedKmh > 10;

  for (const leg of route.legs) {
    const legStartMs = new Date(leg.expectedStartTime).getTime();
    const legEndMs = new Date(leg.expectedEndTime).getTime();
    if (!leg.pointsOnLink?.points) continue;

    const pts = decodePolyline(leg.pointsOnLink.points);
    if (pts.length < 2) continue;

    if (leg.mode === "foot") {
      if (legEndMs < now - 90_000) continue; // completed >90s ago
      // Moving at transit speed near end of walk leg → user has boarded, skip check
      if (movingFast && legEndMs < now + 60_000) continue;
      if (minDistToPolyline(userLoc, pts) > 80) return true;
    } else {
      // Boarding grace: 3 min when moving fast (last-minute boarding),
      // 1 min otherwise (standard delay tolerance)
      const boardingGrace = movingFast ? 3 * 60_000 : 60_000;
      if (legStartMs > now - boardingGrace) continue; // not boarded yet
      if (legEndMs < now - 60_000) continue;          // already alighted
      if (minDistToPolyline(userLoc, pts) > 300) return true;
    }
  }
  return false;
}

/**
 * Returns the index of a transit leg the user appears to have boarded,
 * based on speed + proximity to the route polyline.
 *
 * Used to trigger a "Er du på X?" confirmation popup.
 * Returns null if no boarding is detected.
 */
export function detectBoardedTransitLeg(
  userLoc: LatLng,
  userSpeedKmh: number,
  route: TripPattern,
): number | null {
  if (userSpeedKmh < 10) return null;

  const now = Date.now();
  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];
    if (leg.mode === "foot") continue;
    if (!leg.pointsOnLink?.points) continue;

    const legStartMs = new Date(leg.expectedStartTime).getTime();
    const legEndMs = new Date(leg.expectedEndTime).getTime();

    // Leg departed 0–4 min ago, or departs within the next minute
    if (legStartMs > now + 60_000) continue;       // >1 min in future
    if (legStartMs < now - 8 * 60_000) continue;   // departed >8 min ago (covers up to ~5 min delay + stale cache)
    if (legEndMs < now) continue;                   // already completed

    const pts = decodePolyline(leg.pointsOnLink.points);
    if (pts.length < 2) continue;

    if (minDistToPolyline(userLoc, pts) <= 200) return i;
  }
  return null;
}
