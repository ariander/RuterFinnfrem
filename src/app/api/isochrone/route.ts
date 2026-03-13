import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const key = process.env.TARGOMO_KEY;
  if (!key) return NextResponse.json({ error: "Targomo key missing" }, { status: 500 });

  const { lat, lng, transitMinutes, walkMinutes } = await req.json();

  // Next Monday 08:00 for representative rush hour results
  const now = new Date();
  const nextMonday = new Date();
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
  const dateStr =
    nextMonday.getFullYear().toString() +
    (nextMonday.getMonth() + 1).toString().padStart(2, "0") +
    nextMonday.getDate().toString().padStart(2, "0");
  const transitFrameDate = parseInt(dateStr);
  const transitFrameTime = 8 * 3600;

  const totalTime = (transitMinutes + walkMinutes) * 60;
  const walkTimeSeconds = walkMinutes * 60;

  const response = await fetch(
    `https://api.targomo.com/westcentraleurope/v1/polygon_post?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: [
          {
            lat,
            lng,
            id: "source",
            tm: {
              transit: {
                maxWalkingTimeFromSource: walkTimeSeconds || 120,
                maxWalkingTimeToTarget: walkTimeSeconds || 120,
              },
            },
          },
        ],
        edgeWeight: "time",
        maxEdgeWeight: totalTime,
        transitFrameDate,
        transitFrameTime,
        transitFrameDuration: Math.max(totalTime, 3600),
        polygon: {
          serializer: "geojson",
          buffer: 0.001,
          srid: 4326,
          values: [totalTime],
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Targomo Error:", error);
    return NextResponse.json({ error: "Targomo request failed" }, { status: response.status });
  }

  const json = await response.json();
  return NextResponse.json(json.data);
}
