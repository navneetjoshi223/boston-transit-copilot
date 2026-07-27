// Thin wrapper around the MBTA V3 API (https://api-v3.mbta.com).
// No key is required for light use, but requests are rate-limited without one.
// Get a free key at https://api-v3.mbta.com/register and set MBTA_API_KEY in .env.local.

const MBTA_BASE = "https://api-v3.mbta.com";

function withKey(url: URL) {
  const key = process.env.MBTA_API_KEY;
  if (key) url.searchParams.set("api_key", key);
  return url;
}

async function mbtaGet(path: string, params: Record<string, string>) {
  const url = withKey(new URL(MBTA_BASE + path));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/vnd.api+json" },
  });

  if (!res.ok) {
    throw new Error(`MBTA API error ${res.status} for ${path}`);
  }
  return res.json();
}

/** Find stops matching a rider-typed name, e.g. "Harvard" or "Alewife". */
export async function searchStops(query: string) {
  const data = await mbtaGet("/stops", {
    "filter[location_type]": "1", // named stations, not individual platforms/bus poles
    "page[limit]": "500",
  });

  // MBTA's API doesn't do fuzzy text search server-side, so we filter client-side.
  const q = query.toLowerCase();
  const matches = (data.data ?? []).filter((s: any) =>
    (s.attributes?.name ?? "").toLowerCase().includes(q)
  );
  return matches.map((s: any) => ({
    id: s.id,
    name: s.attributes.name,
    lat: s.attributes.latitude,
    lon: s.attributes.longitude,
  }));
}

/** Real-time predictions (next arrivals/departures) for a stop, optionally filtered by route. */
export async function getPredictions(stopId: string, routeId?: string) {
  const params: Record<string, string> = {
    "filter[stop]": stopId,
    "include": "trip,route",
    "sort": "departure_time",
    "page[limit]": "6",
  };
  if (routeId) params["filter[route]"] = routeId;

  const data = await mbtaGet("/predictions", params);

  return (data.data ?? []).map((p: any) => ({
    routeId: p.relationships?.route?.data?.id,
    arrivalTime: p.attributes.arrival_time,
    departureTime: p.attributes.departure_time,
    status: p.attributes.status,
    direction: p.attributes.direction_id,
  }));
}

/** Active service alerts (delays, shuttle buses, elevator outages, etc). */
export async function getAlerts(routeId: string) {
  const data = await mbtaGet("/alerts", {
    "filter[route]": routeId,
    "filter[activity]": "BOARD,EXIT,RIDE",
  });

  return (data.data ?? []).map((a: any) => ({
    header: a.attributes.header,
    effect: a.attributes.effect,
    severity: a.attributes.severity,
    updatedAt: a.attributes.updated_at,
  }));
}

/** All current MBTA subway/light-rail routes, for mapping line names to route IDs. */
export async function listSubwayRoutes() {
  const data = await mbtaGet("/routes", {
    "filter[type]": "0,1",
  });
  return (data.data ?? []).map((r: any) => ({
    id: r.id,
    name: r.attributes.long_name,
    color: r.attributes.color,
  }));
}
