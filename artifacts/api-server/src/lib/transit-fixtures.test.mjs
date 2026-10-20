import assert from "node:assert/strict";
import test from "node:test";
import { transitTestHelpers } from "./transit-provider.ts";

const {
  entityList,
  findVtaOperator,
  normalizeAlerts,
  normalizeArrivals,
  arrivalResponseDiagnostics,
  verifiedStopCode,
  buildVtaSnapshot,
  notRequestedVtaSnapshot,
  collectArcGisRows,
} = transitTestHelpers;

test("511 operator and route fixtures retain provider IDs and names", () => {
  const operators = entityList(
    {
      content: [
        { Id: "vta-actual-fixture-id", Name: "Santa Clara Valley Transportation Authority" },
        { Id: "other", Name: "Other Operator" },
      ],
    },
    "operator",
  );
  assert.equal(findVtaOperator(operators)?.id, "vta-actual-fixture-id");
  assert.deepEqual(
    entityList({
      content: [{
        Id: "BA:BAY PT/SFIA",
        Name: "Pittsburg/Bay Point to San Francisco International Airport",
        SiriLineRef: "722",
        Monitored: "true",
      }],
    }, "route").map(
      ({ id, name }) => ({ id, name }),
    ),
    [{ id: "BA:BAY PT/SFIA", name: "Pittsburg/Bay Point to San Francisco International Airport" }],
  );
});

test("official nested ScheduledStopPoint fixture resolves only verified stop ids", () => {
  const stops = entityList({
    Contents: {
      dataObjects: {
        id: "SB",
        ScheduledStopPoint: [
          { id: "2455444", Name: "San Francisco Ferry Building" },
          { id: "890001", Name: "San Francisco Ferry Building (Gate E)" },
        ],
      },
    },
  }, "stop");
  assert.deepEqual(stops.map(({ id, name }) => ({ id, name })), [
    { id: "2455444", name: "San Francisco Ferry Building" },
    { id: "890001", name: "San Francisco Ferry Building (Gate E)" },
  ]);
  assert.equal(verifiedStopCode(stops[0]), null);
  const mappedStop = entityList({
    Stops: [{ id: "stop-entity-id", StopCode: "44003", Name: "San Rafael Transit Center" }],
  }, "stop")[0];
  assert.equal(mappedStop.id, "stop-entity-id");
  assert.equal(verifiedStopCode(mappedStop), "44003");
});

test("non-unique VTA operator matches are not resolved", () => {
  assert.equal(
    findVtaOperator([
      { id: "one", name: "VTA Santa Clara Valley Transportation Authority" },
      { id: "two", name: "Santa Clara Valley Transportation Authority (test)" },
    ]),
    undefined,
  );
});

test("StopMonitoring fixture preserves predicted and aimed arrival timestamps", () => {
  const expected = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const aimed = new Date(Date.now() + 11 * 60 * 1000).toISOString();
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const arrivals = normalizeArrivals({
    Siri: {
      ServiceDelivery: {
        StopMonitoringDelivery: [
          {
            MonitoredStopVisit: {
              RecordedAtTime: new Date().toISOString(),
              MonitoringRef: "stop-1",
              MonitoredVehicleJourney: {
                LineRef: "siri-line-22",
                PublishedLineName: "22",
                DestinationName: "Eastridge",
                Monitored: true,
                MonitoredCall: {
                  StopPointRef: "stop-1",
                  ExpectedArrivalTime: expected,
                  AimedArrivalTime: aimed,
                },
              },
            },
          },
        ],
      },
    },
  }, "stop-1", new Set(["siri-line-22"]));
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0].lineId, "siri-line-22");
  assert.equal(arrivals[0].destination, "Eastridge");
  assert.equal(arrivals[0].expectedArrivalTime, expected);
  assert.equal(arrivals[0].aimedArrivalTime, aimed);
  assert.equal(arrivals[0].monitored, true);
});

test("StopMonitoring excludes stale, wrong-stop, and unknown-route visits", () => {
  const visit = (monitoringRef, lineRef, expectedArrivalTime, recordedAtTime = new Date().toISOString()) => ({
    RecordedAtTime: recordedAtTime,
    MonitoringRef: monitoringRef,
    MonitoredVehicleJourney: {
      LineRef: lineRef,
      PublishedLineName: lineRef,
      Monitored: "false",
      MonitoredCall: {
        StopPointRef: monitoringRef,
        ExpectedArrivalTime: expectedArrivalTime,
      },
    },
  });
  const results = normalizeArrivals({
    Siri: {
      ServiceDelivery: {
        StopMonitoringDelivery: {
          MonitoredStopVisit: [
            visit("selected-stop", "known-line", new Date(Date.now() + 5 * 60_000).toISOString()),
            visit("other-stop", "known-line", new Date(Date.now() + 5 * 60_000).toISOString()),
            visit("selected-stop", "unknown-line", new Date(Date.now() + 5 * 60_000).toISOString()),
            visit("selected-stop", "known-line", new Date(Date.now() - 5 * 60_000).toISOString()),
            visit("selected-stop", "known-line", new Date(Date.now() + 5 * 60_000).toISOString(), new Date(Date.now() - 60 * 60_000).toISOString()),
          ],
        },
      },
    },
  }, "selected-stop", new Set(["known-line"]));
  assert.equal(results.length, 1);
  assert.equal(results[0].monitored, false);
});

test("agency-only StopMonitoring diagnostics retain raw counts and exact stop references", () => {
  const payload = {
    Siri: {
      ServiceDelivery: {
        StopMonitoringDelivery: {
          MonitoredStopVisit: [
            {
              MonitoringRef: "65843",
              MonitoredVehicleJourney: {
                LineRef: "22",
                MonitoredCall: { StopPointRef: "65843" },
              },
            },
            {
              MonitoringRef: "different-stop",
              MonitoredVehicleJourney: {
                LineRef: "22",
                MonitoredCall: { StopPointRef: "different-stop" },
              },
            },
          ],
        },
      },
    },
  };
  const diagnostics = arrivalResponseDiagnostics(payload, "65843", new Set(["22"]));
  assert.equal(diagnostics.sourceRecordCount, 2);
  assert.equal(diagnostics.matchingStopRecordCount, 1);
  assert.equal(diagnostics.matchingStopAndRouteRecordCount, 1);
  assert.equal(diagnostics.matchingStopSamples[0].routeAliasMatch, true);
  assert.deepEqual(diagnostics.observedStopRefs, ["65843", "different-stop"]);
  assert.deepEqual(diagnostics.observedLineRefs, ["22"]);
  assert.ok(diagnostics.sourceResponseKeys.includes("Siri"));
  assert.ok(diagnostics.sourceCallKeys.includes("StopPointRef"));
});

test("GTFS ServiceAlerts JSON fixture normalizes translations, epoch periods, and agency scope", () => {
  const alerts = normalizeAlerts(
    {
      Header: { GtfsRealtimeVersion: "1.0", Timestamp: Math.floor(Date.now() / 1000) },
      Entities: [
        {
          Id: "alert-route-22",
          Alert: {
            ActivePeriods: [{
              Start: Math.floor(Date.now() / 1000) - 60,
              End: Math.floor(Date.now() / 1000) + 3600,
            }],
            InformedEntities: [{ AgencyId: "vta", Trip: { RouteId: "22" } }],
            Url: { Translations: [{ Text: "https://example.org/notice?ref=public", Language: "en" }] },
            HeaderText: { Translations: [{ Text: "Route 22 detour", Language: "en" }] },
            DescriptionText: { Translations: [{ Text: "Temporary street closure.", Language: "en" }] },
          },
        },
        {
          Id: "unrelated",
          Alert: {
            ActivePeriods: [{
              Start: Math.floor(Date.now() / 1000) - 60,
              End: Math.floor(Date.now() / 1000) + 3600,
            }],
            InformedEntities: [{ AgencyId: "vta", Trip: { RouteId: "99" } }],
            HeaderText: { Translations: [{ Text: "Another route", Language: "en" }] },
          },
        },
      ],
    },
    "22",
    "stop-1",
    "vta",
  );
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, "alert-route-22");
  assert.deepEqual(alerts[0].routeIds, ["22"]);
  assert.equal(alerts[0].url, "https://example.org/notice");
});

test("VTA snapshots filter the same cached source independently and numeric routes match exactly", () => {
  const sharedSource = {
    verifiedLayers: { routes: "Routes_October_2025", stops: "Bus_LightRail_Stops" },
    verifiedFields: {},
    rows: {
      routes: [
        { lineid: 23875, lineabbr: "22", linename: "PALO ALTO - EASTRIDGE", category: "Frequent" },
        { lineid: 23896, lineabbr: "522", linename: "PALO ALTO - EASTRIDGE", category: "Rapid" },
        { lineid: 23920, lineabbr: "822", linename: "GRAY LINE", category: "Local" },
      ],
      stops: [
        { objectid: 1, stopname: "Santa Clara Transit Center", routes: "22", linedirid: "238750", rtid: 60001 },
        { objectid: 2, stopname: "Sunnyvale Transit Center", routes: "522", linedirid: "238960", rtid: 60008 },
      ],
    },
  };
  const report22 = buildVtaSnapshot(sharedSource, "22", undefined, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
  const reportSunnyvale = buildVtaSnapshot(sharedSource, undefined, "Sunnyvale", "2026-01-01T00:00:00.000Z", "2026-01-03T00:00:00.000Z");
  const blankReport = buildVtaSnapshot(sharedSource, undefined, undefined, "2026-01-01T00:00:00.000Z", "2026-01-04T00:00:00.000Z");
  assert.deepEqual(report22.routes.map((route) => route.lineAbbr), ["22"]);
  assert.deepEqual(report22.stops, []);
  assert.deepEqual(reportSunnyvale.routes, []);
  assert.deepEqual(reportSunnyvale.stops.map((stop) => stop.stopName), ["Sunnyvale Transit Center"]);
  assert.equal(reportSunnyvale.stops[0].rtid, 60008);
  assert.equal("routeId" in reportSunnyvale.stops[0], false);
  assert.deepEqual(blankReport.routes, []);
  assert.deepEqual(blankReport.stops, []);
  assert.deepEqual(notRequestedVtaSnapshot().routes, []);
});

test("ArcGIS fixture pagination advances offsets and rejects bounded incomplete results", async () => {
  const offsets = [];
  const rows = await collectArcGisRows(2, async (offset, count) => {
    offsets.push([offset, count]);
    if (offset === 0) {
      return {
        features: [{ attributes: { objectid: 1 } }, { attributes: { objectid: 2 } }],
        exceededTransferLimit: true,
      };
    }
    return { features: [{ attributes: { objectid: 3 } }], exceededTransferLimit: false };
  });
  assert.deepEqual(offsets, [[0, 2], [2, 2]]);
  assert.deepEqual(rows.map((row) => row.objectid), [1, 2, 3]);

  await assert.rejects(
    collectArcGisRows(
      1,
      async (offset) => ({
        features: [{ attributes: { objectid: offset + 1 } }],
        exceededTransferLimit: true,
      }),
      2,
    ),
    /features were incomplete.*bounded limit/,
  );
});