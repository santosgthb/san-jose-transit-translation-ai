export type TransitContext = {
  operatorId: string | null;
  routeId: string | null;
  stopId: string | null;
  routeName: string | null;
  stopName: string | null;
  dataSourcesUsed: string[];
  sfBay511DataUsed: boolean;
  vtaOpenDataUsed: boolean;
  liveArrivalSnapshot: Record<string, unknown>;
  serviceAlertSnapshot: Record<string, unknown>;
  vtaOpenDataSnapshot: Record<string, unknown> | null;
  vtaOpenDataDatasetTitle: string | null;
  vtaOpenDataSourceUrl: string | null;
  vtaOpenDataResourceUrl: string | null;
  sourceRetrievedAt: string | null;
  notes: string[];
};

export type TransitMatch = {
  routes: Array<{ id: string; name: string }>;
  stops: Array<{ id: string; name: string }>;
  message: string;
};

type Snapshot<T> = {
  status:
    | "available"
    | "empty"
    | "unavailable"
    | "not_requested"
    | "unmatched"
    | "ambiguous";
  retrievedAt: string | null;
  message: string;
} & T;

export type TransitEntity = { id: string; name: string; raw?: Record<string, unknown> };
type Entity = TransitEntity;
type CachedValue = { value: unknown; expiresAt: number; retrievedAt: string };

const API_ROOT = "https://api.511.org/transit";
const OPERATORS_ENDPOINT = `${API_ROOT}/operators`;
const ARRIVALS_ENDPOINT = `${API_ROOT}/StopMonitoring`;
const ALERTS_ENDPOINT = `${API_ROOT}/servicealerts`;
const VTA_RESOURCE =
  "https://gis.vta.org/gis/rest/services/Hosted/VTA_Stops_And_Routes_October_2025/FeatureServer";
const VTA_TITLE = "VTA Stops And Routes October 2025";
const VTA_SOURCE_URL =
  "https://data.vta.org/maps/7352d174bede4e8cb400a9eff7efe27e";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const REQUEST_LIMIT = 60;
const TIMEOUT_MS = 8_000;
const cache = new Map<string, CachedValue>();
const inFlight = new Map<string, Promise<unknown>>();
const failedUntil = new Map<string, number>();
const requestTimes: number[] = [];
let last511HttpStatus: number | null = null;
const VTA_METADATA = {
  routes: ["objectid", "lineid", "lineabbr", "linename", "category"],
  stops: ["objectid", "stopname", "routes", "linedirid", "rtid"],
};
const VTA_MAX_PAGES = 100;
const VTA_PAGE_SIZE = 1_000;

class VtaDataError extends Error {}

const nowIso = (): string => new Date().toISOString();
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const object = compact(value);
    const translations =
      object.Translations ?? object.translations ?? object.Translation ?? object.translation;
    if (Array.isArray(translations) && translations.length) {
      const translatedText = first(compact(translations[0]), ["Text", "text"]);
      return translatedText === undefined ? null : text(translatedText);
    }
    const wrapped = first(object, ["Text", "text", "Value", "value"]);
    return wrapped === undefined ? null : text(wrapped);
  }
  const candidate = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().slice(0, 500);
    }
  } catch {
    // Non-URL provider text is sanitized below.
  }
  return candidate
    .replace(/https?:\/\/\S+/gi, (url) => {
      try {
        const parsed = new URL(url);
        parsed.username = "";
        parsed.password = "";
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString();
      } catch {
        return "[link omitted]";
      }
    })
    .replace(/\b(api_key|apikey|token|access_token|password)=\S+/gi, "$1=[redacted]")
    .slice(0, 500);
}

const compact = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function first(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }
  const lower = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function rowsFrom(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(compact).filter((row) => Object.keys(row).length > 0);
  const root = compact(value);
  for (const key of ["Operators", "operators", "Routes", "routes", "Stops", "stops", "ServiceAlerts", "Alerts", "alerts", "Entities", "entities", "MonitoredStopVisit", "features", "data"]) {
    const nested = root[key];
    if (Array.isArray(nested)) return nested.map((item) => compact(item));
  }
  for (const value of Object.values(root)) {
    if (Array.isArray(value) && value.length && typeof value[0] === "object") {
      return value.map((item) => compact(item));
    }
  }
  return Object.keys(root).length ? [root] : [];
}

function entityList(value: unknown, kind: "route" | "stop" | "operator"): Entity[] {
  const rows: Record<string, unknown>[] = [];
  const visit = (node: unknown, depth = 0): void => {
    if (depth > 16) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    const row = compact(node);
    if (!Object.keys(row).length) return;
    const id = first(
      row,
      kind === "route"
        ? ["LineID", "RouteID", "route_id", "id"]
        : kind === "stop"
          ? ["id", "StopID", "StopCode", "stop_code"]
          : ["OperatorID", "operator_id", "id", "Agency"],
    );
    const name = first(row, kind === "stop" ? ["Name", "StopName", "stop_name"] : ["Name", "name", "LineName", "RouteName"]);
    if (text(id) && text(name)) {
      rows.push(row);
      return;
    }
    for (const child of Object.values(row)) {
      if (child && typeof child === "object") visit(child, depth + 1);
    }
  };
  visit(value);
  const entities: Entity[] = [];
  for (const wrapped of rows) {
    const row = compact(wrapped[kind] ?? wrapped[kind[0].toUpperCase() + kind.slice(1)] ?? wrapped);
    const id = text(
      first(
        row,
        kind === "route"
          ? ["LineID", "RouteID", "route_id", "line_id", "id"]
          : kind === "stop"
            ? ["id", "StopID", "StopCode", "stop_code", "stop_id"]
            : ["OperatorID", "operator_id", "id", "Agency"],
      ),
    );
    const name = text(
      first(
        row,
        kind === "route"
          ? ["Name", "RouteName", "route_name", "LineName", "name", "Line"]
          : kind === "stop"
            ? ["Name", "StopName", "stop_name", "Description", "name"]
            : ["Name", "OperatorName", "operator_name", "name"],
      ),
    );
    if (id && name) entities.push({ id, name, raw: row });
  }
  return entities;
}

async function cached<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<{ value: T; retrievedAt: string; cached: boolean }> {
  const at = Date.now();
  const previous = cache.get(key);
  if (previous && previous.expiresAt > at) {
    return { value: previous.value as T, retrievedAt: previous.retrievedAt, cached: true };
  }
  if ((failedUntil.get(key) ?? 0) > at) throw new Error("Transit source is temporarily unavailable");
  const existing = inFlight.get(key);
  if (existing) {
    const result = (await existing) as { value: T; retrievedAt: string };
    return { ...result, cached: true };
  }
  const pending = loader()
    .then((value) => {
      const retrievedAt = nowIso();
      cache.set(key, { value, retrievedAt, expiresAt: Date.now() + CACHE_TTL_MS });
      failedUntil.delete(key);
      return { value, retrievedAt };
    })
    .catch((error: unknown) => {
      failedUntil.set(key, Date.now() + FAILURE_BACKOFF_MS);
      if (error instanceof VtaDataError) throw error;
      throw new Error("Transit source is temporarily unavailable");
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  const result = (await pending) as { value: T; retrievedAt: string };
  return { ...result, cached: false };
}

async function live<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<{ value: T; retrievedAt: string }> {
  if ((failedUntil.get(key) ?? 0) > Date.now()) {
    throw new Error("Transit source is temporarily unavailable");
  }
  const existing = inFlight.get(key);
  if (existing) return (await existing) as { value: T; retrievedAt: string };
  const pending = loader()
    .then((value) => {
      failedUntil.delete(key);
      return { value, retrievedAt: nowIso() };
    })
    .catch(() => {
      failedUntil.set(key, Date.now() + FAILURE_BACKOFF_MS);
      throw new Error("Transit source is temporarily unavailable");
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return (await pending) as { value: T; retrievedAt: string };
}

function spendRequest(): void {
  const now = Date.now();
  while (requestTimes.length && requestTimes[0] <= now - REQUEST_WINDOW_MS) requestTimes.shift();
  if (requestTimes.length >= REQUEST_LIMIT) throw new Error("Transit request budget exhausted");
  requestTimes.push(now);
}

async function fetchJsonWithStatus(
  url: URL,
): Promise<{ value: unknown; httpStatus: number }> {
  spendRequest();
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  last511HttpStatus = response.status;
  if (!response.ok) throw new Error("Transit provider returned an unsuccessful response");
  return { value: await response.json(), httpStatus: response.status };
}

async function fetchJson(url: URL): Promise<unknown> {
  return (await fetchJsonWithStatus(url)).value;
}

function apiUrl(path: string, params: Record<string, string>): URL {
  const key = process.env.SFBAY511_API_KEY?.trim();
  if (!key) throw new Error("SFBay511 API credentials are not configured");
  const url = new URL(`${API_ROOT}/${path}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("format", "json");
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url;
}

async function get511(path: string, params: Record<string, string>): Promise<unknown> {
  return fetchJson(apiUrl(path, params));
}

async function get511WithStatus(
  path: string,
  params: Record<string, string>,
): Promise<{ value: unknown; httpStatus: number }> {
  return fetchJsonWithStatus(apiUrl(path, params));
}

async function getOperators(): Promise<{ entities: Entity[]; retrievedAt: string }> {
  const result = await cached("511:operators", async () =>
    entityList(await get511("operators", {}), "operator"),
  );
  return { entities: result.value, retrievedAt: result.retrievedAt };
}

function findVtaOperator(operators: Entity[]): Entity | undefined {
  const matches = operators.filter((item) =>
    /santa clara valley transportation authority|\bvta\b/i.test(item.name),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function verifiedStopCode(stop: Entity | null): string | null {
  const stopCode = stop ? text(first(stop.raw ?? {}, ["StopCode", "stop_code"])) : null;
  return stopCode && /^\d+$/.test(stopCode) ? stopCode : null;
}

async function getEntities(
  kind: "routes" | "stops",
  operatorId: string,
): Promise<{ entities: Entity[]; retrievedAt: string }> {
  const key = `511:${kind}:${operatorId}`;
  const result = await cached(key, async () =>
    entityList(
      await get511(kind === "routes" ? "lines" : "stops", { operator_id: operatorId }),
      kind === "routes" ? "route" : "stop",
    ),
  );
  return { entities: result.value, retrievedAt: result.retrievedAt };
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchEntities(items: Entity[], query?: string): Entity[] {
  if (!query?.trim()) return items;
  const needle = normalizeText(query);
  return items.filter(
    (item) =>
      normalizeText(item.name).includes(needle) ||
      normalizeText(item.id) === needle ||
      normalizeText(item.name) === needle,
  );
}

const unavailableSnapshot = <T extends Record<string, unknown>>(
  message: string,
  field: T,
): Snapshot<T> => ({ status: "unavailable", retrievedAt: null, message, ...field });
function parseTime(value: unknown): number | null {
  if (typeof value === "number" && value > 0) return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function unwrapAlert(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    ...compact(row.ServiceAlert ?? row.serviceAlert ?? row.Alert ?? row),
  };
}

function normalizeAlerts(
  value: unknown,
  routeId: string | null,
  stopId: string | null,
  operatorId: string | null,
): Array<Record<string, unknown>> {
  const now = Date.now();
  const results: Array<Record<string, unknown>> = [];
  for (const item of rowsFrom(value)) {
    const row = unwrapAlert(item);
    const header = text(first(row, ["HeaderText", "header", "Summary", "summary", "Title", "title"]));
    const description = text(first(row, ["DescriptionText", "description", "Description", "text"]));
    const rawSelectors =
      row.Affects ??
      row.affects ??
      row.InformedEntities ??
      row.informedEntities ??
      row.InformedEntity ??
      row.informedEntity ??
      row.AffectedVehicleJourneys ??
      row.affectedVehicleJourneys;
    const selectors = Array.isArray(rawSelectors)
      ? rawSelectors.map(compact)
      : rawSelectors
        ? [compact(rawSelectors)]
        : [];
    const routeIds = new Set<string>();
    const stopIds = new Set<string>();
    const agencyIds = new Set<string>();
    const collectSelectors = (
      item: unknown,
      depth = 0,
      targetRouteIds = routeIds,
      targetStopIds = stopIds,
      targetAgencyIds = agencyIds,
    ): void => {
      if (depth > 5) return;
      if (Array.isArray(item)) {
        for (const child of item) {
          collectSelectors(child, depth + 1, targetRouteIds, targetStopIds, targetAgencyIds);
        }
        return;
      }
      const selector = compact(item);
      if (!Object.keys(selector).length) return;
      const route = text(first(selector, ["RouteID", "route_id", "RouteRef", "LineRef", "RouteId", "routeId", "lineId"]));
      const stop = text(first(selector, ["StopCode", "stop_code", "StopRef", "StopPointRef", "StopID", "StopId", "stopId"]));
      const agency = text(first(selector, ["AgencyId", "AgencyID", "agency_id"]));
      if (route) targetRouteIds.add(route);
      if (stop) targetStopIds.add(stop);
      if (agency) targetAgencyIds.add(agency);
      for (const nested of Object.values(selector)) {
        if (nested && typeof nested === "object") {
          collectSelectors(nested, depth + 1, targetRouteIds, targetStopIds, targetAgencyIds);
        }
      }
    };
    let hasAgencyWideSelector = false;
    for (const selector of selectors) {
      const selectorRoutes = new Set<string>();
      const selectorStops = new Set<string>();
      const selectorAgencies = new Set<string>();
      collectSelectors(selector, 0, selectorRoutes, selectorStops, selectorAgencies);
      for (const id of selectorRoutes) routeIds.add(id);
      for (const id of selectorStops) stopIds.add(id);
      for (const id of selectorAgencies) agencyIds.add(id);
      if (
        !!operatorId &&
        selectorAgencies.has(operatorId) &&
        selectorRoutes.size === 0 &&
        selectorStops.size === 0
      ) {
        hasAgencyWideSelector = true;
      }
    }
    const directRouteIds = first(row, ["routeIds", "RouteIDs"]);
    for (const id of Array.isArray(directRouteIds) ? directRouteIds : []) {
      const safe = text(id);
      if (safe) routeIds.add(safe);
    }
    const directStopIds = first(row, ["stopIds", "StopIDs"]);
    for (const id of Array.isArray(directStopIds) ? directStopIds : []) {
      const safe = text(id);
      if (safe) stopIds.add(safe);
    }
    const rawPeriods = first(row, ["ActivePeriods", "ActivePeriod", "activePeriods"]);
    const periods = Array.isArray(rawPeriods)
      ? rawPeriods.map(compact)
      : rawPeriods
        ? [compact(rawPeriods)]
        : [];
    const activePeriods = periods
      .map((period) => ({
        start: text(first(period, ["StartTime", "Start", "start", "startTime"])),
        end: text(first(period, ["EndTime", "End", "end", "endTime"])),
      }))
      .filter((period) => period.start || period.end);
    if (
      activePeriods.length &&
      !activePeriods.some((period) => {
        const start = parseTime(period.start);
        const end = parseTime(period.end);
        return (start === null || start <= now) && (end === null || end >= now);
      })
    ) {
      continue;
    }
    const agencyApplies = !!operatorId && agencyIds.has(operatorId);
    const agencyWide =
      (routeIds.size === 0 && stopIds.size === 0 && selectors.length === 0) ||
      hasAgencyWideSelector;
    if (agencyIds.size > 0 && !agencyApplies) continue;
    const applicable =
      agencyWide ||
      (!!routeId && routeIds.has(routeId)) ||
      (!!stopId && stopIds.has(stopId));
    if (!applicable) continue;
    results.push({
      id: text(first(row, ["Id", "id", "AlertID", "alert_id"])),
      header,
      description,
      url: text(first(row, ["URL", "Url", "url", "AlertURL"])),
      routeIds: [...routeIds],
      stopIds: [...stopIds],
      activePeriods,
    });
  }
  return results;
}

function nestedRecords(
  value: unknown,
  depth = 0,
  inherited: {
    monitored?: boolean;
    monitoringRef?: string | null;
    recordedAt?: string | null;
  } = {},
): Record<string, unknown>[] {
  if (depth > 12) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => nestedRecords(item, depth + 1, inherited));
  }
  const row = compact(value);
  if (!Object.keys(row).length) return [];
  const monitored = normalizeBoolean(row.Monitored) ?? inherited.monitored;
  const monitoringRef = text(first(row, ["MonitoringRef", "monitoringRef"])) ?? inherited.monitoringRef;
  const recordedAt =
    text(first(row, ["RecordedAtTime", "recordedAtTime"])) ?? inherited.recordedAt;
  if (
    first(row, [
      "MonitoredVehicleJourney",
      "monitoredVehicleJourney",
      "MonitoredStopVisit",
    ]) !== undefined
  ) {
    const child =
      row.MonitoredVehicleJourney ?? row.monitoredVehicleJourney ?? row.MonitoredStopVisit;
    return nestedRecords(child, depth + 1, { monitored, monitoringRef, recordedAt });
  }
  if (row.MonitoredCall || row.monitoredCall) {
    return [{ ...row, Monitored: monitored, MonitoringRef: monitoringRef, RecordedAtTime: recordedAt }];
  }
  const next = Object.values(row).filter((item) => item && typeof item === "object");
  return next.flatMap((item) =>
    nestedRecords(item, depth + 1, { monitored, monitoringRef, recordedAt }),
  );
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function normalizeArrivals(
  value: unknown,
  selectedStopId?: string | null,
  allowedLineIds?: Set<string>,
): Array<Record<string, unknown>> {
  const now = Date.now();
  const latest = now + 24 * 60 * 60 * 1000;
  const results: Array<Record<string, unknown>> = [];
  for (const row of nestedRecords(value)) {
    const call = compact(row.MonitoredCall ?? row.monitoredCall);
    const recordedAt = parseTime(first(row, ["RecordedAtTime", "recordedAtTime"]));
    if (recordedAt !== null && recordedAt < now - 30 * 60 * 1000) continue;
    const monitoredAtStop = text(first(row, ["MonitoringRef", "StopPointRef", "stopId"]));
    const callStop = text(first(call, ["StopPointRef", "MonitoringRef"]));
    const stopRefs = [monitoredAtStop, callStop].filter((ref): ref is string => ref !== null);
    if (
      !selectedStopId ||
      !stopRefs.length ||
      !stopRefs.every((ref) => ref === selectedStopId)
    ) {
      continue;
    }
    const aimed = text(first(call, ["AimedArrivalTime", "aimedArrivalTime"]));
    const expected = text(first(call, ["ExpectedArrivalTime", "expectedArrivalTime"]));
    const departureExpected = text(first(call, ["ExpectedDepartureTime", "expectedDepartureTime"]));
    const effective = parseTime(expected ?? departureExpected ?? aimed);
    if (effective === null || effective < now || effective > latest) continue;
    const journey = compact(row);
    const lineId = text(first(journey, ["LineRef", "LineID", "lineId"]));
    if (!lineId || !allowedLineIds?.has(lineId)) continue;
    results.push({
      routeName: text(first(journey, ["PublishedLineName", "LineName", "routeName", "name"])),
      lineId,
      destination: text(first(journey, ["DestinationName", "destination", "DestinationDisplay"])),
      expectedArrivalTime: expected,
      expectedDepartureTime: departureExpected,
      aimedArrivalTime: aimed,
      monitored: normalizeBoolean(first(journey, ["Monitored", "monitored"])),
    });
  }
  return results;
}

function arrivalResponseDiagnostics(
  value: unknown,
  selectedStopId: string,
  allowedLineIds?: Set<string>,
): Record<string, unknown> {
  const rows = nestedRecords(value);
  const matchingRows = rows.filter((row) => {
    const call = compact(row.MonitoredCall ?? row.monitoredCall);
    const refs = [
      text(first(row, ["MonitoringRef", "StopPointRef", "stopId"])),
      text(first(call, ["StopPointRef", "MonitoringRef"])),
    ].filter((ref): ref is string => ref !== null);
    return refs.length > 0 && refs.every((ref) => ref === selectedStopId);
  });
  const refs = new Set<string>();
  const lineRefs = new Set<string>();
  for (const row of rows) {
    const call = compact(row.MonitoredCall ?? row.monitoredCall);
    for (const ref of [
      text(first(row, ["MonitoringRef", "StopPointRef", "stopId"])),
      text(first(call, ["StopPointRef", "MonitoringRef"])),
    ]) {
      if (ref) refs.add(ref);
    }
    const lineRef = text(first(row, ["LineRef", "LineID", "lineId"]));
    if (lineRef) lineRefs.add(lineRef);
  }
  const topLevel = compact(value);
  const firstRow = rows[0] ?? {};
  const firstCall = compact(firstRow.MonitoredCall ?? firstRow.monitoredCall);
  const matchingStopSamples = matchingRows.slice(0, 10).map((row) => {
    const call = compact(row.MonitoredCall ?? row.monitoredCall);
    const lineRef = text(first(row, ["LineRef", "LineID", "lineId"]));
    const aimed = text(first(call, ["AimedArrivalTime", "aimedArrivalTime"]));
    const expected = text(first(call, ["ExpectedArrivalTime", "expectedArrivalTime"]));
    const expectedDeparture = text(
      first(call, ["ExpectedDepartureTime", "expectedDepartureTime"]),
    );
    const effective = parseTime(expected ?? expectedDeparture ?? aimed);
    const recordedAt = parseTime(first(row, ["RecordedAtTime", "recordedAtTime"]));
    return {
      monitoringRef: text(first(row, ["MonitoringRef", "StopPointRef", "stopId"])),
      stopPointRef: text(first(call, ["StopPointRef", "MonitoringRef"])),
      lineRef,
      routeAliasMatch: !!lineRef && !!allowedLineIds?.has(lineRef),
      monitored: normalizeBoolean(first(row, ["Monitored", "monitored"])),
      recordedAt: text(first(row, ["RecordedAtTime", "recordedAtTime"])),
      recordedAtFresh: recordedAt === null || recordedAt >= Date.now() - 30 * 60 * 1000,
      aimedArrivalTime: aimed,
      expectedArrivalTime: expected,
      expectedDepartureTime: expectedDeparture,
      effectiveArrivalFuture:
        effective !== null && effective >= Date.now() && effective <= Date.now() + 24 * 60 * 60 * 1000,
    };
  });
  return {
    sourceRecordCount: rows.length,
    matchingStopRecordCount: matchingRows.length,
    sourceResponseKeys: Object.keys(topLevel).slice(0, 20),
    sourceRecordKeys: Object.keys(firstRow).slice(0, 30),
    sourceCallKeys: Object.keys(firstCall).slice(0, 30),
    observedStopRefs: [...refs].slice(0, 20),
    observedLineRefs: [...lineRefs].slice(0, 20),
    matchingStopAndRouteRecordCount: matchingRows.filter((row) => {
      const lineRef = text(first(row, ["LineRef", "LineID", "lineId"]));
      return !!lineRef && !!allowedLineIds?.has(lineRef);
    }).length,
    matchingStopSamples,
  };
}

async function getVtaContext(routeQuery?: string, stopQuery?: string): Promise<{
  snapshot: Record<string, unknown>;
  retrievedAt: string;
}> {
  const attemptedAt = nowIso();
  const result = await cached("vta:october-2025", async () => {
    const layerRows: Record<string, Record<string, unknown>[]> = {};
    const verifiedLayers: Record<string, string> = {};
    const verifiedFields: Record<string, Array<Record<string, unknown>>> = {};
    for (const [layer, name, fields] of [
      [0, "stops", VTA_METADATA.stops],
      [1, "routes", VTA_METADATA.routes],
    ] as const) {
      const metadataUrl = new URL(`${VTA_RESOURCE}/${layer}`);
      metadataUrl.searchParams.set("f", "pjson");
      const metadataResponse = await fetch(metadataUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!metadataResponse.ok) throw new Error("VTA layer metadata was unavailable");
      const metadata = compact(await metadataResponse.json());
      const layerName = text(metadata.name);
      const actualFields = Array.isArray(metadata.fields)
        ? metadata.fields.map(compact)
        : [];
      const actualFieldNames = actualFields
        .map((field) => text(field.name))
        .filter((field): field is string => field !== null);
      if (!layerName || fields.some((field) => !actualFieldNames.includes(field))) {
        throw new VtaDataError("VTA open-data metadata did not match the expected public dataset.");
      }
      verifiedLayers[name] = layerName;
      verifiedFields[name] = actualFields.map((field) => ({
        name: text(field.name),
        alias: text(field.alias),
        type: text(field.type),
      }));
      const configuredPageSize = Number(metadata.maxRecordCount);
      const pageSize =
        Number.isFinite(configuredPageSize) && configuredPageSize > 0
          ? Math.min(configuredPageSize, VTA_PAGE_SIZE)
          : VTA_PAGE_SIZE;
      const countUrl = new URL(`${VTA_RESOURCE}/${layer}/query`);
      countUrl.searchParams.set("where", "1=1");
      countUrl.searchParams.set("returnCountOnly", "true");
      countUrl.searchParams.set("returnGeometry", "false");
      countUrl.searchParams.set("f", "json");
      const countResponse = await fetch(countUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!countResponse.ok) throw new Error("VTA open-data count query was unsuccessful");
      const countPayload = compact(await countResponse.json());
      const expectedCount = Number(countPayload.count);
      if (
        countPayload.error ||
        !Number.isInteger(expectedCount) ||
        expectedCount < 0 ||
        expectedCount > pageSize * VTA_MAX_PAGES
      ) {
        throw new VtaDataError(
          "VTA open-data feature count could not be completely retrieved within the pagination bound.",
        );
      }
      const rows = await collectArcGisRows(pageSize, async (offset, count) => {
        const url = new URL(`${VTA_RESOURCE}/${layer}/query`);
        url.searchParams.set("where", "1=1");
        url.searchParams.set("outFields", fields.join(","));
        url.searchParams.set("returnGeometry", "false");
        url.searchParams.set("orderByFields", "objectid ASC");
        url.searchParams.set("resultOffset", String(offset));
        url.searchParams.set("resultRecordCount", String(count));
        url.searchParams.set("f", "json");
        const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!response.ok) throw new Error("VTA open-data source returned an unsuccessful response");
        const payload = compact(await response.json());
        if (payload.error || !Array.isArray(payload.features)) {
          throw new VtaDataError("VTA open-data feature query was incomplete; historical context was omitted.");
        }
        return {
          features: payload.features,
          exceededTransferLimit: payload.exceededTransferLimit === true,
        };
      });
      if (rows.length !== expectedCount) {
        throw new VtaDataError(
          "VTA open-data feature pages did not match the source record count; historical context was omitted.",
        );
      }
      layerRows[name] = rows;
    }
    return {
      rows: layerRows,
      verifiedLayers,
      verifiedFields,
    };
  });
  const snapshot = buildVtaSnapshot(
    result.value,
    routeQuery,
    stopQuery,
    result.retrievedAt,
    attemptedAt,
  );
  return { snapshot, retrievedAt: result.retrievedAt };
}

async function collectArcGisRows(
  pageSize: number,
  loadPage: (
    offset: number,
    count: number,
  ) => Promise<{ features: unknown[]; exceededTransferLimit: boolean }>,
  maxPages = VTA_MAX_PAGES,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const seenObjectIds = new Set<string>();
  let offset = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await loadPage(offset, pageSize);
    const pageRows = result.features.map((feature) => compact(compact(feature).attributes));
    for (const row of pageRows) {
      const objectId = text(row.objectid);
      if (!objectId || seenObjectIds.has(objectId)) {
        throw new VtaDataError("VTA open-data pagination did not produce complete unique records.");
      }
      seenObjectIds.add(objectId);
      rows.push(row);
    }
    const hasMore = result.exceededTransferLimit || pageRows.length >= pageSize;
    if (!hasMore) return rows;
    if (!pageRows.length) {
      throw new VtaDataError("VTA open-data pagination stopped before all records were retrieved.");
    }
    offset += pageRows.length;
  }
  throw new VtaDataError(
    "VTA open-data features were incomplete because pagination exceeded its bounded limit.",
  );
}

function buildVtaSnapshot(
  source: {
    rows: Record<string, Record<string, unknown>[]>;
    verifiedLayers: Record<string, string>;
    verifiedFields: Record<string, Array<Record<string, unknown>>>;
  },
  routeQuery: string | undefined,
  stopQuery: string | undefined,
  retrievedAt: string,
  attemptedAt: string,
): Record<string, unknown> {
  const routeTerm = routeQuery?.trim() ?? "";
  const stopTerm = stopQuery?.trim() ?? "";
  const numericRoute = /^\d+$/.test(routeTerm);
  const routes = routeTerm
    ? (source.rows.routes ?? [])
        .filter((row) => {
          if (numericRoute) return String(row.lineabbr ?? "").trim() === routeTerm;
          return normalizeText(`${row.lineabbr ?? ""} ${row.linename ?? ""}`).includes(
            normalizeText(routeTerm),
          );
        })
        .slice(0, 10)
        .map((row) => ({
          lineId: row.lineid,
          lineAbbr: text(row.lineabbr),
          lineName: text(row.linename),
          category: text(row.category),
          historicalOnly: true,
        }))
    : [];
  const stops = stopTerm
    ? (source.rows.stops ?? [])
        .filter((row) => normalizeText(String(row.stopname ?? "")).includes(normalizeText(stopTerm)))
        .slice(0, 10)
        .map((row) => ({
          objectId: row.objectid,
          stopName: text(row.stopname),
          routes: text(row.routes),
          lineDirId: text(row.linedirid),
          rtid: row.rtid,
          historicalOnly: true,
        }))
    : [];
  return {
    status: routes.length || stops.length ? "available" : "empty",
    retrievedAt,
    attemptedAt,
    message:
      "Historical VTA October 2025 context only; not evidence of current service or arrivals.",
    datasetTitle: VTA_TITLE,
    sourceUrl: VTA_SOURCE_URL,
    resourceUrl: VTA_RESOURCE,
    verifiedLayers: source.verifiedLayers,
    verifiedFields: source.verifiedFields,
    routes,
    stops,
  };
}

function notRequestedVtaSnapshot(): Record<string, unknown> {
  return {
    status: "not_requested",
    retrievedAt: null,
    attemptedAt: null,
    message: "Historical VTA context was not queried because no route or stop was supplied.",
    datasetTitle: VTA_TITLE,
    sourceUrl: VTA_SOURCE_URL,
    resourceUrl: VTA_RESOURCE,
    routes: [],
    stops: [],
  };
}

function matchMessage(routes: Entity[], stops: Entity[]): string {
  if (routes.length > 1 || stops.length > 1) return "More than one provider result matched; choose a specific route and stop.";
  if (routes.length || stops.length) return "Provider matches found. Confirm the specific route and stop before live lookup.";
  return "No verified provider match was found for the supplied route or stop.";
}

export async function matchTransit(route: string, stop: string): Promise<TransitMatch> {
  try {
    const ops = await getOperators();
    const operator = findVtaOperator(ops.entities);
    if (!operator) {
      return {
        routes: [],
        stops: [],
        message: ops.entities.length
          ? "The 511 operator catalog did not identify a unique Santa Clara Valley Transportation Authority operator."
          : "The 511 operator catalog did not provide verifiable operators.",
      };
    }
    const [routes, stops] = await Promise.all([
      getEntities("routes", operator.id),
      getEntities("stops", operator.id),
    ]);
    const routeMatches = matchEntities(routes.entities, route);
    const stopMatches = matchEntities(stops.entities, stop);
    return {
      routes: routeMatches.map(({ id, name }) => ({ id, name })),
      stops: stopMatches.map(({ id, name }) => ({ id, name })),
      message: matchMessage(routeMatches, stopMatches),
    };
  } catch {
    return {
      routes: [],
      stops: [],
      message: "511 transit matching is temporarily unavailable; no route or stop was inferred.",
    };
  }
}

// Reuse the verified, cached 511 catalog; never hardcode station or route IDs.
export async function getTransitReference() {
  const operators = await getOperators();
  const operator = findVtaOperator(operators.entities);
  if (!operator) throw new Error("No verified VTA operator");
  const [routes, stops] = await Promise.all([
    getEntities("routes", operator.id),
    getEntities("stops", operator.id),
  ]);
  return { operatorId: operator.id, routes: routes.entities, stops: stops.entities };
}

export async function getDeparturePayload(input: {
  operatorId: string; stop: TransitEntity; source: "live" | "scheduled";
  startTime: string; endTime: string;
}) {
  if (input.source === "scheduled") {
    const result = await cached(
      `511:timetable:${input.operatorId}:${input.stop.id}:${input.startTime}`,
      () => get511WithStatus("stoptimetable", {
        OperatorRef: input.operatorId, MonitoringRef: input.stop.id,
        StartTime: input.startTime, EndTime: input.endTime,
      }),
    );
    return { ...result.value, retrievedAt: result.retrievedAt };
  }
  const stopCode = verifiedStopCode(input.stop);
  const params: Record<string, string> = stopCode
    ? { agency: input.operatorId, stopCode }
    : { agency: input.operatorId };
  const result = await live(`511:arrivals:${input.operatorId}:${stopCode ? `stopCode:${stopCode}` : "agency"}`,
    () => get511WithStatus("StopMonitoring", params));
  return { ...result.value, retrievedAt: result.retrievedAt };
}

export async function lookupTransit(input: {
  route?: string;
  stop?: string;
  routeId?: string;
  stopId?: string;
}): Promise<TransitContext> {
  const notes: string[] = [];
  const dataSourcesUsed: string[] = [];
  let sfBay511DataUsed = false;
  let vtaOpenDataUsed = false;
  let operatorId: string | null = null;
  let routeId: string | null = null;
  let stopId: string | null = null;
  let stopResolutionStatus: "unmatched" | "ambiguous" | null = null;
  let routeResolutionStatus: "unmatched" | "ambiguous" | null = null;
  let routeName: string | null = null;
  let stopName: string | null = null;
  let vtaOpenDataSnapshot: Record<string, unknown> | null = null;
  let sourceRetrievedAt: string | null = null;
  let liveArrivalSnapshot: Record<string, unknown> = {
    status: "not_requested",
    retrievedAt: null,
    attemptedAt: null,
    sourceUrl: ARRIVALS_ENDPOINT,
    message: "Live arrival lookup requires a verified, unambiguous stop selection.",
    arrivals: [],
  };
  let serviceAlertSnapshot: Record<string, unknown> = {
    status: "not_requested",
    retrievedAt: null,
    attemptedAt: null,
    sourceUrl: ALERTS_ENDPOINT,
    message: "Service alerts are queried only during a submitted transit lookup.",
    alerts: [],
  };
  const retrievedTimestamps: string[] = [];
  let operatorAttemptedAt: string | null = null;

  try {
    operatorAttemptedAt = nowIso();
    const operators = await getOperators();
    retrievedTimestamps.push(operators.retrievedAt);
    if (operators.entities.length || cache.has("511:operators")) {
      sfBay511DataUsed = true;
      if (!dataSourcesUsed.includes("511.org Transit API")) dataSourcesUsed.push("511.org Transit API");
    }
    const operator = findVtaOperator(operators.entities);
    if (operator) operatorId = operator.id;
    else notes.push("No unique VTA operator was verified from the live 511 operators catalog; no operator ID was guessed.");

    if (operatorId) {
      const [routeResult, stopResult] = await Promise.allSettled([
        getEntities("routes", operatorId),
        getEntities("stops", operatorId),
      ]);
      const routes = routeResult.status === "fulfilled" ? routeResult.value.entities : [];
      const stops = stopResult.status === "fulfilled" ? stopResult.value.entities : [];
      for (const result of [routeResult, stopResult]) {
        if (result.status === "fulfilled") {
          retrievedTimestamps.push(result.value.retrievedAt);
          sfBay511DataUsed = true;
          if (!dataSourcesUsed.includes("511.org Transit API")) dataSourcesUsed.push("511.org Transit API");
        } else {
          notes.push("The live 511 route or stop catalog could not be retrieved.");
        }
      }
      const routeById = input.routeId ? routes.filter((item) => item.id === input.routeId) : [];
      const stopById = input.stopId ? stops.filter((item) => item.id === input.stopId) : [];
      const routeCandidates = input.route ? matchEntities(routes, input.route) : routes;
      const stopCandidates = input.stop ? matchEntities(stops, input.stop) : stops;
      let selectedRoute: Entity | null = null;
      let selectedStop: Entity | null = null;
      if (input.routeId) {
        if (routeById.length === 1) {
          selectedRoute = routeById[0];
          routeName = selectedRoute.name;
          routeId = selectedRoute.id;
        }
        else {
          routeResolutionStatus = "unmatched";
          notes.push(
            `The selected route ID was not verified in the live operator catalog; it was not used. Route candidates: ${routes
              .slice(0, 8)
              .map((item) => `${item.id} — ${item.name}`)
              .join("; ") || "none"}.`,
          );
        }
      } else if (input.route?.trim()) {
        if (routeCandidates.length === 1) {
          selectedRoute = routeCandidates[0];
          routeName = selectedRoute.name;
          routeId = selectedRoute.id;
        }
        else if (routeCandidates.length > 1) {
          routeResolutionStatus = "ambiguous";
          notes.push(
            `The route text matched multiple live routes; select a route ID to disambiguate. Candidates: ${routeCandidates
              .slice(0, 8)
              .map((item) => `${item.id} — ${item.name}`)
              .join("; ")}.`,
          );
        }
        else {
          routeResolutionStatus = "unmatched";
          notes.push("The route text did not match a live 511 route.");
        }
      }
      if (input.stopId) {
        if (stopById.length === 1) {
          selectedStop = stopById[0];
          stopName = selectedStop.name;
          stopId = selectedStop.id;
        }
        else {
          stopResolutionStatus = "unmatched";
          notes.push(
            `The selected stop ID was not verified in the live operator catalog; it was not used. Stop candidates: ${stops
              .slice(0, 8)
              .map((item) => `${item.id} — ${item.name}`)
              .join("; ") || "none"}.`,
          );
        }
      } else if (input.stop?.trim()) {
        if (stopCandidates.length === 1) {
          selectedStop = stopCandidates[0];
          stopName = selectedStop.name;
          stopId = selectedStop.id;
        }
        else if (stopCandidates.length > 1) {
          stopResolutionStatus = "ambiguous";
          notes.push(
            `The stop text matched multiple live stops; select a stop ID to disambiguate. Candidates: ${stopCandidates
              .slice(0, 8)
              .map((item) => `${item.id} — ${item.name}`)
              .join("; ")}.`,
          );
        } else {
          stopResolutionStatus = "unmatched";
          notes.push("The stop text did not match a live 511 stop.");
        }
      }
      const stopCode = verifiedStopCode(selectedStop);
      if (stopId && !stopCode) {
        notes.push(
          "The verified stop record did not include an explicit numeric StopCode; StopMonitoring was queried by agency only and its response is restricted to the exact verified stop reference.",
        );
      }

      if (stopId && !routeResolutionStatus) {
        const attemptedAt = nowIso();
        const queryScope = stopCode ? "stopCode" : "agency_filtered_by_verified_stop";
        const requestParams: Record<string, string> = stopCode
          ? { agency: operatorId!, stopCode }
          : { agency: operatorId! };
        const requestKey = stopCode
          ? `511:arrivals:${operatorId}:stopCode:${stopCode}`
          : `511:arrivals:${operatorId}:agency`;
        try {
          const monitored = await live(requestKey, () =>
            get511WithStatus("StopMonitoring", requestParams),
          );
          retrievedTimestamps.push(monitored.retrievedAt);
          const routeSource = selectedRoute ? [selectedRoute] : routes;
          const allowedLineIds = new Set<string>();
          for (const candidate of routeSource) {
            const raw = candidate.raw ?? {};
            for (const lineId of [
              candidate.id,
              text(first(raw, ["SiriLineRef", "lineRef", "LineRef"])),
              text(first(raw, ["PublicCode", "publicCode"])),
            ]) {
              if (lineId) allowedLineIds.add(lineId);
            }
          }
          const diagnostics = arrivalResponseDiagnostics(
            monitored.value.value,
            stopId,
            allowedLineIds,
          );
          const arrivals = normalizeArrivals(monitored.value.value, stopId, allowedLineIds);
          liveArrivalSnapshot = {
            status: arrivals.length ? "available" : "empty",
            retrievedAt: monitored.retrievedAt,
            attemptedAt,
            httpStatus: monitored.value.httpStatus,
            sourceUrl: ARRIVALS_ENDPOINT,
            queryScope,
            queryParameters: { ...requestParams, format: "json" },
            selectedStop: { id: stopId, name: stopName },
            diagnostics,
            message: arrivals.length
              ? `Current monitored arrivals retrieved for verified stop ${stopId}.`
              : `No current arrivals matched verified stop ${stopId}; the provider returned ${diagnostics.sourceRecordCount} monitoring record(s).`,
            arrivals,
          };
          sfBay511DataUsed = true;
          if (!dataSourcesUsed.includes("511.org Transit API")) dataSourcesUsed.push("511.org Transit API");
        } catch {
          liveArrivalSnapshot = unavailableSnapshot(
            "Live arrivals are temporarily unavailable.",
            {
              arrivals: [],
              attemptedAt,
              sourceUrl: ARRIVALS_ENDPOINT,
              queryScope,
              queryParameters: { ...requestParams, format: "json" },
              selectedStop: { id: stopId, name: stopName },
            },
          );
        }
      } else if (input.stopId || input.stop) {
        liveArrivalSnapshot = {
          status: stopResolutionStatus ?? routeResolutionStatus ?? "unmatched",
          retrievedAt: null,
          attemptedAt: null,
          sourceUrl: ARRIVALS_ENDPOINT,
          message: routeResolutionStatus
            ? "No live arrival request was made because the selected route was not verified unambiguously."
            : "No live arrival request was made because the stop was not verified unambiguously.",
          arrivals: [],
        };
      }

      const alertAttemptedAt = nowIso();
      try {
        const result = await live(`511:alerts:${operatorId}`, () =>
          get511WithStatus("servicealerts", { agency: operatorId!, format: "json" }),
        );
        retrievedTimestamps.push(result.retrievedAt);
        const alerts = normalizeAlerts(result.value.value, routeId, stopId, operatorId);
        serviceAlertSnapshot = {
          status: alerts.length ? "available" : "empty",
          retrievedAt: result.retrievedAt,
          attemptedAt: alertAttemptedAt,
          httpStatus: result.value.httpStatus,
          sourceUrl: ALERTS_ENDPOINT,
          message: alerts.length
            ? "Applicable service alerts retrieved."
            : "No alerts matched the selected route or stop, or the agency returned no applicable alerts; this is not a claim that the agency has no disruptions.",
          alerts,
        };
        sfBay511DataUsed = true;
        if (!dataSourcesUsed.includes("511.org Transit API")) dataSourcesUsed.push("511.org Transit API");
      } catch {
        serviceAlertSnapshot = unavailableSnapshot(
          "Live service alerts are temporarily unavailable.",
          { alerts: [], attemptedAt: alertAttemptedAt, sourceUrl: ALERTS_ENDPOINT },
        );
      }
    } else {
      notes.push("Live arrivals and alerts were skipped because the operator could not be verified.");
      liveArrivalSnapshot = {
        status: "unmatched",
        retrievedAt: operators.retrievedAt,
        attemptedAt: operatorAttemptedAt,
        sourceUrl: OPERATORS_ENDPOINT,
        message: "Live arrivals require a verified operator and stop.",
        arrivals: [],
      };
      serviceAlertSnapshot = {
        status: "unmatched",
        retrievedAt: operators.retrievedAt,
        attemptedAt: operatorAttemptedAt,
        sourceUrl: OPERATORS_ENDPOINT,
        message: "Live service alerts require a verified operator.",
        alerts: [],
      };
    }
  } catch {
    notes.push("The live 511 operator catalog could not be verified; provider IDs were not guessed.");
    liveArrivalSnapshot = unavailableSnapshot(
      "The live operator catalog is temporarily unavailable.",
      { arrivals: [], attemptedAt: operatorAttemptedAt, sourceUrl: OPERATORS_ENDPOINT },
    );
    serviceAlertSnapshot = unavailableSnapshot(
      "Service alerts require a verified operator.",
      { alerts: [], attemptedAt: operatorAttemptedAt, sourceUrl: OPERATORS_ENDPOINT },
    );
  }

  if (input.route?.trim() || input.stop?.trim()) {
    const vtaAttemptedAt = nowIso();
    try {
      const vta = await getVtaContext(input.route, input.stop);
      vtaOpenDataSnapshot = vta.snapshot;
      retrievedTimestamps.push(vta.retrievedAt);
      vtaOpenDataUsed = true;
      dataSourcesUsed.push("VTA Open Data (historical static context)");
      notes.push("VTA Open Data is October 2025 historical context only and was not used to verify current service, operator IDs, stops, or arrivals.");
    } catch (error) {
      const failureMessage =
        error instanceof VtaDataError
          ? error.message
          : "VTA Open Data is temporarily unavailable.";
      notes.push(failureMessage);
      vtaOpenDataSnapshot = {
        status: "unavailable",
        retrievedAt: null,
        attemptedAt: vtaAttemptedAt,
        message: failureMessage,
        datasetTitle: VTA_TITLE,
        sourceUrl: VTA_SOURCE_URL,
        resourceUrl: VTA_RESOURCE,
        routes: [],
        stops: [],
      };
    }
  } else {
    vtaOpenDataSnapshot = notRequestedVtaSnapshot();
  }
  sourceRetrievedAt =
    retrievedTimestamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  return {
    operatorId,
    routeId,
    stopId,
    routeName,
    stopName,
    dataSourcesUsed,
    sfBay511DataUsed,
    vtaOpenDataUsed,
    liveArrivalSnapshot,
    serviceAlertSnapshot,
    vtaOpenDataSnapshot,
    vtaOpenDataDatasetTitle: VTA_TITLE,
    vtaOpenDataSourceUrl: VTA_SOURCE_URL,
    vtaOpenDataResourceUrl: VTA_RESOURCE,
    sourceRetrievedAt,
    notes,
  };
}

// Exported pure normalizers allow deterministic fixture-based checks without external API calls.
export const transitTestHelpers = {
  entityList,
  normalizeAlerts,
  normalizeArrivals,
  arrivalResponseDiagnostics,
  findVtaOperator,
  normalizeText,
  verifiedStopCode,
  buildVtaSnapshot,
  notRequestedVtaSnapshot,
  collectArcGisRows,
};

export async function transitSmokeCheck(): Promise<Record<string, unknown>> {
  let operators: Entity[] = [];
  let operatorCatalogStatus: "available" | "unavailable" = "unavailable";
  try {
    const catalog = await getOperators();
    operators = catalog.entities;
    operatorCatalogStatus = "available";
  } catch {
    // Deliberately omit provider errors and request URLs from smoke output.
  }
  const operator = findVtaOperator(operators);
  let routes: Entity[] = [];
  let stops: Entity[] = [];
  if (operator) {
    try {
      [routes, stops] = await Promise.all([
        getEntities("routes", operator.id).then((result) => result.entities),
        getEntities("stops", operator.id).then((result) => result.entities),
      ]);
    } catch {
      // A partial catalog is not reported as a verified live sample.
    }
  }
  let vta: Record<string, unknown> | null = null;
  try {
    vta = (await getVtaContext("22", "Santa Clara Transit Center")).snapshot;
  } catch {
    vta = { status: "unavailable", verifiedFields: null, routes: [], stops: [] };
  }
  return {
    operatorCatalogStatus,
    operatorCatalogHttpStatus: last511HttpStatus,
    verifiedOperatorId: operator?.id ?? null,
    operatorName: operator?.name ?? null,
    routeSample: routes.slice(0, 3).map(({ id, name }) => ({ id, name })),
    stopSample: stops.slice(0, 3).map(({ id, name }) => ({ id, name })),
    vtaDatasetTitle: VTA_TITLE,
    vtaSourceUrl: VTA_SOURCE_URL,
    vtaResourceUrl: VTA_RESOURCE,
    vtaSnapshot: vta,
  };
}