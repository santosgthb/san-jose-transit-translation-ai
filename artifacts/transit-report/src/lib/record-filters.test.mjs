import assert from "node:assert/strict";
import test from "node:test";
import { filterReports } from "./record-filters.ts";

const reports = [
  {
    reference: "VTA-C2E03404", language: "en", inputIsSynthetic: false,
    inputSource: "rider-submitted input", sfBay511DataUsed: true,
    responseKind: "ai_generated", staffResponseSent: true, description: "The bus had [242] printed on its stop sign and was crowded.",
  },
  {
    reference: "VTA-B2420100", language: "vi", inputIsSynthetic: true,
    inputSource: "synthetic classroom test", sfBay511DataUsed: true,
    responseKind: "ai_generated", description: "Test [242] report.",
  },
  {
    reference: "VTA-A1112222", language: "es", inputSource: "legacy input; classification not recorded",
    sfBay511DataUsed: false, responseKind: "legacy_fixed", description: "Imported report.",
  },
  {
    reference: "VTA-D1357913", language: "pa", inputIsSynthetic: false,
    inputSource: "rider-submitted input", sfBay511DataUsed: false,
    responseKind: "context_only", description: "Could not verify.",
  },
];

const filter = (reference = "", source = "any", language = "any") => ({
  reference, source, language,
});

test("report number search is case-insensitive and supports partial references", () => {
  assert.deepEqual(filterReports(reports, filter("vta-c2e")), [reports[0]]);
});

test("source filters use explicit input origin, 511 usage, and AI response type separately", () => {
  assert.deepEqual(filterReports(reports, filter("", "rider")), [reports[0], reports[3]]);
  assert.deepEqual(filterReports(reports, filter("", "511")), [reports[0], reports[1]]);
  assert.deepEqual(filterReports(reports, filter("", "ai")), [reports[0], reports[1]]);
});

test("filters combine and synthetic or unclassified submissions are not labeled rider-submitted", () => {
  assert.deepEqual(filterReports(reports, filter("04", "rider", "en")), [reports[0]]);
  assert.deepEqual(filterReports(reports, filter("", "rider", "vi")), []);
  assert.deepEqual(filterReports(reports, filter("", "any", "es")), [reports[2]]);
  assert.deepEqual(filterReports(reports, filter("not-a-report", "any", "any")), []);
});

test("staff response status is separate from an automated response and combines with other filters", () => {
  assert.deepEqual(filterReports(reports, { ...filter(), responseStatus: "responded" }), [reports[0]]);
  assert.deepEqual(filterReports(reports, { ...filter(), responseStatus: "not_responded" }), reports.slice(1));
  assert.deepEqual(filterReports(reports, { ...filter("", "ai", "vi"), responseStatus: "not_responded" }), [reports[1]]);
});

test("safety and accessibility reports remain visible in the rider filter despite synthetic markers", () => {
  const priorityReports = [
    {
      reference: "VTA-SAFETY1", language: "en", issueCategory: "safety",
      inputIsSynthetic: true, inputSource: "rider-submitted input",
      dataSource: "synthetic data", description: "A rider reports a broken station exit light.",
    },
    {
      reference: "VTA-ACCESS1", language: "en", issueCategory: "accessibility",
      inputIsSynthetic: false, inputSource: "rider-submitted input",
      dataSource: "synthetic data", description: "A rider reports a blocked wheelchair ramp.",
    },
  ];
  assert.deepEqual(filterReports(priorityReports, filter("", "rider")), priorityReports);
});