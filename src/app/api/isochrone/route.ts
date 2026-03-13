import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const key = process.env.TARGOMO_KEY;
  if (!key) {
    return NextResponse.json({ error: "Targomo key missing" }, { status: 500 });
  }

  try {
    const { lat, lng, transitMinutes, walkMinutes, lastMileMode } = await req.json();
    const walkTimeSeconds = walkMinutes * 60;
    const transitTimeSeconds = transitMinutes * 60;

    // Scooter covers ~3x the distance of walking in the same time.
    // To model this: expand the walking budget 3x so Targomo can reach farther stops,
    // and increase maxEdgeWeight accordingly so transit still gets its full time budget.
    const lastMileSeconds = lastMileMode === "scooter"
      ? (walkTimeSeconds * 3 || 60)
      : (walkTimeSeconds || 60);
    const totalTime = transitTimeSeconds + lastMileSeconds;

    const now = new Date();
    const nextMonday = new Date();
    nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
    const dateStr =
      nextMonday.getFullYear().toString() +
      (nextMonday.getMonth() + 1).toString().padStart(2, "0") +
      nextMonday.getDate().toString().padStart(2, "0");

    // When transitMinutes = 0, use pure walking mode (no transit hops possible)
    const useTransit = transitMinutes > 0;
    const sourceTm = useTransit
      ? {
          transit: {
            maxWalkingTimeFromSource: lastMileSeconds,
            maxWalkingTimeToTarget: lastMileSeconds,
          },
        }
      : { walk: {} };

    const targomoBody = {
      sources: [
        {
          lat, lng, id: "source",
          tm: sourceTm,
        },
      ],
      edgeWeight: "time",
      maxEdgeWeight: totalTime,
      ...(useTransit && {
        transitFrameDate: parseInt(dateStr),
        transitFrameTime: 8 * 3600,
        transitFrameDuration: Math.max(totalTime, 3600),
      }),
      polygon: {
        serializer: "geojson",
        srid: 4326,
        simplify: 100,
        buffer: 0.001,
        values: [totalTime],
      },
    };

    const response = await fetch(
      `https://api.targomo.com/westcentraleurope/v1/polygon_post?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targomoBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Targomo API error:", response.status, errorText);
      return NextResponse.json({ error: `Targomo API error: ${response.status}` }, { status: response.status });
    }

    const json = await response.json();
    return NextResponse.json(json.data || json);
  } catch (error: any) {
    console.error("Isochrone error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
