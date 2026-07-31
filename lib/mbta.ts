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

type Stop = { id: string; name: string; lat: number; lon: number; locationType: number };

let allStopsCache: Stop[] | null = null;
let allStopsCachedAt = 0;
const ALL_STOPS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — MBTA's stop list barely ever changes

// Most of MBTA's ~10,300 stops are plain bus platforms (location_type 0), not named
// stations (location_type 1) — a real, nameable place like a route's home terminus
// (e.g. "Technology Way @ Watertown Yard") can be either. Searching only stations
// makes those invisible, so this fetches and caches the whole system once per hour
// instead of filtering by location_type, and re-fetching that full list on every call.
// Types 2 (station entrance/exit) and 3 (generic wayfinding node) are excluded outright —
// they're doors and pathway-graph elements, never something with its own predictions.
async function getAllStops(): Promise<Stop[]> {
  if (allStopsCache && Date.now() - allStopsCachedAt < ALL_STOPS_CACHE_TTL_MS) {
    return allStopsCache;
  }
  const data = await mbtaGet("/stops", { "page[limit]": "15000" });
  const stops: Stop[] = (data.data ?? [])
    .filter((s: any) => s.attributes.location_type === 0 || s.attributes.location_type === 1)
    .map((s: any) => ({
      id: s.id,
      name: s.attributes.name,
      lat: s.attributes.latitude,
      lon: s.attributes.longitude,
      locationType: s.attributes.location_type,
    }));
  allStopsCache = stops;
  allStopsCachedAt = Date.now();
  return stops;
}

/** Find stops matching a rider-typed name, e.g. "Harvard" or "Alewife". */
export async function searchStops(query: string) {
  const stops = await getAllStops();
  const q = query.toLowerCase();

  // MBTA's API doesn't do fuzzy text search server-side, so we filter client-side.
  // A major hub like North Station has ~17 different stops that all share that exact
  // name (one per platform/track) — collapse those to one entry per name, preferring
  // the parent station (locationType 1) over an arbitrary platform (locationType 0),
  // since predictions/alerts queried against the parent already cover every platform.
  const byName = new Map<string, Stop>();
  for (const s of stops) {
    if (!s.name.toLowerCase().includes(q)) continue;
    const existing = byName.get(s.name);
    if (!existing || (existing.locationType !== 1 && s.locationType === 1)) {
      byName.set(s.name, s);
    }
  }
  const matches = [...byName.values()];

  // Rank a name starting with the query, or containing it as a whole word, above a
  // bare substring hit buried in a longer "X St @ Y St" name — otherwise a broad
  // query like "Main" would mostly return noise instead of the places people mean.
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wholeWord = new RegExp(`\\b${escaped}\\b`);
  const lexicalTier = (name: string) => {
    const n = name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (wholeWord.test(n)) return 2;
    return 3;
  };

  // A name like "Watertown St @ Pond St" is just a stop on a street that happens to
  // share the query's name — not the place a rider means. Tell those apart from real
  // destinations ("Watertown Square", "Watertown Yard") by checking the word right
  // after the match: a street-type suffix means it's a street segment, not a place.
  const STREET_SUFFIX =
    /^(st|street|ave|avenue|rd|road|dr|drive|ln|lane|pl|place|blvd|boulevard|ct|court|terr|terrace|cir|circle|hwy|pkwy)\b/i;
  const isStreetSegment = (name: string) => {
    const n = name.toLowerCase();
    const idx = n.indexOf(q);
    if (idx === -1) return false;
    return STREET_SUFFIX.test(n.slice(idx + q.length).trim());
  };

  const rank = (name: string) => (isStreetSegment(name) ? 10 : 0) + lexicalTier(name);
  matches.sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length);

  // An exact name match ("North Station") is almost certainly what the rider means —
  // don't let it compete with loosely-related nearby stops that just happen to share
  // the name as a prefix or substring (e.g. "North Station - Haverhill St @ Causeway
  // St"). A query with no exact match ("Watertown") still surfaces every genuine
  // candidate ("Watertown Square", "Watertown Yard"), unaffected.
  const exactMatches = matches.filter((s) => s.name.toLowerCase() === q);
  const results = exactMatches.length > 0 ? exactMatches : matches;

  // Capped so an LLM tool result stays a short, readable list of real candidates,
  // not a wall of near-identical stops for a generic query.
  return results.slice(0, 8).map(({ id, name, lat, lon }) => ({ id, name, lat, lon }));
}

/** Real-time predictions (next arrivals/departures) for a stop, optionally filtered by route. */
export async function getPredictions(stopId: string, routeId?: string) {
  const params: Record<string, string> = {
    "filter[stop]": stopId,
    "include": "route",
    "sort": "departure_time",
    "page[limit]": "6",
  };
  if (routeId) params["filter[route]"] = routeId;

  const data = await mbtaGet("/predictions", params);

  // A route's direction_destinations (e.g. ["Watertown Square", "Harvard Station"])
  // is the actual ground truth for where a given direction_id heads — without this,
  // a model that confirms a route serves a stop has no way to know whether it also
  // reaches the rider's specific destination, and can end up asserting a made-up one.
  const destinationsByRoute = new Map<string, string[]>();
  for (const included of data.included ?? []) {
    if (included.type === "route") {
      destinationsByRoute.set(included.id, included.attributes.direction_destinations ?? []);
    }
  }

  return (data.data ?? []).map((p: any) => {
    const routeId = p.relationships?.route?.data?.id;
    const destinations = routeId ? destinationsByRoute.get(routeId) : undefined;
    return {
      routeId,
      arrivalTime: p.attributes.arrival_time,
      departureTime: p.attributes.departure_time,
      status: p.attributes.status,
      direction: p.attributes.direction_id,
      headingTo: destinations?.[p.attributes.direction_id],
    };
  });
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

/** All current MBTA subway, light-rail, and commuter rail routes, for mapping line names to route IDs. */
export async function listSubwayRoutes() {
  const data = await mbtaGet("/routes", {
    "filter[type]": "0,1,2", // light rail, heavy rail, commuter rail — bus (3) is left out on
    // purpose: riders already give bus numbers directly ("57", "71"), so a lookup adds no value
    // and would bloat this list with ~150 routes for no benefit.
  });
  return (data.data ?? []).map((r: any) => ({
    id: r.id,
    name: r.attributes.long_name,
    color: r.attributes.color,
  }));
}
