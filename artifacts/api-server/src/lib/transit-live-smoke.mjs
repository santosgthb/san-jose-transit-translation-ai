import { mkdir, writeFile } from "node:fs/promises";
import {
  lookupTransit,
  matchTransit,
  transitSmokeCheck,
} from "./transit-provider.ts";

const destination = "/tmp/transit-live-smoke.json";
const routeQuery = "60";
const stopQuery = "Santa Clara Transit Center";
let report = {
  smokeStartedAt: new Date().toISOString(),
  sampleQuery: { route: routeQuery, stop: stopQuery },
  selectionPolicy:
    "Explicit test selection only: retain the route-22 match requested in the earlier check, then select the single returned route candidate containing the standalone token 60 because the agency-only response showed live route-60 visits at the provider-listed Bay 1 stop. Other bay candidates remain visible. No identifiers are synthesized.",
};
try {
  const catalog = await transitSmokeCheck();
  const originalRoute22Matches = await matchTransit("22", stopQuery);
  const matches = await matchTransit(routeQuery, stopQuery);
  const routeToken = (value, routeNumber) =>
    String(value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .includes(routeNumber);
  const routeCandidates = matches.routes.filter(
    (item) => routeToken(item.id, routeQuery) || routeToken(item.name, routeQuery),
  );
  const route22Candidates = originalRoute22Matches.routes.filter(
    (item) => routeToken(item.id, "22") || routeToken(item.name, "22"),
  );
  const exactStopCandidates = matches.stops.filter(
    (item) => item.name.trim() === `${stopQuery} (Bay 1)`,
  );
  const route = routeCandidates.length === 1 ? routeCandidates[0] : null;
  const stop = exactStopCandidates[0] ?? null;
  const selected = route && stop ? { route, stop } : null;
  const route22Selection =
    route22Candidates.length === 1 && stop
      ? { route: route22Candidates[0], stop }
      : null;
  let context = null;
  if (selected) {
    context = await lookupTransit({
      routeId: selected.route.id,
      stopId: selected.stop.id,
    });
  }
  let route22Context = null;
  if (route22Selection) {
    route22Context = await lookupTransit({
      routeId: route22Selection.route.id,
      stopId: route22Selection.stop.id,
    });
  }
  const arrivals = context?.liveArrivalSnapshot ?? null;
  const alerts = context?.serviceAlertSnapshot ?? null;
  const sourceUrlSafe = (snapshot) =>
    typeof snapshot?.sourceUrl === "string" &&
    !snapshot.sourceUrl.includes("?") &&
    !/api_key|token|password|@/i.test(snapshot.sourceUrl);
  report = {
    ...report,
    operatorCatalogStatus: catalog.operatorCatalogStatus,
    operatorCatalogHttpStatus: catalog.operatorCatalogHttpStatus,
    verifiedOperatorId: context?.operatorId ?? catalog.verifiedOperatorId,
    routeMatchMessage: matches.message,
    originalRoute22Candidates: route22Candidates.slice(0, 10),
    routeCandidateCount: routeCandidates.length,
    stopCandidateCount: exactStopCandidates.length,
    routeCandidates: routeCandidates.slice(0, 10),
    returnedStopMatches: matches.stops.slice(0, 15),
    stopCandidates: exactStopCandidates.slice(0, 10),
    selectedRoute: selected?.route ?? null,
    selectedStop: selected?.stop ?? null,
    lookupCalledWithSelectedIds: selected
      ? { routeId: selected.route.id, stopId: selected.stop.id }
      : null,
    route22AlertCheckSelection: route22Selection
      ? { routeId: route22Selection.route.id, stopId: route22Selection.stop.id }
      : null,
    lookupNotes: context?.notes ?? [],
    sfBay511DataUsed: context?.sfBay511DataUsed ?? catalog.operatorCatalogStatus === "available",
    stopMonitoring: arrivals
      ? {
          status: arrivals.status,
          httpStatus: arrivals.httpStatus ?? null,
          retrievedAt: arrivals.retrievedAt,
          attemptedAt: arrivals.attemptedAt ?? null,
          sourceUrl: arrivals.sourceUrl ?? null,
          sourceUrlCredentialFree: sourceUrlSafe(arrivals),
          queryScope: arrivals.queryScope ?? null,
          queryParameters: arrivals.queryParameters ?? null,
          selectedStop: arrivals.selectedStop ?? null,
          diagnostics: arrivals.diagnostics ?? null,
          normalizedArrivalCount: Array.isArray(arrivals.arrivals) ? arrivals.arrivals.length : 0,
          arrivals: arrivals.arrivals ?? [],
          message: arrivals.message,
        }
      : null,
    serviceAlerts: alerts
      ? {
          status: alerts.status,
          httpStatus: alerts.httpStatus ?? null,
          retrievedAt: alerts.retrievedAt,
          attemptedAt: alerts.attemptedAt ?? null,
          sourceUrl: alerts.sourceUrl ?? null,
          sourceUrlCredentialFree: sourceUrlSafe(alerts),
          normalizedAlertCount: Array.isArray(alerts.alerts) ? alerts.alerts.length : 0,
          alerts: alerts.alerts ?? [],
          message: alerts.message,
        }
      : null,
    route22ServiceAlerts: route22Context?.serviceAlertSnapshot
      ? {
          status: route22Context.serviceAlertSnapshot.status,
          httpStatus: route22Context.serviceAlertSnapshot.httpStatus ?? null,
          retrievedAt: route22Context.serviceAlertSnapshot.retrievedAt,
          attemptedAt: route22Context.serviceAlertSnapshot.attemptedAt ?? null,
          sourceUrl: route22Context.serviceAlertSnapshot.sourceUrl ?? null,
          sourceUrlCredentialFree: sourceUrlSafe(route22Context.serviceAlertSnapshot),
          normalizedAlertCount: Array.isArray(route22Context.serviceAlertSnapshot.alerts)
            ? route22Context.serviceAlertSnapshot.alerts.length
            : 0,
          alerts: route22Context.serviceAlertSnapshot.alerts ?? [],
        }
      : null,
  };
} catch {
  report.failure = "Smoke check did not complete; details omitted.";
}
await mkdir("/tmp", { recursive: true });
await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
process.stdout.write(`Secret-safe transit smoke report written to ${destination}\n`);