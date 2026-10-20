// An isolated server and one disposable fixture; no AI or transit API calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireDb = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
const { Client } = requireDb("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
const id = randomUUID();
const base = "http://127.0.0.1:18810/api";
const server = spawn(process.execPath, ["dist/index.mjs"], {
  cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: "ignore",
  env: { ...process.env, PORT: "18810", NODE_ENV: "production",
    TRANSIT_REPORT_PASSCODE: "1357", TRANSIT_REPORT_REVIEW_PASSCODE: "2468",
    SESSION_SECRET: "isolated-response-status-test-only" },
});
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  await client.connect();
  await client.query(`INSERT INTO rider_submissions
    (id, reference, description, language, assistant_response, data_source)
    VALUES ($1,$2,$3,'en',$4,'synthetic data')`,
    [id, `TEST-${id}`, "Disposable staff-status test", "Automated summary, not a staff reply"]);
  const headersFor = async (role, passcode) => {
    const response = await fetch(`${base}/access/unlock`, { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ role, passcode }) });
    assert.equal(response.status, 200);
    return { cookie: response.headers.get("set-cookie").split(";")[0], "content-type": "application/json" };
  };
  const reporter = await headersFor("reporter", "1357");
  const reviewer = await headersFor("reviewer", "2468");
  const lookups = ["I missed the 9:55 at Winchester. When’s the next one?", "Is Route 22 delayed?", "When is the next light rail from Diridon?"];
  const before = await client.query("SELECT count(*) AS count FROM rider_submissions");
  for (const message of [...lookups, "The bus never showed up.", "The wheelchair ramp was broken.", "There was no shelter at my stop."]) {
    const response = await fetch(`${base}/transit/classify`, { method: "POST", headers: reporter,
      body: JSON.stringify({ message, language: "en" }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).intent, lookups.includes(message) ? "transit_lookup" : "issue_report");
  }
  for (const description of lookups) {
    const rejected = await fetch(`${base}/submissions`, { method: "POST", headers: reporter,
      body: JSON.stringify({ description, language: "en", imageName: null }) });
    assert.equal(rejected.status, 409, "Information requests must never enter report persistence");
  }
  const after = await client.query("SELECT count(*) AS count FROM rider_submissions");
  assert.equal(after.rows[0].count, before.rows[0].count);
  console.log("PASS: intent endpoint and backend persistence guard; lookup questions created no reports");
  const url = `${base}/submissions/${id}/response-status`;
  const patch = (headers, value) => fetch(url, { method: "PATCH", headers, body: JSON.stringify(value) });
  assert.equal((await patch({ "content-type": "application/json" }, { staffResponseSent: true })).status, 401);
  assert.equal((await patch(reporter, { staffResponseSent: true })).status, 403);
  assert.equal((await patch(reviewer, { staffResponseSent: "true" })).status, 400);
  const history = async () => {
    const response = await fetch(`${base}/submissions`, { headers: reviewer });
    assert.equal(response.status, 200);
    return (await response.json()).find(row => row.id === id);
  };
  assert.equal((await history()).staffResponseSent, false);
  assert.equal((await patch(reviewer, { staffResponseSent: true })).status, 200);
  assert.equal((await history()).staffResponseSent, true);
  assert.equal((await patch(reviewer, { staffResponseSent: false })).status, 200);
  const saved = await history();
  assert.equal(saved.staffResponseSent, false);
  assert.equal(saved.assistantResponse, "Automated summary, not a staff reply");
  assert.equal((await fetch(`${base}/submissions/missing-test-report/response-status`, {
    method: "PATCH", headers: reviewer, body: JSON.stringify({ staffResponseSent: true }),
  })).status, 404);
  console.log("PASS: reviewer-only status, validation, persistence, undo, and unchanged automated response");
} finally {
  server.kill("SIGTERM");
  try { await client.query("DELETE FROM rider_submissions WHERE id=$1", [id]); }
  finally { await client.end(); }
}