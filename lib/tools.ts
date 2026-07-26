import { tool } from "ai";
import { z } from "zod";
import { searchStops, getPredictions, getAlerts, listSubwayRoutes } from "./mbta";

export const findStop = tool({
  description:
    "Look up MBTA stop IDs by name (e.g. 'Harvard', 'Downtown Crossing'). Use this before checking predictions or alerts, since those need a stop ID, not a name.",
  inputSchema: z.object({
    query: z.string().describe("The stop name a rider typed, e.g. 'Alewife'"),
  }),
  execute: async (input: { query: string }) => {
    const { query } = input;
    const stops = await searchStops(query);
    if (stops.length === 0) {
      return { found: false, message: `No stop matched "${query}".` };
    }
    return { found: true, stops };
  },
});

export const checkPredictions = tool({
  description:
    "Get real-time next arrivals/departures for a stop. Requires a stop ID from findStop first.",
  inputSchema: z.object({
    stopId: z.string().describe("MBTA stop ID, from findStop"),
    routeId: z
      .string()
      .optional()
      .describe("Optional MBTA route ID to filter to one line, e.g. 'Red'"),
  }),
  execute: async (input: { stopId: string; routeId?: string }) => {
    const { stopId, routeId } = input;
    const predictions = await getPredictions(stopId, routeId);
    return { stopId, predictions };
  },
});

export const checkAlerts = tool({
  description:
    "Get active service alerts (delays, shuttle buses, outages) for an MBTA route. Route IDs for subway lines are 'Red', 'Orange', 'Blue', 'Mattapan', and 'Green-B'/'Green-C'/'Green-D'/'Green-E'.",
  inputSchema: z.object({
    routeId: z.string().describe("MBTA route ID, e.g. 'Red' or 'Green-B'"),
  }),
  execute: async (input: { routeId: string }) => {
    const { routeId } = input;
    const alerts = await getAlerts(routeId);
    return { routeId, alerts, hasDisruption: alerts.length > 0 };
  },
});

export const listRoutes = tool({
  description:
    "List current MBTA subway and light-rail routes with their IDs. Use this if you're not sure of the exact route ID to pass to checkAlerts or checkPredictions.",
  inputSchema: z.object({}),
  execute: async (_input: {}) => {
    const routes = await listSubwayRoutes();
    return { routes };
  },
});

export const transitTools = {
  findStop,
  checkPredictions,
  checkAlerts,
  listRoutes,
};
