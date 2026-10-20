import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  canAccessRoute,
  createAccessCookieValue,
  getAccessSessionRole,
} from "./access-session.ts";

const config = {
  reporterPasscode: "3141",
  reviewerPasscode: "8276",
  classroomPasscode: "5924",
  sessionSecret: "isolated-access-session-test-secret",
};

test("signed sessions retain their own least-privilege role and expire", () => {
  const expiresAt = Date.now() + 60_000;
  const reporterCookie = createAccessCookieValue(expiresAt, config, "reporter");
  const reviewerCookie = createAccessCookieValue(expiresAt, config, "reviewer");
  const classroomCookie = createAccessCookieValue(expiresAt, config, "classroom");

  assert.equal(getAccessSessionRole(reporterCookie, config), "reporter");
  assert.equal(getAccessSessionRole(reviewerCookie, config), "reviewer");
  assert.equal(getAccessSessionRole(classroomCookie, config), "classroom");
  assert.equal(getAccessSessionRole(reporterCookie, { ...config, reviewerPasscode: "9201" }), "reporter");
  assert.equal(getAccessSessionRole(reviewerCookie, { ...config, reporterPasscode: "9201" }), "reviewer");
  assert.equal(getAccessSessionRole(reporterCookie, { ...config, reporterPasscode: "9201" }), null);
  assert.equal(getAccessSessionRole(reviewerCookie, { ...config, reviewerPasscode: "9201" }), null);
  assert.equal(getAccessSessionRole(reviewerCookie, { ...config, reviewerPasscode: null }), null);
  assert.equal(getAccessSessionRole(classroomCookie, { ...config, classroomPasscode: null }), null);
  assert.equal(getAccessSessionRole(reviewerCookie, config, expiresAt), null);
  assert.match(reporterCookie, /^\d+\.reporter\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
  assert.match(reviewerCookie, /^\d+\.reviewer\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
  assert.match(classroomCookie, /^\d+\.classroom\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(getAccessSessionRole(`${expiresAt}.reviewer.${reporterCookie.split(".").at(-1)}`, config), null);
});

test("pre-role signed sessions remain reporter-only during the rollout", () => {
  const expiresAt = Date.now() + 60_000;
  const signature = createHmac("sha256", config.sessionSecret)
    .update(String(expiresAt))
    .digest("base64url");
  assert.equal(getAccessSessionRole(`${expiresAt}.${signature}`, config), "reporter");
});

test("API permissions separate report submission from saved-report review", () => {
  assert.equal(canAccessRoute("reporter", "POST", "/submissions"), true);
  assert.equal(canAccessRoute("reporter", "GET", "/transit/matches"), true);
  assert.equal(canAccessRoute("reporter", "POST", "/transit/request"), true);
  assert.equal(canAccessRoute("reporter", "PATCH", "/submissions/example/response-status"), false);
  assert.equal(canAccessRoute("reporter", "GET", "/submissions"), false);
  assert.equal(canAccessRoute("reporter", "GET", "/reports"), false);
  assert.equal(canAccessRoute("classroom", "POST", "/submissions"), true);
  assert.equal(canAccessRoute("classroom", "GET", "/transit/matches"), true);
  assert.equal(canAccessRoute("classroom", "GET", "/submissions"), false);
  assert.equal(canAccessRoute("classroom", "PATCH", "/submissions/example/response-status"), false);
  assert.equal(canAccessRoute("classroom", "GET", "/reports"), false);
  assert.equal(canAccessRoute("reviewer", "GET", "/submissions"), true);
  assert.equal(canAccessRoute("reviewer", "PATCH", "/submissions/example/response-status"), true);
  assert.equal(canAccessRoute("reviewer", "POST", "/transit/request"), false);
  assert.equal(canAccessRoute("reviewer", "POST", "/submissions"), false);
  assert.equal(canAccessRoute("reviewer", "GET", "/transit/matches"), false);
  assert.equal(canAccessRoute("reviewer", "GET", "/reports"), false);
  assert.equal(canAccessRoute("reviewer", "GET", "/healthz"), true);
});