const VEHICLES_GRAPHQL = "https://api.entur.io/realtime/v1/vehicles/graphql";
const CLIENT_NAME = "ruterfinnfrem-poc";

export interface VehiclePosition {
  vehicleId: string;
  serviceJourneyId: string;
  lat: number;
  lng: number;
  bearing: number | null;
  updatedAt: number; // epoch seconds
  occupancyStatus?: string; // e.g. EMPTY, MANY_SEATS_AVAILABLE, FEW_SEATS_AVAILABLE, STANDING_ROOM_ONLY, FULL
}

export async function fetchVehiclePositions(
  serviceJourneyIds: string[]
): Promise<VehiclePosition[]> {
  if (serviceJourneyIds.length === 0) return [];

  // Query all at once — filter client-side since we have small set
  const results: VehiclePosition[] = [];

  for (const sjId of serviceJourneyIds) {
    try {
      const res = await fetch(VEHICLES_GRAPHQL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ET-Client-Name": CLIENT_NAME,
        },
        body: JSON.stringify({
          query: `{
            vehicles(serviceJourneyId: "${sjId}") {
              vehicleId
              bearing
              location { latitude longitude }
              lastUpdatedEpochSecond
              occupancyStatus
            }
          }`,
        }),
      });
      const data = await res.json();
      const vehicles = data?.data?.vehicles ?? [];
      for (const v of vehicles) {
        if (v.location?.latitude && v.location?.longitude) {
          results.push({
            vehicleId: v.vehicleId,
            serviceJourneyId: sjId,
            lat: v.location.latitude,
            lng: v.location.longitude,
            bearing: typeof v.bearing === "number" ? v.bearing : null,
            updatedAt: v.lastUpdatedEpochSecond ?? Date.now() / 1000,
            occupancyStatus: v.occupancyStatus ?? undefined,
          });
        }
      }
    } catch {
      // ignore per-journey errors
    }
  }
  return results;
}
