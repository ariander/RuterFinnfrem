export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  mode: string; // bus, metro, tram, rail, water, etc.
}

export async function getNearbyStops(lat: number, lng: number, distance = 1500): Promise<Stop[]> {
  const query = `{
    nearest(
      latitude: ${lat}
      longitude: ${lng}
      maximumDistance: ${distance}
      filterByPlaceTypes: [stopPlace]
      maximumResults: 60
    ) {
      edges {
        node {
          place {
            ... on StopPlace {
              id
              name
              latitude
              longitude
              transportMode
            }
          }
        }
      }
    }
  }`;

  const res = await fetch("https://api.entur.io/journey-planner/v3/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": "ruter-reisetid-poc",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const PRIORITY = ["metro", "rail", "tram", "water", "bus"];

  return (data.data?.nearest?.edges ?? []).map((edge: any) => {
    const modes: string[] = Array.isArray(edge.node.place.transportMode)
      ? edge.node.place.transportMode
      : [edge.node.place.transportMode ?? "bus"];
    const primary = PRIORITY.find((m) => modes.includes(m)) ?? modes[0] ?? "bus";
    return {
      id: edge.node.place.id,
      name: edge.node.place.name,
      lat: edge.node.place.latitude,
      lng: edge.node.place.longitude,
      mode: primary,
    };
  });
}
