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
 * Speed-aware: if userSpeedKmh > 5 (transit speed):
 *   - Walk legs preceding an active transit leg are skipped entirely
 *   - Boarding grace for transit legs is extended from 2 min to 4 min
 *   - Walk legs about to end get a 90-second skip window
 */
export function isOffRoute(
  userLoc: LatLng,
  route: TripPattern,
  userSpeedKmh?: number | null,
): boolean {
  const now = Date.now();
  const movingFast = userSpeedKmh != null && userSpeedKmh > 5;

  // If any transit leg is currently active (started + not ended), ignore ALL walk legs.
  // Prevents spurious off-route triggers while riding past stops the route walked past earlier.
  const hasActiveTravelLeg = route.legs.some(leg => {
    if (leg.mode === "foot") return false;
    const start = new Date(leg.expectedStartTime).getTime();
    const end = new Date(leg.expectedEndTime).getTime();
    const grace = movingFast ? 4 * 60_000 : 2 * 60_000;
    return start <= now + grace && end >= now - 2 * 60_000;
  });

  for (const leg of route.legs) {
    const legStartMs = new Date(leg.expectedStartTime).getTime();
    const legEndMs = new Date(leg.expectedEndTime).getTime();
    if (!leg.pointsOnLink?.points) continue;

    const pts = decodePolyline(leg.pointsOnLink.points);
    if (pts.length < 2) continue;

    if (leg.mode === "foot") {
      if (legEndMs < now - 180_000) continue; // completed >3 min ago (was 90 s)
      if (hasActiveTravelLeg) continue;        // on transit – walk legs are irrelevant
      // Moving at transit speed near end of walk leg → user has boarded, skip
      if (movingFast && legEndMs < now + 90_000) continue;
      if (minDistToPolyline(userLoc, pts) > 80) return true;
    } else {
      // Boarding grace: 4 min when fast, 2 min otherwise
      const boardingGrace = movingFast ? 4 * 60_000 : 2 * 60_000;
      if (legStartMs > now - boardingGrace) continue; // not boarded yet
      if (legEndMs < now - 60_000) continue;          // already alighted
      if (minDistToPolyline(userLoc, pts) > 500) return true; // was 300 m
    }
  }
  return false;
}

/**
 * Returns the index of a transit leg the user appears to have boarded,
 * based on speed + proximity to the route polyline.
 *
 * Accepts null speed — if speed is unavailable (common on iOS) boarding is
 * still detected, but requires closer proximity (75 m vs 200 m) as a guard.
 */
export function detectBoardedTransitLeg(
  userLoc: LatLng,
  userSpeedKmh: number | null,
  route: TripPattern,
): number | null {
  const speedOk = userSpeedKmh != null && userSpeedKmh >= 5;
  const speedUnknown = userSpeedKmh == null;
  // Speed is known and too low (clearly walking/stationary) — skip
  if (!speedOk && !speedUnknown) return null;

  const now = Date.now();
  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];
    if (leg.mode === "foot") continue;
    if (!leg.pointsOnLink?.points) continue;

    const legStartMs = new Date(leg.expectedStartTime).getTime();
    const legEndMs = new Date(leg.expectedEndTime).getTime();

    // Window: departed up to 12 min ago (was 8 min) or departs within 2 min
    if (legStartMs > now + 2 * 60_000) continue;
    if (legStartMs < now - 12 * 60_000) continue;
    if (legEndMs < now) continue;

    const pts = decodePolyline(leg.pointsOnLink.points);
    if (pts.length < 2) continue;

    // Tighter threshold when speed is unknown — avoids false positives at rest
    const threshold = speedOk ? 200 : 75;
    if (minDistToPolyline(userLoc, pts) <= threshold) return i;
  }
  return null;
}
