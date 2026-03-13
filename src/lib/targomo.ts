export async function getIsochrone(lat: number, lng: number, transitMinutes: number, walkMinutes: number) {
  const response = await fetch("/api/isochrone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, transitMinutes, walkMinutes }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Isochrone Error:", error);
    throw new Error("Failed to fetch isochrone");
  }

  return response.json();
}
