import type { TransitRequestInput, TransitRequestResult, TransitDeparture } from "@workspace/api-zod";
import { getDeparturePayload, getTransitReference, type TransitEntity } from "./transit-provider";
import { classifyInputIntent } from "./transit-intent";
export { classifyInputIntent } from "./transit-intent";

const TZ = "America/Los_Angeles";
type Language = TransitRequestInput["language"];
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): string => typeof v === "string" || typeof v === "number" ? String(v).replace(/[\u0000-\u001f]/g, " ").slice(0, 200).trim() : "";
const alias = (s: string) => norm(s.replace(/\s*\((?:bay|platform)[^)]*\)/gi, "").replace(/\b(station|stn|light rail)\b/gi, "").replace(/^San Jose\s+/i, ""));
const wordsContain = (a: string, b: string) => !!b && ` ${a} `.includes(` ${b} `);

function localParts(now: number) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(p => [p.type, p.value]));
}
export function localInstant(date: string, hour: number, minute: number, second = 0) {
  const target = Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}Z`);
  let result = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(result);
    const actual = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    result += target - actual;
  }
  return result;
}

export function parseTransitMessage(message: string, now = Date.now()) {
  const p = localParts(now);
  const date = `${p.year}-${p.month}-${p.day}`;
  const intent = classifyInputIntent(message) === "transit_lookup" ? "next_departure" : "other";
  const mode = /light\s*rail|train|tram|metro|tren|tàu|ਰੇਲ/iu.test(message) ? "light_rail"
    : /bus|autob[uú]s|xe buýt|ਬੱਸ/iu.test(message) ? "bus" : null;
  const stationMatch = message.match(/(?:\bfrom|\bat|\bdesde|\ben|\btừ|\bở)\s+([^\d?.!,]+?)(?=\s+(?:was|when|is|were|estaba)\b|[?.!,]|$)/iu);
  const station_name = stationMatch?.[1].trim() ?? null;
  const route = message.match(/\b(?:route|bus|line|tuyến|ruta)\s+(\d{1,3}[a-z]?)\b/iu)?.[1]
    ?? message.match(/\b((?:green|blue|orange)\s+line)\b/i)?.[1] ?? null;
  const direction = message.match(/\b(?:towards?|heading to|bound for|hacia|đến)\s+([^?.!]+)/iu)?.[1].trim()
    ?? message.match(/\b(northbound|southbound|eastbound|westbound)\b/i)?.[1] ?? null;
  const times = [...message.matchAll(/\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?\b/gi)];
  const departureTimes = times.filter(t => /departure|train|bus|rail|miss|salida|chuyến/iu.test(message.slice(Math.max(0, t.index! - 28), t.index)));
  const clock = departureTimes.at(-1) ?? times.at(-1);
  let referenced_time: string | null = null;
  let timeAmbiguous = false;
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2]);
    const meridiem = clock[3]?.toLowerCase().replace(/\./g, "");
    // Rider shorthand in this flow defaults to AM; explicit PM is preserved.
    if (minute < 60 && hour < 24 && (!meridiem || (hour >= 1 && hour <= 12))) {
      if (meridiem) hour = hour % 12 + (meridiem === "pm" ? 12 : 0);
      else if (hour === 12) hour = 0;
      referenced_time = new Date(localInstant(date, hour, minute)).toISOString();
    } else timeAmbiguous = true;
  } else {
    const ago = message.match(/\b(\d{1,3})\s+minutes?\s+ago\b/i);
    if (ago) referenced_time = new Date(now - Number(ago[1]) * 60_000).toISOString();
  }
  return {
    intent, mode, station_name, route, direction, referenced_time, timeAmbiguous,
    requested_departure_count: Math.min(5, Math.max(1, Number(message.match(/\bnext\s+(\d)\b/i)?.[1] ?? 1))),
    date,
  };
}

type Departure = TransitDeparture & { stopId: string; lineId: string; directionRef: string };
function routeMode(route: TransitEntity): string {
  const mode = text(route.raw?.TransportMode);
  return /metro|rail|tram/i.test(mode) ? "light_rail" : /bus/i.test(mode) ? "bus" : "unknown";
}
function countJourneyRows(value: unknown, source: "live" | "scheduled", depth = 0): number {
  if (depth > 20 || !value || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.reduce((total, v) => total + countJourneyRows(v, source, depth + 1), 0);
  const node = obj(value);
  if (node[source === "live" ? "MonitoredVehicleJourney" : "TargetedVehicleJourney"]) return 1;
  return Object.values(node).reduce<number>((total, v) => total + countJourneyRows(v, source, depth + 1), 0);
}
export function decodeDepartures(value: unknown, stopId: string, routes: TransitEntity[], source: "live" | "scheduled", retrievedAt: string, operatorId: string, now = Date.now()): Departure[] {
  const results: Departure[] = [];
  const walk = (node: unknown, depth = 0): void => {
    if (depth > 20) return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return; }
    const visit = obj(node);
    const journey = obj(visit[source === "live" ? "MonitoredVehicleJourney" : "TargetedVehicleJourney"]);
    const call = obj(journey[source === "live" ? "MonitoredCall" : "TargetedCall"]);
    if (Object.keys(journey).length) {
      const refs = [text(visit.MonitoringRef), text(call.StopPointRef)].filter(Boolean);
      if (!refs.length || !refs.every(ref => ref === stopId)) return;
      if (journey.OperatorRef && text(journey.OperatorRef) !== operatorId) return;
      if (/cancel/i.test(text(call.DepartureStatus) + text(journey.JourneyStatus))) return;
      if (/noBoarding|notAllowed/i.test(text(call.BoardingActivity))) return;
      const lineId = text(journey.LineRef);
      const route = routes.find(r => [r.id, text(r.raw?.SiriLineRef), text(r.raw?.PublicCode)].filter(Boolean).includes(lineId));
      if (!route) return; // Do not attribute an unverified line to VTA.
      if (source === "live") {
        const recorded = Date.parse(text(visit.RecordedAtTime));
        if (journey.Monitored !== true && journey.Monitored !== "true") return;
        if (!Number.isFinite(recorded) || recorded < now - 30 * 60_000 || recorded > now + 60_000) return;
      }
      const rawTime = text(call[source === "live" ? "ExpectedDepartureTime" : "AimedDepartureTime"]);
      if (!rawTime) return; // Arrival times are not departure times.
      let time = Date.parse(rawTime);
      if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawTime)) {
        const t = rawTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (!t) return;
        time = localInstant(t[1], Number(t[2]), Number(t[3]), Number(t[4] ?? 0));
      }
      if (!Number.isFinite(time)) return;
      // Journey endpoints can be internal sidings. A rider-facing headsign is
      // authoritative when present; never direct riders to a non-public track.
      const direction = text(call.DestinationDisplay) || text(journey.VehicleJourneyName) || text(journey.DestinationName);
      if (/not a public stop|pocket track|car barn/i.test(direction)) return;
      results.push({
        dateTime: new Date(time), stopId, lineId: route.id,
        route: text(route.raw?.PublicCode) || route.name,
        direction,
        directionRef: text(journey.DirectionRef), source, retrievedAt: new Date(retrievedAt),
      });
      return;
    }
    Object.values(visit).filter(v => v && typeof v === "object").forEach(v => walk(v, depth + 1));
  };
  walk(value);
  return results;
}

const messages = {
  en: { station: "Which station are you leaving from?", direction: "Which direction are you heading?", time: "Did you mean AM or PM? Please add it to your question.", unsupported: "Ask about the next bus or light rail departure, including the station name.", unavailable: "I couldn’t verify departures right now. No departure time has been estimated.", noDepartures: "No later departures were returned for this service today. This does not confirm a cancellation.", live: "Live VTA data", scheduled: "Realtime information is unavailable for this result; this is based on the schedule, not live vehicle data.", next: "Next departure", checked: "Last checked", toward: "toward", after: "after" },
  vi: { station: "Bạn khởi hành từ ga nào?", direction: "Bạn đi theo hướng hoặc tuyến nào?", time: "Bạn muốn nói giờ sáng hay chiều? Hãy thêm vào câu hỏi.", unsupported: "Hãy hỏi về chuyến xe buýt hoặc tàu tiếp theo và nêu tên ga.", unavailable: "Hiện không thể xác minh giờ khởi hành. Không có giờ nào được ước tính.", noDepartures: "Không tìm thấy chuyến muộn hơn của tuyến này hôm nay. Điều này không xác nhận chuyến bị hủy.", live: "Dữ liệu VTA trực tiếp", scheduled: "Không có dữ liệu trực tiếp cho kết quả này; đây là lịch trình, không phải dữ liệu xe trực tiếp.", next: "Chuyến tiếp theo", checked: "Kiểm tra lúc", toward: "hướng đến", after: "sau" },
  es: { station: "¿De qué estación sale?", direction: "¿En qué dirección o servicio viaja?", time: "¿Se refiere a AM o PM? Añádalo a su pregunta.", unsupported: "Pregunte por la próxima salida de autobús o tren ligero e incluya la estación.", unavailable: "No pude verificar las salidas ahora. No se ha estimado ninguna hora.", noDepartures: "No se devolvieron salidas posteriores para este servicio hoy. Esto no confirma una cancelación.", live: "Datos de VTA en vivo", scheduled: "No hay información en tiempo real para este resultado; se basa en el horario, no en datos del vehículo en vivo.", next: "Próxima salida", checked: "Última consulta", toward: "hacia", after: "después de" },
  pa: { station: "ਤੁਸੀਂ ਕਿਹੜੇ ਸਟੇਸ਼ਨ ਤੋਂ ਜਾ ਰਹੇ ਹੋ?", direction: "ਤੁਸੀਂ ਕਿਹੜੀ ਦਿਸ਼ਾ ਜਾਂ ਸੇਵਾ ਵਿੱਚ ਜਾ ਰਹੇ ਹੋ?", time: "ਕੀ ਤੁਹਾਡਾ ਮਤਲਬ AM ਜਾਂ PM ਹੈ? ਸਵਾਲ ਵਿੱਚ ਸ਼ਾਮਲ ਕਰੋ।", unsupported: "ਅਗਲੀ ਬੱਸ ਜਾਂ ਲਾਈਟ ਰੇਲ ਬਾਰੇ ਪੁੱਛੋ ਅਤੇ ਸਟੇਸ਼ਨ ਦਾ ਨਾਮ ਦਿਓ।", unavailable: "ਹੁਣ ਰਵਾਨਗੀ ਦੀ ਪੁਸ਼ਟੀ ਨਹੀਂ ਹੋ ਸਕੀ। ਕੋਈ ਸਮਾਂ ਅੰਦਾਜ਼ਾ ਨਹੀਂ ਲਗਾਇਆ ਗਿਆ।", noDepartures: "ਅੱਜ ਇਸ ਸੇਵਾ ਲਈ ਬਾਅਦ ਦੀ ਕੋਈ ਰਵਾਨਗੀ ਨਹੀਂ ਮਿਲੀ। ਇਹ ਰੱਦ ਹੋਣ ਦੀ ਪੁਸ਼ਟੀ ਨਹੀਂ ਹੈ।", live: "ਲਾਈਵ VTA ਡੇਟਾ", scheduled: "ਇਸ ਨਤੀਜੇ ਲਈ ਲਾਈਵ ਜਾਣਕਾਰੀ ਨਹੀਂ ਹੈ; ਇਹ ਸਮਾਂ-ਸਾਰਣੀ ਹੈ, ਲਾਈਵ ਵਾਹਨ ਡੇਟਾ ਨਹੀਂ।", next: "ਅਗਲੀ ਰਵਾਨਗੀ", checked: "ਆਖਰੀ ਜਾਂਚ", toward: "ਵੱਲ", after: "ਤੋਂ ਬਾਅਦ" },
};
const locales: Record<Language, string> = { en: "en-US", vi: "vi-VN", es: "es-US", pa: "pa-IN" };
const formatted = (time: string | Date, language: Language) => new Intl.DateTimeFormat(locales[language], { timeZone: TZ, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(time));
type Dependencies = { reference: typeof getTransitReference; payload: typeof getDeparturePayload; now: () => number };

export async function resolveRiderRequest(input: TransitRequestInput, dependencies: Partial<Dependencies> = {}): Promise<TransitRequestResult> {
  const deps: Dependencies = { reference: getTransitReference, payload: getDeparturePayload, now: Date.now, ...dependencies };
  const now = deps.now();
  const parsed = parseTransitMessage(input.message, now);
  const t = messages[input.language];
  const debug: Record<string, unknown> = {
    detectedIntent: classifyInputIntent(input.message), detectedTransitMode: parsed.mode,
    extractedIntent: parsed.intent, extractedMode: parsed.mode, extractedStation: parsed.station_name, extractedRoute: parsed.route,
    extractedDirection: parsed.direction, referencedTime: parsed.referenced_time,
    requestedDepartureCount: parsed.requested_departure_count, date: parsed.date, timeZone: TZ,
    resolvedStopIds: [], selectedStationId: null, stationSearchMatches: [], clarificationRequired: false,
    apiRequestStatus: {}, liveApiRequestStatus: [], rawApiResultCount: 0, dataKind: "none", retrievalTimestamp: null,
  };
  const finish = (status: TransitRequestResult["status"], message: string, departures: TransitDeparture[] = [], choices: TransitRequestResult["choices"] = []): TransitRequestResult => {
    debug.clarificationRequired = status === "clarification";
    return { status, message, departures, choices, debug: input.debug ? debug : null };
  };
  if (parsed.intent !== "next_departure") return finish("unavailable", t.unsupported);
  if (parsed.timeAmbiguous) return finish("clarification", t.time);
  let reference: Awaited<ReturnType<typeof getTransitReference>>;
  try { reference = await deps.reference(); }
  catch { debug.apiRequestStatus = { reference: "unavailable" }; return finish("unavailable", t.unavailable); }
  const { routes, operatorId } = reference;
  let query = alias(parsed.station_name ?? "");
  if (!query) {
    const mentioned = reference.stops.map(s => alias(s.name)).filter(a => a.length > 2 && wordsContain(norm(input.message), a)).sort((a, b) => b.length - a.length);
    query = mentioned[0] ?? "";
  }
  if (!query) return finish("clarification", t.station);
  debug.stationSearchPerformed = true;
  debug.stationSearchText = query;
  debug.apiRequestStatus = { reference: "available" };
  let stops = reference.stops.filter(s => alias(s.name).includes(query));
  if (!stops.length) {
    const withinQuery = [...new Set(reference.stops.map(s => alias(s.name)))]
      .filter(a => a.length > 2 && wordsContain(query, a))
      .sort((a, b) => query.indexOf(a) - query.indexOf(b) || b.length - a.length);
    if (withinQuery.length) {
      query = withinQuery[0];
      stops = reference.stops.filter(s => alias(s.name).includes(query));
    }
  }
  const ranked = stops.map(stop => ({ stop, score: (alias(stop.name) === query ? 100 : alias(stop.name).startsWith(query) ? 75 : 50)
    + (/\bstation\b/i.test(stop.name) && !/\b(?:bay|platform)\b/i.test(stop.name) ? 20 : 0) }))
    .sort((a, b) => b.score - a.score || a.stop.name.localeCompare(b.stop.name));
  debug.stationSearchMatches = ranked.map(({ stop, score }) => ({ id: stop.id, name: stop.name, nameScore: score, transitModes: [], selected: false }));
  const exact = ranked.filter(s => s.score >= 100);
  if (exact.length && parsed.mode !== "bus") stops = exact.map(s => s.stop);
  else stops = ranked.slice(0, 8).map(s => s.stop);
  if (!stops.length) return finish("clarification", t.station);
  debug.extractedStation = parsed.station_name ?? stops[0].name;
  debug.resolvedStopIds = stops.map(s => s.id);
  const dayStart = localInstant(parsed.date, 0, 0);
  const startTime = new Date(parsed.referenced_time
    ? Math.max(dayStart, Math.floor(Date.parse(parsed.referenced_time) / 60_000) * 60_000)
    : dayStart).toISOString();
  const endTime = new Date(localInstant(parsed.date, 23, 59, 59)).toISOString();
  const requestStatus: Record<string, unknown> = { reference: "available", scheduled: [], live: [] };
  debug.apiRequestStatus = requestStatus;
  const fetchForStops = async (source: "live" | "scheduled", targets: TransitEntity[]) => {
    const statuses: Array<Record<string, unknown>> = [];
    const rows = await Promise.all(targets.map(async stop => {
      try {
        const data = await deps.payload({ operatorId, stop, source, startTime, endTime });
        const decoded = decodeDepartures(data.value, stop.id, routes, source, data.retrievedAt, operatorId, now);
        const rawCount = countJourneyRows(data.value, source);
        debug.rawApiResultCount = Number(debug.rawApiResultCount) + rawCount;
        const modes = [...new Set(decoded.map(row => routeMode(routes.find(r => r.id === row.lineId)!)))];
        const matches = debug.stationSearchMatches as Array<{id: string; transitModes: string[]; modeScore?: number; selected: boolean}>;
        const match = matches.find(m => m.id === stop.id);
        if (match) {
          match.transitModes = [...new Set([...match.transitModes, ...modes])];
          match.modeScore = parsed.mode && match.transitModes.includes(parsed.mode) ? 100 : 0;
        }
        statuses.push({ stopId: stop.id, httpStatus: data.httpStatus, status: decoded.length ? "available" : "empty",
          retrievedAt: data.retrievedAt, rawApiResultCount: rawCount, acceptedDepartureRows: decoded.length });
        if (!debug.retrievalTimestamp || Date.parse(data.retrievedAt) > Date.parse(String(debug.retrievalTimestamp))) {
          debug.retrievalTimestamp = data.retrievedAt;
        }
        if (decoded.length) debug.dataKind = source;
        return decoded;
      } catch { statuses.push({ stopId: stop.id, httpStatus: null, status: "unavailable" }); return []; }
    }));
    requestStatus[source] = statuses;
    if (source === "live") debug.liveApiRequestStatus = statuses;
    return rows.flat();
  };
  const schedule = await fetchForStops("scheduled", stops);
  const scheduleComplete = (requestStatus.scheduled as Array<{status: string}>).every(s => s.status !== "unavailable");
  let serviceData = schedule;
  let observedOnly = false;
  if (!serviceData.length) { serviceData = await fetchForStops("live", stops); observedOnly = true; }
  let effectiveMode = parsed.mode;
  if (!effectiveMode && !parsed.route && serviceData.length) {
    // Bare station names can refer to both a rail station and numbered bus bays.
    // Infer only when the strongest name matches share one verified line mode.
    const observed = ranked.filter(r => serviceData.some(d => d.stopId === r.stop.id));
    const bestNameScore = Math.max(...observed.map(r => r.score));
    const primaryIds = new Set(observed.filter(r => r.score === bestNameScore).map(r => r.stop.id));
    const primaryModes = [...new Set(serviceData.filter(d => primaryIds.has(d.stopId))
      .map(d => routeMode(routes.find(r => r.id === d.lineId)!)))];
    if (primaryModes.length === 1 && (primaryModes[0] === "light_rail" || primaryModes[0] === "bus")) effectiveMode = primaryModes[0];
  }
  debug.detectedTransitMode = effectiveMode;
  debug.extractedMode = effectiveMode;
  const searchMatches = debug.stationSearchMatches as Array<{transitModes: string[]; nameScore: number; modeScore: number}>;
  searchMatches.forEach(m => { m.modeScore = effectiveMode && m.transitModes.includes(effectiveMode) ? 100 : 0; });
  searchMatches.sort((a, b) => (b.nameScore + b.modeScore) - (a.nameScore + a.modeScore));
  const compatible = (d: Departure) => {
    const route = routes.find(r => r.id === d.lineId)!;
    const mode = text(route.raw?.TransportMode);
    if (effectiveMode === "light_rail" && !/metro|rail|tram/i.test(mode)) return false;
    if (effectiveMode === "bus" && !/bus/i.test(mode)) return false;
    if (parsed.route && ![route.id, text(route.raw?.PublicCode)].some(r => norm(r.replace(/^(?:Rapid|Express)\s+/i, "")) === norm(parsed.route!) || norm(r) === norm(parsed.route!))) return false;
    // A terminating train's arrival at this station isn't an onward departure.
    if (d.direction && alias(d.direction) === alias(stops.find(s => s.id === d.stopId)!.name)) return false;
    return true;
  };
  const serviceKey = (d: Departure) => `${d.lineId}|${norm(d.directionRef)}|${alias(d.direction)}`;
  const services = new Map<string, Departure[]>();
  for (const d of serviceData.filter(d => d.dateTime.getTime() >= dayStart && d.dateTime.getTime() <= Date.parse(endTime) && compatible(d))) {
    if (!d.direction) continue; // Do not offer an unlabeled numeric direction.
    const key = serviceKey(d);
    services.set(key, [...(services.get(key) ?? []), d]);
  }
  const choices = [...services.entries()].map(([id, ds]) => ({ id, label: `${ds[0].route} — ${t.toward} ${ds[0].direction}` }));
  let selectedKey = input.choice;
  if (selectedKey && !services.has(selectedKey)) return finish("clarification", t.direction, [], choices);
  if (!selectedKey && parsed.direction) {
    const matching = [...services.entries()].filter(([, ds]) => {
      const direction = norm(parsed.direction!);
      const cardinal: Record<string, string> = { northbound: "n", southbound: "s", eastbound: "e", westbound: "w" };
      return wordsContain(norm(ds[0].direction), direction) || norm(ds[0].directionRef) === (cardinal[direction] ?? direction);
    });
    if (matching.length === 1) selectedKey = matching[0][0];
  }
  if (!selectedKey && services.size === 1 && !observedOnly && scheduleComplete && !parsed.direction) selectedKey = [...services.keys()][0];
  if (!selectedKey && services.size) return finish("clarification", t.direction, [], choices);
  if (!selectedKey) return finish("unavailable", t.unavailable);
  const service = services.get(selectedKey)!;
  debug.extractedRoute = parsed.route ?? service[0].route;
  debug.extractedDirection = parsed.direction ?? service[0].direction;
  const targetIds = new Set(service.map(d => d.stopId));
  debug.resolvedStopIds = [...targetIds];
  debug.selectedStationId = [...targetIds][0] ?? null;
  debug.detectedTransitMode = effectiveMode ?? routeMode(routes.find(r => r.id === service[0].lineId)!);
  debug.extractedMode = debug.detectedTransitMode;
  (debug.stationSearchMatches as Array<{id: string; selected: boolean}>).forEach(m => { m.selected = targetIds.has(m.id); });
  const liveData = observedOnly ? serviceData : await fetchForStops("live", stops.filter(s => targetIds.has(s.id)));
  const threshold = Math.max(now, parsed.referenced_time ? Date.parse(parsed.referenced_time) : now);
  const valid = (d: Departure) => serviceKey(d) === selectedKey && d.dateTime.getTime() > threshold && d.dateTime.getTime() <= Date.parse(endTime);
  const live = liveData.filter(valid);
  // Prefer live times. Scheduled trips are only a clearly labeled fallback.
  const candidates = (live.length ? live : schedule.filter(valid)).sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  const unique = [...new Map(candidates.map(d => [`${d.lineId}:${d.direction}:${d.dateTime}`, d])).values()].slice(0, parsed.requested_departure_count);
  const departures = unique.map(({ stopId: _s, lineId: _l, directionRef: _r, ...d }) => d);
  if (!departures.length) return finish("no_departures", t.noDepartures);
  const first = departures[0];
  debug.dataKind = first.source;
  debug.retrievalTimestamp = first.retrievedAt.toISOString();
  const after = parsed.referenced_time ? ` (${t.after} ${formatted(parsed.referenced_time, input.language)})` : "";
  const source = first.source === "live" ? t.live : t.scheduled;
  return finish("resolved", `${t.next}${after}: ${formatted(first.dateTime, input.language)} — ${first.route} ${t.toward} ${first.direction}. ${source} ${t.checked}: ${formatted(first.retrievedAt, input.language)}.`, departures);
}