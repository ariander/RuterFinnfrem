const ENTUR_GRAPHQL = "https://api.entur.io/journey-planner/v3/graphql";
const CLIENT_NAME = "ruterfinnfrem-poc";

export interface TripPattern {
  duration: number;
  startTime: string;
  endTime: string;
  walkDistance: number;
  legs: Leg[];
}

export interface Leg {
  mode: string;
  transportSubmode?: string;
  duration: number;
  distance: number;
  realtime: boolean;
  aimedStartTime: string;
  expectedStartTime: string;
  aimedEndTime: string;
  expectedEndTime: string;
  fromPlace: Place;
  toPlace: Place;
  line?: LineInfo;
  intermediateEstimatedCalls?: EstimatedCall[];
  pointsOnLink?: { points: string };
  serviceJourney?: { id: string };
}

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  quay?: { id: string; name: string; publicCode?: string };
}

export interface LineInfo {
  publicCode: string;
  name: string;
  transportMode: string;
}

export interface EstimatedCall {
  quay: { name: string; id: string };
  aimedDepartureTime: string;
  expectedDepartureTime: string;
  realtime: boolean;
}

/** Color per transport mode — matches Ruter visual identity */
export const MODE_COLORS: Record<string, string> = {
  foot: "#888888",
  bus: "#E60000",
  tram: "#0B91EF",
  metro: "#EC700C",
  rail: "#003087",
  water: "#682C88",
  coach: "#75A300",
};

export function getModeColor(mode: string): string {
  return MODE_COLORS[mode] ?? MODE_COLORS.bus;
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("no-NO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} t ${m} min` : `${h} t`;
}

export function getModeName(mode: string): string {
  const names: Record<string, string> = {
    foot: "Gange",
    bus: "Buss",
    tram: "Trikk",
    metro: "T-bane",
    rail: "Tog",
    water: "Båt",
    coach: "Buss",
  };
  return names[mode] ?? mode;
}

export async function searchTrip(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  numPatterns = 5,
): Promise<TripPattern[]> {
  const query = `{
    trip(
      from: { coordinates: { latitude: ${from.lat}, longitude: ${from.lng} } }
      to: { coordinates: { latitude: ${to.lat}, longitude: ${to.lng} } }
      numTripPatterns: ${numPatterns}
      modes: {
        accessMode: foot
        egressMode: foot
        transportModes: [
          { transportMode: bus },
          { transportMode: tram },
          { transportMode: metro },
          { transportMode: rail },
          { transportMode: water },
          { transportMode: coach }
        ]
      }
    ) {
      tripPatterns {
        duration startTime endTime walkDistance
        legs {
          mode transportSubmode duration distance realtime
          aimedStartTime expectedStartTime aimedEndTime expectedEndTime
          fromPlace { name latitude longitude quay { id name publicCode } }
          toPlace { name latitude longitude quay { id name publicCode } }
          line { publicCode name transportMode }
          intermediateEstimatedCalls {
            quay { name id }
            aimedDepartureTime expectedDepartureTime realtime
          }
          pointsOnLink { points }
          serviceJourney { id }
        }
      }
    }
  }`;

  const res = await fetch(ENTUR_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": CLIENT_NAME,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error("Trip search failed");

  const data = await res.json();
  return data.data?.trip?.tripPatterns ?? [];
}

export async function searchWalkRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<TripPattern | null> {
  const query = `{
    trip(
      from: { coordinates: { latitude: ${from.lat}, longitude: ${from.lng} } }
      to: { coordinates: { latitude: ${to.lat}, longitude: ${to.lng} } }
      numTripPatterns: 1
      modes: { directMode: foot }
    ) {
      tripPatterns {
        duration startTime endTime walkDistance
        legs {
          mode duration distance
          aimedStartTime expectedStartTime aimedEndTime expectedEndTime
          fromPlace { name latitude longitude }
          toPlace { name latitude longitude }
          pointsOnLink { points }
        }
      }
    }
  }`;

  const res = await fetch(ENTUR_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": CLIENT_NAME,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error("Walk route search failed");
  const data = await res.json();
  const patterns = data.data?.trip?.tripPatterns ?? [];
  return patterns[0] ?? null;
}
